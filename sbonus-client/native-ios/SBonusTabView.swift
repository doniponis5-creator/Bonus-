//
//  SBonusTabView.swift
//  S Bonus — Смарт Центр
//
//  iOS 26 native Liquid Glass tab bar (адаптировано из паттерна Apple
//  iOS-26-by-Examples NewTabView + Capacitor shared-WebView bridge).
//
//  Архитектура: весь React/Next веб-клиент (cabinet.smartcentr.store) живёт
//  в ОДНОМ общем WKWebView (CAPBridgeViewController). Нативный TabView с
//  `Tab(_, systemImage:, value:)` и `.tabBarMinimizeBehavior(.onScrollDown)`
//  рисует НАСТОЯЩИЙ системный Liquid Glass: стеклянную капсулу, тинт,
//  плавающую тень, bounce символов. Веб прячет свой tab bar (window.__nativeBridge)
//  и синхронизирует вкладки через JS-мост.
//
//  Один общий CAPBridgeViewController переезжает между per-tab WebHostVC
//  через addChild/removeFromParent — WKWebView (рендер, JS, React state)
//  переживает переезд.
//

import SwiftUI
import UIKit
import Capacitor
import WebKit

// MARK: - Tabs

enum AppTab: String, CaseIterable, Identifiable, Hashable {
    case home    = "home"
    case game    = "game"
    case wheel   = "wheel"
    case promo   = "promo"
    case profile = "profile"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home:    "Главная"
        case .game:    "Цели"
        case .wheel:   "Удача"
        case .promo:   "Бонусы"
        case .profile: "Профиль"
        }
    }

    var symbol: String {
        switch self {
        case .home:    "house.fill"
        case .game:    "target"
        case .wheel:   "circle.hexagongrid.fill"
        case .promo:   "gift.fill"
        case .profile: "person.fill"
        }
    }
}

enum BarMode: Equatable { case hidden, user }

// MARK: - Shared state

@MainActor
final class TabState: ObservableObject {
    @Published var mode:         BarMode = .hidden
    @Published var selectedUser: AppTab  = .home
    @Published var badge:        Int     = 0
}

enum Haptics {
    static func tabTapped() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
}

// MARK: - Root

@available(iOS 26.0, *)
struct SBonusTabView: View {
    @StateObject private var state = TabState()

    var body: some View {
        Group {
            switch state.mode {
            case .hidden:
                // Логин/регистрация: без tab bar, полноэкранный WebView.
                WebHost(state: state).ignoresSafeArea()
            case .user:
                userTabView
            }
        }
        .background(Color.black)
        .ignoresSafeArea(.all)
        .animation(.spring(response: 0.45, dampingFraction: 0.78), value: state.mode)
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    private var userTabView: some View {
        TabView(selection: userBinding) {
            ForEach(AppTab.allCases) { tab in
                Tab(tab.label, systemImage: tab.symbol, value: tab) {
                    WebHost(state: state).ignoresSafeArea()
                }
                .badge(tab == .wheel ? state.badge : 0)
            }
        }
        .tabViewStyle(.automatic)
        .background(Color.clear)
        .tabBarMinimizeBehavior(.onScrollDown)
    }

    private var userBinding: Binding<AppTab> {
        Binding(
            get: { state.selectedUser },
            set: { newTab in
                guard newTab != state.selectedUser else { return }
                Haptics.tabTapped()
                state.selectedUser = newTab
                SharedBridge.shared.dispatchUserTab(newTab)
            }
        )
    }
}

// MARK: - WebHost (SwiftUI ↔ shared WebView)

@available(iOS 26.0, *)
struct WebHost: UIViewControllerRepresentable {
    @ObservedObject var state: TabState
    func makeUIViewController(context: Context) -> WebHostVC {
        let host = WebHostVC()
        SharedBridge.shared.bind(state: state)
        return host
    }
    func updateUIViewController(_ vc: WebHostVC, context: Context) { vc.adoptShared() }
}

final class WebHostVC: UIViewController {
    override func viewDidLoad() { super.viewDidLoad(); view.backgroundColor = .black; adoptShared() }
    override func viewWillAppear(_ animated: Bool) { super.viewWillAppear(animated); adoptShared() }

    func adoptShared() {
        let bridge = SharedBridge.shared.vc
        if bridge.parent === self { bridge.view.frame = view.bounds; return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isViewLoaded,
                  (self.parent != nil || self.view.window != nil) else { return }
            if bridge.parent != nil {
                bridge.willMove(toParent: nil)
                bridge.view.removeFromSuperview()
                bridge.removeFromParent()
            }
            self.addChild(bridge)
            bridge.view.frame = self.view.bounds
            bridge.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            bridge.view.backgroundColor = .black
            self.view.addSubview(bridge.view)
            bridge.didMove(toParent: self)
            if let wk = SharedBridge.shared.findWebView(in: bridge.view) {
                wk.backgroundColor = .black
                wk.isOpaque = false
                wk.scrollView.backgroundColor = .black
            }
            SharedBridge.shared.attemptInstallHandlers()
        }
    }
}

// MARK: - Singleton bridge: один CAPBridgeViewController на всё приложение

@MainActor
final class SharedBridge {
    static let shared = SharedBridge()
    let vc: CAPBridgeViewController

    private var onUserTabChange: ((AppTab)  -> Void)?
    private var onModeChange:    ((BarMode) -> Void)?
    private var onBadge:         ((Int)     -> Void)?
    private var handlersInstalled = false
    private var lastUserTab: AppTab?
    private var loadObs: NSKeyValueObservation?

    // JS-мост: помечает наличие нативной оболочки + каналы синхронизации.
    private let bridgeJS = """
    (function () {
      if (window.__nativeBridge) return;
      window.__nativeBridge = true;
      window.__setBadge = function (n) { try { webkit.messageHandlers.cartBadge.postMessage(n | 0); } catch (_) {} };
      window.__syncTab  = function (t) { try { webkit.messageHandlers.syncTab.postMessage(String(t)); } catch (_) {} };
    })();
    """

    private init() {
        let sb = UIStoryboard(name: "Main", bundle: nil)
        if let cap = sb.instantiateInitialViewController() as? CAPBridgeViewController {
            self.vc = cap
        } else {
            self.vc = CAPBridgeViewController()
        }
    }

    func bind(state: TabState) {
        onUserTabChange = { [weak state] tab in
            DispatchQueue.main.async { guard let s = state, s.selectedUser != tab else { return }; s.selectedUser = tab }
        }
        onModeChange = { [weak state] mode in
            DispatchQueue.main.async { guard let s = state, s.mode != mode else { return }; s.mode = mode }
        }
        onBadge = { [weak state] n in DispatchQueue.main.async { state?.badge = n } }
    }

    func attemptInstallHandlers() {
        if handlersInstalled { return }
        guard let wv = findWebView(in: vc.view) else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.attemptInstallHandlers() }
            return
        }
        installBridge(on: wv)
    }

    func findWebView(in view: UIView?) -> WKWebView? {
        guard let v = view else { return nil }
        if let wk = v as? WKWebView { return wk }
        for sub in v.subviews { if let f = findWebView(in: sub) { return f } }
        return nil
    }

    private func installBridge(on wv: WKWebView) {
        let uc = wv.configuration.userContentController
        for name in ["cartBadge", "syncTab"] { uc.removeScriptMessageHandler(forName: name) }
        uc.add(MsgHandler { [weak self] m in self?.receive(m) }, name: "cartBadge")
        uc.add(MsgHandler { [weak self] m in self?.receive(m) }, name: "syncTab")
        uc.addUserScript(WKUserScript(source: bridgeJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        wv.evaluateJavaScript(bridgeJS, completionHandler: nil)

        loadObs?.invalidate()
        loadObs = wv.observe(\.isLoading, options: [.new, .old]) { [weak self] webview, change in
            guard let self = self, change.oldValue == true, change.newValue == false else { return }
            webview.evaluateJavaScript(self.bridgeJS, completionHandler: nil)
        }
        handlersInstalled = true
        if let t = lastUserTab { dispatch(userTab: t, into: wv) }
    }

    private func receive(_ msg: WKScriptMessage) {
        switch msg.name {
        case "cartBadge":
            if let n = msg.body as? Int { onBadge?(n) }
            else if let n = msg.body as? Double { onBadge?(Int(n)) }
            else if let s = msg.body as? String, let n = Int(s) { onBadge?(n) }
        case "syncTab":
            guard let s = msg.body as? String else { break }
            if s == "login" || s == "register" || s == "auth" { onModeChange?(.hidden); return }
            onModeChange?(.user)
            if let user = AppTab(rawValue: s) { onUserTabChange?(user) }
        default: break
        }
    }

    func dispatchUserTab(_ tab: AppTab) {
        guard tab != lastUserTab else { return }
        lastUserTab = tab
        guard let wv = findWebView(in: vc.view) else { return }
        dispatch(userTab: tab, into: wv)
    }

    private func dispatch(userTab tab: AppTab, into wv: WKWebView) {
        wv.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('__nativeTabChange', { detail: '\(tab.rawValue)' }));",
            completionHandler: nil
        )
    }
}

private final class MsgHandler: NSObject, WKScriptMessageHandler {
    private let block: (WKScriptMessage) -> Void
    init(_ block: @escaping (WKScriptMessage) -> Void) { self.block = block }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { block(m) }
}
