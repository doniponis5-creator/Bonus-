'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
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
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <ArrowLeft size={18} /> Орқага
        </button>
      </div>
      <CheckCircle2 size={48} color="var(--accent)" style={{ margin: '40px auto 12px' }} />
      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text1)' }}>Рассрочка йўқ</p>
      <p style={{ fontSize: 13, color: 'var(--text3)' }}>Сизда ҳозирча фаол рассрочка мавжуд эмас</p>
    </div>
  );

  const totalPercent = data.total_original > 0
    ? Math.round(data.total_paid / data.total_original * 100) : 0;

  return (
    <div style={{ padding: '0 0 24px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text1)' }}>Рассрочкалар</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)', background: 'var(--card)', padding: '3px 10px', borderRadius: 12 }}>
          {data.count} та
        </span>
      </div>

      {/* Summary */}
      <div style={{ margin: '0 16px 16px', background: 'var(--card)', borderRadius: 14, padding: 16, border: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Жами долг</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--danger)', margin: 0 }}>
            {data.total_debt.toLocaleString('ru-RU')} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text3)' }}>сом</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatMini label="Жами" value={data.total_original} />
          <StatMini label="Тўланган" value={data.total_paid} color="var(--accent)" />
          <StatMini label="Қолди" value={data.total_debt} color="var(--danger)" />
        </div>
        {/* Overall progress */}
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${totalPercent}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>
            {totalPercent}% тўланган
          </p>
        </div>
      </div>

      {/* Debt cards */}
      {data.debts.map(d => (
        <DebtListCard key={d.id} debt={d} />
      ))}
    </div>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
      <p style={{ fontSize: 9, color: 'var(--text3)', margin: 0, textTransform: 'uppercase' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, margin: '2px 0 0', color: color || 'var(--text1)' }}>
        {value >= 1000 ? `${Math.round(value / 1000)}K` : value.toLocaleString('ru-RU')}
      </p>
    </div>
  );
}

function DebtListCard({ debt }: { debt: DebtSummary }) {
  const isOverdue = debt.overdue_days > 0;
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
        margin: '0 16px 10px', background: 'var(--card)', borderRadius: 14, padding: 14,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isOverdue ? 'var(--danger)' : 'var(--accent)'}`,
        cursor: 'pointer',
      }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text1)' }}>{refShort}</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>{dateStr}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isOverdue ? (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(240,100,100,0.15)', color: '#F09595', fontWeight: 600 }}>
                {debt.overdue_days} кун
              </span>
            ) : (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(93,202,165,0.15)', color: '#5DCAA5', fontWeight: 600 }}>
                Муддатида
              </span>
            )}
            <ChevronRight size={16} color="var(--text3)" />
          </div>
        </div>

        {/* Circle + amounts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--bg2)" strokeWidth={stroke} />
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
              stroke={isOverdue ? '#F09595' : '#FFE600'} strokeWidth={stroke}
              strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s' }}
            />
            <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
              fill="var(--text1)" fontSize="12" fontWeight="700"
              style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
              {Math.round(debt.percent_paid)}%
            </text>
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Сумма</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{debt.total_amount.toLocaleString('ru-RU')} сом</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Оплачено</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{debt.paid_amount.toLocaleString('ru-RU')} сом</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Остаток</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: isOverdue ? 'var(--danger)' : 'var(--text1)' }}>
                {debt.amount.toLocaleString('ru-RU')} сом
              </span>
            </div>
          </div>
        </div>

        {/* Next payment */}
        {debt.next_payment && (
          <div style={{
            marginTop: 10, background: 'var(--bg2)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={13} color="var(--text3)" />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Навбатдаги:</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#FFE600' }}>
                {new Date(debt.next_payment.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
              </span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>
              {debt.next_payment.amount.toLocaleString('ru-RU')} сом
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
