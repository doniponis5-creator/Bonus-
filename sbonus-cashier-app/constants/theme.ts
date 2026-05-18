/**
 * S Bonus — Тема приложения кассира.
 * Тёмная тема + жёлтый акцент (Smart Center brand).
 */

export const COLORS = {
  // Фон
  bg: '#0a0f1a',
  bg2: '#111827',
  bg3: '#1a2332',
  card: '#141c2b',
  cardBorder: '#1e293b',

  // Акценты (brand yellow)
  accent: '#FFE600',
  accent2: '#FFC107',
  accent3: '#7C6FFF',

  // Текст
  text: '#e2eaf6',
  text2: '#8899aa',
  text3: '#556677',

  // Статусы
  success: '#22c55e',
  danger: '#ef4444',
  warn: '#f59e0b',

  // Tier цвета
  bronze: '#cd7f32',
  silver: '#b0b0b0',
  gold: '#ffd700',
  platinum: '#FFE600',

  // Общие
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.7)',
} as const;

export const TIER_COLORS: Record<string, string> = {
  Bronze: COLORS.bronze,
  Silver: COLORS.silver,
  Gold: COLORS.gold,
  Platinum: COLORS.platinum,
};

export const TIER_SYMBOL: Record<string, string> = {
  Bronze: 'B',
  Silver: 'S',
  Gold: 'G',
  Platinum: 'P',
};

/**
 * Форматирование суммы: 1000 → "1 000 KGS"
 */
export function formatKGS(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' KGS';
}

/**
 * Форматирование с десятичными: 1000.50 → "1 000.50 KGS"
 */
export function formatKGSDecimal(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' KGS';
}
