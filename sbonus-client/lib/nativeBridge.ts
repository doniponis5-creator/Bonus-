/**
 * Native iOS 26 Liquid Glass shell bridge (Capacitor).
 *
 * Когда веб-клиент работает ВНУТРИ нативной оболочки (Capacitor WKWebView),
 * нативный TabView рисует НАСТОЯЩИЙ iOS 26 Liquid Glass tab bar, а веб
 * прячет свой собственный tab bar и синхронизирует вкладки через мост:
 *   - нативка → веб:  CustomEvent('__nativeTabChange', { detail: 'home' })
 *   - веб → нативка:  webkit.messageHandlers.syncTab.postMessage('home')
 *
 * Все функции — no-op в обычном вебе (PWA/браузер), поэтому безопасны.
 */

type TabCb = (tab: string) => void;

/** Запущены ли мы внутри нативной iOS-оболочки. */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return !!w.__nativeBridge ||
    !!(w.Capacitor && typeof w.Capacitor.isNativePlatform === 'function' && w.Capacitor.isNativePlatform());
}

/** Сообщить нативке текущую вкладку (для синхронизации состояния/режима). */
export function syncNativeTab(tab: string): void {
  if (typeof window === 'undefined') return;
  try {
    (window as any).webkit?.messageHandlers?.syncTab?.postMessage(String(tab));
  } catch { /* not in native shell */ }
}

/** Подписаться на смену вкладки из нативного tab bar. Возвращает unsubscribe. */
export function onNativeTabChange(cb: TabCb): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail) cb(String(detail));
  };
  window.addEventListener('__nativeTabChange', handler);
  return () => window.removeEventListener('__nativeTabChange', handler);
}

/** Обновить бейдж на нативной иконке (напр. кол-во доступных спинов/наград). */
export function setNativeBadge(n: number): void {
  if (typeof window === 'undefined') return;
  try {
    (window as any).webkit?.messageHandlers?.cartBadge?.postMessage(n | 0);
  } catch { /* not in native shell */ }
}
