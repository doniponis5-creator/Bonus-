import type { CapacitorConfig } from '@capacitor/cli';

/**
 * SBonus+ — native iOS shell (Capacitor).
 * Нативная оболочка загружает живой веб-клиент в WKWebView, а нативный
 * iOS 26 TabView рисует НАСТОЯЩИЙ Liquid Glass tab bar (SBonusTabView.swift).
 *
 * Для локальной разработки поменяйте server.url на http://localhost:3001
 * (и добавьте его в allowNavigation).
 */
const config: CapacitorConfig = {
  appId: 'store.smartcentr.bonus',
  appName: 'S Bonus',
  webDir: 'public', // заглушка — реальный контент берётся с server.url
  server: {
    url: 'https://cabinet.smartcentr.store',
    cleartext: false,
    allowNavigation: ['cabinet.smartcentr.store', 'api.smartcentr.store'],
  },
  ios: {
    backgroundColor: '#05060a',
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
