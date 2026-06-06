'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Circle, Wallet,
  Calendar, Receipt, CreditCard, ChevronDown, ChevronUp,
} from 'lucide-react';
import { debtAPI, type DebtDetail } from '@/lib/api';

const fmt = (n: number) => Number(n || 0).toLocaleString('ru-RU');
const MS_DAY = 86400000;

function dayLabel(n: number): string {
  const a = Math.abs(n), n10 = a % 10, n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return 'день';
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'дня';
  return 'дней';
}
const fmtDate = (d: string, withYear = true) =>
  new Date(d).toLocaleDateString('ru-RU', withYear
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'long' });

export default function DebtDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [debt, setDebt] = useState<DebtDetail | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
  const isPaid = debt.status === 'paid' || debt.amount <= 0;
  const title = (debt.note && debt.note.trim()) || (debt.reference.match(/00ЦБ-\d+/)?.[0] || debt.reference.slice(0, 30));
  const pct = Math.min(100, Math.round(debt.percent_paid));
  const accent = isPaid ? 'var(--success)' : isOverdue ? 'var(--danger)' : 'var(--accent)';

  const schedule = debt.schedule || [];
  const history = debt.payments_history || [];

  // Next payment day diff
  let nextInfo: { label: string; color: string } | null = null;
  if (debt.next_payment && !isPaid) {
    const days = Math.ceil((new Date(debt.next_payment.date).getTime() - Date.now()) / MS_DAY);
    if (isOverdue) nextInfo = { label: `Просрочен на ${debt.overdue_days} ${dayLabel(debt.overdue_days)}`, color: 'var(--danger)' };
    else if (days <= 0) nextInfo = { label: 'Оплатить сегодня', color: 'var(--warn)' };
    else nextInfo = { label: `Через ${days} ${dayLabel(days)}`, color: 'var(--text-2)' };
  }

  return (
    <div style={{ padding: '0 0 40px', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} aria-label="Назад" style={{ background: 'var(--card-strong)', border: 'none', color: 'var(--text)', cursor: 'pointer', width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Рассрочка</span>
      </div>

      {/* ── HERO: остаток + прогресс ── */}
      <div className="card" style={{ margin: '0 16px 12px', padding: 20, border: `1px solid ${isPaid ? 'rgba(52,211,153,0.25)' : isOverdue ? 'rgba(248,113,113,0.25)' : 'var(--border)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CreditCard size={18} color={accent} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Открыта {fmtDate(debt.created_at || '', false)}</div>
          </div>
        </div>

        {/* Главное число */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          {isPaid ? (
            <>
              <CheckCircle2 size={40} color="var(--success)" style={{ marginBottom: 4 }} />
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>Полностью оплачено</div>
            </>
          ) : (
            <>
              <div className="label" style={{ marginBottom: 4 }}>Остаток к оплате</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: accent, lineHeight: 1.1 }}>
                {fmt(debt.amount)} <span style={{ fontSize: 18, color: 'var(--text-3)' }}>сом</span>
              </div>
            </>
          )}
        </div>

        {/* Прогресс */}
        <div className="progress" style={{ height: 8 }}>
          <div className="progress-bar" style={{ width: `${pct}%`, background: isPaid ? 'var(--success)' : undefined }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <Mini label="Всего" value={fmt(debt.total_amount)} />
          <Mini label="Оплачено" value={fmt(debt.paid_amount)} color="var(--success)" />
          <Mini label="Осталось" value={fmt(debt.amount)} color={isPaid ? 'var(--text-2)' : accent} />
        </div>
      </div>

      {/* ── NEXT PAYMENT ── */}
      {debt.next_payment && !isPaid && (
        <div className="card" style={{
          margin: '0 16px 12px', padding: '16px 18px',
          border: `1.5px solid ${isOverdue ? 'var(--danger)' : 'var(--accent)'}`,
          background: isOverdue ? 'rgba(248,113,113,0.06)' : 'linear-gradient(135deg, rgba(255,230,0,0.06), rgba(255,230,0,0))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <Calendar size={13} /> Следующий платёж
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtDate(debt.next_payment.date)}</div>
              {nextInfo && <div style={{ fontSize: 12, fontWeight: 600, color: nextInfo.color, marginTop: 2 }}>{nextInfo.label}</div>}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: isOverdue ? 'var(--danger)' : 'var(--accent)', whiteSpace: 'nowrap' }}>
              {fmt(debt.next_payment.amount)} <span style={{ fontSize: 13, color: 'var(--text-3)' }}>сом</span>
            </div>
          </div>
        </div>
      )}

      {/* ── ГРАФИК (timeline) ── */}
      {schedule.length > 0 && (
        <div style={{ margin: '0 16px 12px' }}>
          <SectionTitle icon={<Calendar size={15} />} text="График платежей" />
          <div className="card" style={{ padding: '6px 16px' }}>
            {schedule.map((item, i) => {
              const paid = item.status === 'paid';
              const overdue = item.status === 'overdue';
              const last = i === schedule.length - 1;
              let Icon = Circle, color = 'var(--text-3)', label = 'Ожидает оплаты';
              if (paid) { Icon = CheckCircle2; color = 'var(--success)'; label = 'Оплачен'; }
              else if (overdue) {
                Icon = AlertTriangle; color = 'var(--danger)';
                const d = Math.max(1, Math.round((Date.now() - new Date(item.date).getTime()) / MS_DAY));
                label = `Просрочен на ${d} ${dayLabel(d)}`;
              }
              return (
                <div key={i} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                  {/* timeline column */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <Icon size={22} color={color} fill={paid ? color : 'none'} strokeWidth={paid ? 0 : 2} />
                    {!last && <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 18, margin: '2px 0' }} />}
                  </div>
                  {/* content */}
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '2px 0 16px' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(item.date)}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color, marginTop: 1 }}>{label}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: paid ? 'var(--text-2)' : 'var(--text)', whiteSpace: 'nowrap', textDecoration: paid ? 'line-through' : 'none' }}>
                      {fmt(item.amount)} <span style={{ fontSize: 11, color: 'var(--text-3)' }}>сом</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ИСТОРИЯ ОПЛАТ (collapsible) ── */}
      {history.length > 0 && (
        <div style={{ margin: '0 16px' }}>
          <button onClick={() => setShowHistory(v => !v)} style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-2)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Receipt size={15} /> История оплат ({history.length})
            </span>
            {showHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {showHistory && (
            <div className="card fade-in" style={{ padding: '4px 16px' }}>
              {history.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                  borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'rgba(52,211,153,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Wallet size={16} color="var(--success)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{fmtDate(p.date)}</div>
                    {p.document && <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.document}</div>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                    +{fmt(p.amount)} <span style={{ fontSize: 11, color: 'var(--text-3)' }}>сом</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 2px 8px', color: 'var(--text-2)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {icon} {text}
    </div>
  );
}
