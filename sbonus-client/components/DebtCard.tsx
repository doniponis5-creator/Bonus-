'use client';
import { AlertTriangle, CheckCircle2, FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Props {
  amount: number;
  updatedAt?: string | null;
  debtCount?: number;
}

export default function DebtCard({ amount, updatedAt, debtCount = 0 }: Props) {
  const hasDebt = amount > 0;
  return (
    <Link href="/debts" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className={`card ${hasDebt ? 'card-danger' : ''}`} style={{ cursor: 'pointer', position: 'relative' }}>
        <p className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <FileText size={12} /> Рассрочка (1C)
          {debtCount > 0 && (
            <span style={{
              background: hasDebt ? 'rgba(240,100,100,0.2)' : 'rgba(93,202,165,0.2)',
              color: hasDebt ? '#F09595' : '#5DCAA5',
              fontSize: 10, fontWeight: 600,
              padding: '1px 6px', borderRadius: 8,
            }}>
              {debtCount}
            </span>
          )}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: hasDebt ? 'var(--danger)' : 'var(--accent)' }}>
            {amount.toLocaleString('ru-RU')} <span style={{ fontSize: 14, color: 'var(--text2)' }}>сом</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasDebt
              ? <AlertTriangle size={24} color="var(--danger)" />
              : <CheckCircle2 size={24} color="var(--accent)" />
            }
            <ChevronRight size={18} color="var(--text3)" />
          </div>
        </div>
        {updatedAt && (
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
            Синхр: {new Date(updatedAt).toLocaleString('ru-RU')}
          </p>
        )}
        {!hasDebt && (
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Рассрочка йўқ <CheckCircle2 size={14} color="var(--accent)" />
            </span>
          </p>
        )}
      </div>
    </Link>
  );
}
