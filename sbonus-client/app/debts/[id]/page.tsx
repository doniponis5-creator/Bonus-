'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, FileText, Receipt } from 'lucide-react';
import { debtAPI, type DebtDetail } from '@/lib/api';

export default function DebtDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [debt, setDebt] = useState<DebtDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    debtAPI.detail(id).then(r => setDebt(r.data)).catch(() => router.push('/debts')).finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );
  if (!debt) return null;

  const isOverdue = debt.overdue_days > 0;
  const refShort = debt.reference.includes('00ЦБ-')
    ? debt.reference.match(/00ЦБ-\d+/)?.[0] || debt.reference.slice(0, 20)
    : debt.reference.slice(0, 30);
  const dateStr = debt.created_at
    ? new Date(debt.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  // Big circular progress
  const size = 120;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (debt.percent_paid / 100) * circ;
  const progressColor = isOverdue ? '#F09595' : '#FFE600';

  return (
    <div style={{ padding: '0 0 32px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>Детали рассрочки</span>
      </div>

      {/* Hero section */}
      <div style={{ textAlign: 'center', padding: '20px 20px 16px' }}>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 2px' }}>{refShort}</p>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 16px' }}>{dateStr}</p>

        {/* Circular progress */}
        <div style={{ position: 'relative', display: 'inline-block', margin: '0 auto 16px' }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--bg2)" strokeWidth={stroke} />
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
              stroke={progressColor} strokeWidth={stroke}
              strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)', margin: 0 }}>{Math.round(debt.percent_paid)}%</p>
            <p style={{ fontSize: 9, color: 'var(--text3)', margin: 0 }}>оплачено</p>
          </div>
        </div>

        {/* Amount stats */}
        <div style={{ display: 'flex', gap: 8, margin: '0 0 12px' }}>
          <div style={{ flex: 1, background: 'var(--card)', borderRadius: 12, padding: '10px 8px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 9, color: 'var(--text3)', margin: 0, textTransform: 'uppercase' }}>Сумма</p>
            <p style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: 'var(--text1)' }}>
              {debt.total_amount.toLocaleString('ru-RU')}
            </p>
          </div>
          <div style={{ flex: 1, background: 'var(--card)', borderRadius: 12, padding: '10px 8px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 9, color: 'var(--text3)', margin: 0, textTransform: 'uppercase' }}>Оплачено</p>
            <p style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: 'var(--accent)' }}>
              {debt.paid_amount.toLocaleString('ru-RU')}
            </p>
          </div>
          <div style={{ flex: 1, background: 'var(--card)', borderRadius: 12, padding: '10px 8px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 9, color: 'var(--text3)', margin: 0, textTransform: 'uppercase' }}>Остаток</p>
            <p style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: isOverdue ? 'var(--danger)' : 'var(--text1)' }}>
              {debt.amount.toLocaleString('ru-RU')}
            </p>
          </div>
        </div>

        {/* Overdue badge */}
        {isOverdue && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(240,100,100,0.12)', padding: '6px 16px', borderRadius: 20,
          }}>
            <AlertTriangle size={14} color="#F09595" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#F09595' }}>
              Просрочка: {debt.overdue_days} дн.!
            </span>
          </div>
        )}
      </div>

      {/* Next payment highlight */}
      {debt.next_payment && (
        <div style={{
          margin: '0 16px 16px', padding: '14px 16px',
          background: 'var(--card)', borderRadius: 14,
          border: '1.5px solid #FFE600',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>Следующий платёж</p>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#FFE600', margin: '2px 0 0' }}>
              {new Date(debt.next_payment.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text1)', margin: 0 }}>
            {debt.next_payment.amount.toLocaleString('ru-RU')}
          </p>
        </div>
      )}

      {/* Payment schedule */}
      {debt.schedule && debt.schedule.length > 0 && (
        <div style={{ margin: '0 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileText size={15} color="var(--text3)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              График платежей
            </span>
          </div>
          <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {debt.schedule.map((item, i) => {
              const isPaid = item.status === 'paid';
              const isItemOverdue = item.status === 'overdue';
              const dateFormatted = new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', padding: '12px 14px', gap: 10,
                  borderBottom: i < debt.schedule.length - 1 ? '1px solid var(--border)' : 'none',
                  background: isItemOverdue ? 'rgba(240,100,100,0.05)' : 'transparent',
                }}>
                  {/* Status dot */}
                  <div style={{
                    width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isPaid ? 'var(--accent)' : isItemOverdue ? '#F09595' : 'var(--bg2)',
                  }}>
                    {isPaid && <CheckCircle2 size={14} color="#000" />}
                    {isItemOverdue && !isPaid && <AlertTriangle size={12} color="#fff" />}
                    {!isPaid && !isItemOverdue && <Clock size={12} color="var(--text3)" />}
                  </div>

                  {/* Date + plan */}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--text1)' }}>{dateFormatted}</p>
                    {isPaid && (
                      <p style={{ fontSize: 10, color: 'var(--accent)', margin: '1px 0 0' }}>Оплачено ✓</p>
                    )}
                    {isItemOverdue && (
                      <p style={{ fontSize: 10, color: '#F09595', margin: '1px 0 0' }}>
                        Просрочка {Math.max(1, Math.round((Date.now() - new Date(item.date).getTime()) / 86400000))} дн.
                      </p>
                    )}
                  </div>

                  {/* Amount + status */}
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>
                      {item.amount.toLocaleString('ru-RU')}
                    </span>
                    <p style={{
                      fontSize: 10, fontWeight: 600, margin: '1px 0 0',
                      color: isPaid ? 'var(--accent)' : isItemOverdue ? '#F09595' : 'var(--text3)',
                    }}>
                      {isPaid ? '✅ Оплачен' : isItemOverdue ? '⚠️ Просрочен' : '○ Ожидает'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment history */}
      {debt.payments_history && debt.payments_history.length > 0 && (
        <div style={{ margin: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Receipt size={15} color="var(--text3)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              История оплат
            </span>
          </div>
          <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {debt.payments_history.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', padding: '12px 14px', gap: 10,
                borderBottom: i < debt.payments_history.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                  background: (p as any).overdue_days > 0 ? '#F09595' : 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {(p as any).overdue_days > 0
                    ? <AlertTriangle size={12} color="#fff" />
                    : <CheckCircle2 size={14} color="#000" />
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--text1)' }}>
                    {new Date(p.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                  {p.document && (
                    <p style={{ fontSize: 10, color: 'var(--text3)', margin: '1px 0 0' }}>
                      {p.document.length > 35 ? p.document.slice(0, 35) + '...' : p.document}
                    </p>
                  )}
                  {(p as any).overdue_days > 0 && (
                    <p style={{ fontSize: 10, color: '#F09595', margin: '1px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <AlertTriangle size={10} /> Просрочка: {(p as any).overdue_days} дн.
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                  {p.amount.toLocaleString('ru-RU')} сом
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
