'use client';
import { CreditCard, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Props {
  amount: number;
  updatedAt?: string | null;
  debtCount?: number;
}

/**
 * Компактная строка рассрочки. Показывается только при наличии остатка —
 * пустое состояние не занимает место на главной (ссылка есть в Профиле).
 */
export default function DebtCard({ amount, debtCount = 0 }: Props) {
  if (amount <= 0) return null;
  return (
    <Link href="/debts" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card tap" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', cursor: 'pointer' }}>
        <div className="icon-tile">
          <CreditCard size={17} color="var(--text-2)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            Рассрочка{debtCount > 0 ? ` · ${debtCount}` : ''}
          </div>
          <div className="caption" style={{ marginTop: 1 }}>Остаток по платежам</div>
        </div>
        <div className="numeric" style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {amount.toLocaleString('ru-RU')} <span style={{ fontSize: 12, color: 'var(--text-2)' }}>сом</span>
        </div>
        <ChevronRight size={16} color="var(--text-3)" />
      </div>
    </Link>
  );
}
