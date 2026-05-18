import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '../components/Toast';

export const metadata: Metadata = {
  title: 'S Bonus — Админ-панель | Смарт Центр',
  description: 'Управление бонусной системой лояльности магазина Смарт Центр',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
