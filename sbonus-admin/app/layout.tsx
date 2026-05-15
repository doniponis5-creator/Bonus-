import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'S Bonus — Админ-панель | Смарт Центр',
  description: 'Управление бонусной системой лояльности магазина Смарт Центр',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
