# S Bonus — Native iOS 26 (Liquid Glass) — Setup

Цель: настоящий **системный Liquid Glass tab bar** на iPhone. Нативная оболочка
(Capacitor) загружает живой веб-клиент `cabinet.smartcentr.store` в один WKWebView,
а `SBonusTabView.swift` рисует нативный iOS 26 TabView. Веб сам прячет свой tab bar
(он уже «native-aware» через `lib/nativeBridge.ts`).

Требуется: **Mac + Xcode 16+ (iOS 26 SDK)**, **Apple Developer аккаунт** ($99/год).

---

## 1. Установить Capacitor (в папке sbonus-client)

```bash
cd sbonus-client
npm install @capacitor/core @capacitor/cli @capacitor/ios
```

`capacitor.config.ts` уже создан (appId `store.smartcentr.bonus`, server.url = живой кабинет).

## 2. Добавить iOS-платформу

```bash
npx cap add ios
npx cap sync ios
```

Создастся `ios/App/App.xcworkspace`.

## 3. Открыть в Xcode

```bash
npx cap open ios
```

- Target → **Minimum Deployments → iOS 26.0**
- Signing & Capabilities → выбрать вашу команду (Apple Developer)

## 4. Добавить нативный tab bar

1. Перетащите `native-ios/SBonusTabView.swift` в проект Xcode (App target, ✅ Copy if needed).
2. Откройте `SceneDelegate.swift` и замените содержимое `scene(_:willConnectTo:)`,
   чтобы корнем окна был SwiftUI-вид (он сам хостит общий CAPBridgeViewController):

```swift
import UIKit
import SwiftUI
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        if #available(iOS 26.0, *) {
            window.rootViewController = UIHostingController(rootView: SBonusTabView())
        } else {
            // fallback: обычный Capacitor WebView без нативного tab bar
            window.rootViewController = CAPBridgeViewController()
        }
        window.backgroundColor = .black
        self.window = window
        window.makeKeyAndVisible()
    }
}
```

> `SharedBridge` берёт `CAPBridgeViewController` из `Main.storyboard`
> (`instantiateInitialViewController`) — стандартный Capacitor-storyboard трогать
> не нужно, просто не делайте его корнем окна (корень — SwiftUI выше).

## 5. Синхронизация режима логина (важно)

Когда пользователь на `/login`, `/register`, `/auth` — tab bar надо скрыть.
В этих страницах вызовите при монтировании:
```ts
import { syncNativeTab } from '@/lib/nativeBridge';
useEffect(() => { syncNativeTab('login'); }, []);
```
А на главной (`page.tsx`) синхронизация вкладок уже подключена.

## 6. Сборка и запуск

- Подключите iPhone (iOS 26) → выберите как target → ▶️ Run.
- Веб-клиент откроется ВНУТРИ нативного Liquid Glass tab bar.
- Для App Store: Product → Archive → Distribute → TestFlight / App Store.

## 7. Иконка и сплэш

```bash
npm install -D @capacitor/assets
# положите icon.png (1024×1024) и splash.png в resources/
npx capacitor-assets generate --ios
```

---

## Как это работает (поток вкладок)

```
Native tab tap → SharedBridge.dispatchUserTab → WKWebView
   → window.dispatchEvent('__nativeTabChange', { detail: 'home' })
   → page.tsx onNativeTabChange → setTab('home')

Web setTab → useEffect → syncNativeTab(tab)
   → webkit.messageHandlers.syncTab → SharedBridge.receive
   → state.selectedUser / mode (.user/.hidden)
```

Веб уже определяет нативную оболочку (`window.__nativeBridge`) и **скрывает свой
HTML tab bar** + PWA-баннер. В обычном браузере/PWA всё работает как раньше.

## Локальная разработка

В `capacitor.config.ts` временно поставьте:
```ts
server: { url: 'http://localhost:3001', cleartext: true, allowNavigation: ['*'] }
```
запустите `npm run dev`, потом `npx cap run ios`.
