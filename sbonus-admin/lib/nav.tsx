// ─── Единый источник навигации (Sidebar + хаб «Разделы») ───
import {
  LayoutDashboard, Users, CreditCard, Store, Briefcase, Trophy, Ticket,
  Settings, FileSearch, Gift, Tag, Star, BarChart3, Disc3,
  Flame, Send, MessageCircle, Gamepad2, GitBranch, MessageSquarePlus, FileBarChart,
  FlaskConical, QrCode, Bot, Percent, Activity, PieChart, Crosshair,
  Package, Wallet, Brain, Scan, TrendingUp,
} from 'lucide-react';

export interface NavItem {
  href: string;
  icon: any;
  label: string;
  desc?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Основное',
    items: [
      { href: '/', icon: LayoutDashboard, label: 'Дашборд', desc: 'Главная сводка' },
      { href: '/customers', icon: Users, label: 'Клиенты', desc: 'База клиентов' },
      { href: '/customer360', icon: Scan, label: 'Customer 360', desc: 'Профиль клиента' },
      { href: '/transactions', icon: CreditCard, label: 'Транзакции', desc: 'Все операции' },
      { href: '/branches', icon: Store, label: 'Филиалы', desc: 'Магазины' },
      { href: '/cashiers', icon: Briefcase, label: 'Кассиры', desc: 'Сотрудники' },
      { href: '/tiers', icon: Trophy, label: 'Уровни', desc: 'Bronze→Platinum' },
    ],
  },
  {
    title: 'Маркетинг',
    items: [
      { href: '/campaigns', icon: Gift, label: 'Кампании', desc: 'Рассылки бонусов' },
      { href: '/promo-codes', icon: Ticket, label: 'Промокоды', desc: 'Коды на бонус' },
      { href: '/coupons', icon: Tag, label: 'Купоны', desc: 'Персональные купоны' },
      { href: '/cashback', icon: Percent, label: 'Кешбэк', desc: 'Категории кешбэка' },
      { href: '/ab-testing', icon: FlaskConical, label: 'A/B тесты', desc: 'Эксперименты' },
      { href: '/wa-broadcast', icon: MessageCircle, label: 'Рассылки WA', desc: 'WhatsApp' },
      { href: '/referral-board', icon: Users, label: 'Referral 2.0', desc: 'Рефералы' },
      { href: '/smart-campaigns', icon: Brain, label: 'Smart Кампании', desc: 'Авто-сегменты' },
    ],
  },
  {
    title: 'Аналитика',
    items: [
      { href: '/analytics', icon: BarChart3, label: 'Аналитика', desc: 'Обзор метрик' },
      { href: '/product-analytics', icon: Package, label: 'Товары', desc: 'Продажи товаров' },
      { href: '/financials', icon: Wallet, label: 'P&L Финансы', desc: 'Прибыль/убыток' },
      { href: '/pro-analytics', icon: Brain, label: 'PRO Аналитика', desc: 'RFM, когорты' },
      { href: '/qr-analytics', icon: QrCode, label: 'QR аналитика', desc: 'Сканы QR' },
      { href: '/business-analytics', icon: PieChart, label: 'Бизнес PRO', desc: 'BI-дашборд' },
      { href: '/marketing-roi', icon: Crosshair, label: 'Воронка и ROI', desc: 'Маркетинг' },
      { href: '/forecast', icon: TrendingUp, label: 'AI Прогноз', desc: 'Прогнозы' },
      { href: '/branch-compare', icon: GitBranch, label: 'Филиалы PRO', desc: 'Сравнение' },
      { href: '/feedback', icon: MessageSquarePlus, label: 'NPS & Отзывы', desc: 'Опросы' },
      { href: '/gamification', icon: Gamepad2, label: 'Геймификация', desc: 'Миссии, бейджи' },
      { href: '/reports', icon: FileBarChart, label: 'PDF Отчёты', desc: 'Экспорт' },
      { href: '/realtime', icon: Activity, label: 'Real-time', desc: 'Live-активность' },
      { href: '/reviews', icon: Star, label: 'Отзывы', desc: 'Google / 2GIS' },
      { href: '/audit-logs', icon: FileSearch, label: 'Журнал', desc: 'Аудит действий' },
    ],
  },
  {
    title: 'Настройки',
    items: [
      { href: '/wheel-settings', icon: Disc3, label: 'Колесо удачи', desc: 'Сегменты, призы' },
      { href: '/cashier-bonuses', icon: Flame, label: 'Мотивация', desc: 'Бонусы кассирам' },
      { href: '/telegram', icon: Send, label: 'TG бот (админ)', desc: 'Отчёты в Telegram' },
      { href: '/customer-tg-bot', icon: Bot, label: 'TG бот (клиент)', desc: 'Бот для клиентов' },
      { href: '/settings', icon: Settings, label: 'Настройки', desc: 'Все параметры' },
    ],
  },
];

// Быстрый доступ в сайдбаре (часто используемые). Остальное — в хабе «Все разделы».
export const QUICK_NAV: NavItem[] = [
  { href: '/', icon: LayoutDashboard, label: 'Дашборд' },
  { href: '/customers', icon: Users, label: 'Клиенты' },
  { href: '/transactions', icon: CreditCard, label: 'Транзакции' },
  { href: '/campaigns', icon: Gift, label: 'Кампании' },
  { href: '/analytics', icon: BarChart3, label: 'Аналитика' },
  { href: '/settings', icon: Settings, label: 'Настройки' },
];

// Цвета акцента для групп (хаб)
export const GROUP_COLORS: Record<string, string> = {
  'Основное': '#6366f1',
  'Маркетинг': '#ec4899',
  'Аналитика': '#10b981',
  'Настройки': '#f59e0b',
};
