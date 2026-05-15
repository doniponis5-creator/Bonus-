/**
 * S Bonus — Тема приложения кассира.
 * Тёмная тема + зелёный акцент.
 */

export const COLORS = {
  // Фон
  bg: '#0a0f1a',
  bg2: '#111827',
  bg3: '#1a2332',
  card: '#141c2b',
  cardBorder: '#1e293b',

  // Акценты
  accent: '#00E5A0',
  accent2: '#00B8D4',
  accent3: '#7C6FFF',

  // Текст
  text: '#e2eaf6',
  text2: '#8899aa',
  text3: '#556677',

  // Статусы
  success: '#00E5A0',
  danger: '#ef4444',
  warn: '#f59e0b',

  // Tier цвета
  bronze: '#cd7f32',
  silver: '#b0b0b0',
  gold: '#ffd700',
  platinum: '#00E5A0',

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

export const TIER_EMOJI: Record<string, string> = {
  Bronze: '🥉',
  Silver: '🥈',
  Gold: '🥇',
  Platinum: '💎',
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
