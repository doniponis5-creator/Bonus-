'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { debtAPI, type DebtSummary } from '@/lib/api';

export default function DebtsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    total_debt: number; total_original: number; total_paid: number;
    count: number; debts: DebtSummary[];
  } | null>(null);

  useEffect(() => {
    debtAPI.list().then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  if (!data || data.count === 0) return (
    <div style={{ padding: 20, textAlign: 'center' }}>
      <div style={{ padding: '16px 0' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontFamily: 'inherit' }}>
          <ArrowLeft size={18} /> Назад
        </button>
      </div>
      <CheckCircle2 size={48} color="var(--success)" style={{ margin: '40px auto 12px' }} />
      <p className="h2" style={{ color: 'var(--text)', marginBottom: 4 }}>Рассрочек нет</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>У вас пока нет активных рассрочек</p>
    </div>
  );

  const totalPercent = data.total_original > 0
    ? Math.round(data.total_paid / data.total_original * 100) : 0;

  return (
    <div style={{ padding: '0 0 24px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} aria-label="Назад" className="tap" style={{ background: 'var(--card-strong)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ArrowLeft size={17} />
        </button>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Рассрочки</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)', background: 'var(--card)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 999 }}>
          {data.count}
        </span>
      </div>

      {/* Summary */}
      <div style={{ margin: '0 16px 16px', background: 'var(--card)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <p className="label" style={{ margin: '0 0 4px' }}>Остаток по рассрочкам</p>
          <p className="display numeric" style={{ color: 'var(--text)', margin: 0 }}>
            {data.total_debt.toLocaleString('ru-RU')} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-3)' }}>сом</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatMini label="Всего" value={data.total_original} />
          <StatMini label="Оплачено" value={data.total_paid} color="var(--success)" />
          <StatMini label="Остаток" value={data.total_debt} />
        </div>
        {/* Overall progress */}
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${totalPercent}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 0.5s' }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>
            {totalPercent}% оплачено
          </p>
        </div>
      </div>

      {/* Активные рассрочки */}
      {data.debts.filter(d => d.status !== 'paid').length > 0 && (
        <p className="label" style={{ margin: '0 20px 8px' }}>
          Активные
        </p>
      )}
      {data.debts.filter(d => d.status !== 'paid').map(d => (
        <DebtListCard key={d.id} debt={d} />
      ))}

      {/* Погашенные рассрочки */}
      {data.debts.filter(d => d.status === 'paid').length > 0 && (
        <>
          <p className="label" style={{ margin: '16px 20px 8px' }}>
            Погашенные
          </p>
          {data.debts.filter(d => d.status === 'paid').map(d => (
            <DebtListCard key={d.id} debt={d} />
          ))}
        </>
      )}
    </div>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-2)', borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}>
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p className="numeric" style={{ fontSize: 14, fontWeight: 700, margin: '2px 0 0', color: color || 'var(--text)' }}>
        {value >= 1000 ? `${Math.round(value / 1000)}K` : value.toLocaleString('ru-RU')}
      </p>
    </div>
  );
}

function DebtListCard({ debt }: { debt: DebtSummary }) {
  const isOverdue = debt.overdue_days > 0;
  const isPaid = debt.status === 'paid';
  const refShort = debt.reference.includes('00ЦБ-')
    ? debt.reference.match(/00ЦБ-\d+/)?.[0] || debt.reference.slice(0, 20)
    : debt.reference.slice(0, 25);
  const dateStr = debt.created_at
    ? new Date(debt.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  // Circular progress
  const size = 56;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (debt.percent_paid / 100) * circ;

  return (
    <Link href={`/debts/${debt.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        margin: '0 16px 10px', background: 'var(--card)', borderRadius: 16, padding: 14,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isPaid ? 'var(--text-3)' : isOverdue ? 'var(--danger)' : 'var(--accent)'}`,
        opacity: isPaid ? 0.7 : 1,
        cursor: 'pointer',
      }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text)' }}>{refShort}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>{dateStr}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPaid ? (
              <span className="badge badge-success">
                Погашена
              </span>
            ) : isOverdue ? (
              <span className="badge badge-danger">
                {debt.overdue_days} дн.
              </span>
            ) : (
              <span className="badge badge-success">
                В срок
              </span>
            )}
            <ChevronRight size={16} color="var(--text-3)" />
          </div>
        </div>

        {/* Circle + amounts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--bg-3)" strokeWidth={stroke} />
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
              stroke={isPaid ? 'var(--success)' : isOverdue ? 'var(--danger)' : 'var(--accent)'} strokeWidth={stroke}
              strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s' }}
            />
            <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
              fill="var(--text)" fontSize="12" fontWeight="700"
              style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
              {Math.round(debt.percent_paid)}%
            </text>
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Сумма</span>
              <span className="numeric" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{debt.total_amount.toLocaleString('ru-RU')} сом</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Оплачено</span>
              <span className="numeric" style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>{debt.paid_amount.toLocaleString('ru-RU')} сом</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Остаток</span>
              <span className="numeric" style={{ fontSize: 13, fontWeight: 600, color: isOverdue ? 'var(--danger)' : 'var(--text)' }}>
                {debt.amount.toLocaleString('ru-RU')} сом
              </span>
            </div>
          </div>
        </div>

        {/* Next payment */}
        {debt.next_payment && (
          <div style={{
            marginTop: 10, background: 'var(--bg-2)', borderRadius: 12, padding: '8px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={13} color="var(--text-3)" />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Следующий платёж</span>
              <span className="numeric" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                {new Date(debt.next_payment.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
              </span>
            </div>
            <span className="numeric" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {debt.next_payment.amount.toLocaleString('ru-RU')} сом
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
