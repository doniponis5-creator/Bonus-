'use client';
import { useEffect, useState, useCallback } from 'react';
import { analyticsProAPI } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, FunnelChart, Funnel, LabelList,
} from 'recharts';
import {
  RefreshCw, Users, UserCheck, Repeat, Heart, Share2, Info,
  TrendingUp, Megaphone, Ticket, UserPlus, ArrowRight, AlertTriangle,
} from 'lucide-react';

const card: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, padding: 24,
  border: '1px solid var(--border)',
};
const periodBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  background: active ? 'var(--accent)' : 'var(--bg2)',
  color: active ? 'var(--on-accent)' : 'var(--text2)', transition: 'all .2s',
});

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('ru-RU');
}
function fmtCur(n: number): string { return fmt(n) + ' сом'; }

const FUNNEL_COLORS = ['#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];
const FUNNEL_ICONS = [Users, UserCheck, Repeat, Heart, Share2, TrendingUp];
const FUNNEL_LABELS: Record<string, string> = {
  registered: 'Зарегистрированы',
  first_purchase: 'Первая покупка',
  used_bonus: 'Использовали бонус',
  repeat_buyer: 'Повторная покупка',
  loyal: 'Лояльные (5+ покупок)',
  referrer: 'Привели друзей',
};
const FUNNEL_TIPS: Record<string, string> = {
  registered: 'Все зарегистрированные клиенты за период',
  first_purchase: 'Сделали хотя бы 1 покупку. Если низкий % — улучшите onboarding.',
  used_bonus: 'Потратили бонусы. Если мало — сделайте бонусы заметнее.',
  repeat_buyer: 'Вернулись за 2+ покупками. Ключевая метрика удержания.',
  loyal: 'Сделали 5+ покупок. Ваши лучшие клиенты — берегите их!',
  referrer: 'Привели друзей. Если мало — усильте реферальную программу.',
};

export default function MarketingROIPage() {
  const [period, setPeriod] = useState(30);
  const [funnel, setFunnel] = useState<any>(null);
  const [marketing, setMarketing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, m] = await Promise.all([
        analyticsProAPI.funnel(period),
        analyticsProAPI.marketing(period),
      ]);
      setFunnel(f.data); setMarketing(m.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const funnelSteps = funnel?.steps || [];
  const campaigns = marketing?.campaigns || [];
  const promos = marketing?.promos || [];
  const referral = marketing?.referral || {};

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Воронка клиентов и ROI маркетинга</h1>
          <p style={{ color: 'var(--text2)', margin: '4px 0 0', fontSize: 14 }}>
            Путь клиента от регистрации до лояльности + эффективность маркетинга
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} style={periodBtn(period === d)} onClick={() => setPeriod(d)}>
              {d} дн
            </button>
          ))}
        </div>
      </div>

      {/* Customer Funnel — Visual */}
      <div style={{ ...card, marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Воронка клиентов</h3>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Последние {period} дней</span>
        </div>

        {funnelSteps.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {funnelSteps.map((step: any, i: number) => {
              const maxVal = funnelSteps[0]?.value || 1;
              const pct = maxVal > 0 ? Math.round((step.value / maxVal) * 100) : 0;
              const convFromPrev = i > 0 && funnelSteps[i - 1]?.value > 0
                ? Math.round((step.value / funnelSteps[i - 1].value) * 100) : 100;
              const Icon = FUNNEL_ICONS[i] || Users;
              const color = FUNNEL_COLORS[i] || '#8899aa';

              return (
                <div key={step.key}>
                  {i > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0', color: 'var(--text2)' }}>
                      <ArrowRight size={14} style={{ transform: 'rotate(90deg)', opacity: .5 }} />
                      <span style={{ fontSize: 11, marginLeft: 6, opacity: .7 }}>конверсия {convFromPrev}%</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={18} style={{ color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span style={{ fontWeight: 500 }}>{FUNNEL_LABELS[step.key] || step.key}</span>
                        <span style={{ fontWeight: 700 }}>{fmt(step.value)} <span style={{ fontWeight: 400, color: 'var(--text2)', fontSize: 12 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--bg2)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 999, background: color,
                          width: pct + '%', transition: 'width 1s ease',
                        }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Недостаточно данных для построения воронки</p>
        )}

        {/* Funnel tips */}
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          {funnelSteps.slice(0, 4).map((step: any, i: number) => {
            const convFromPrev = i > 0 && funnelSteps[i - 1]?.value > 0
              ? Math.round((step.value / funnelSteps[i - 1].value) * 100) : 100;
            const isLow = i > 0 && convFromPrev < 30;
            return (
              <div key={step.key} style={{
                padding: '8px 12px', borderRadius: 10, background: isLow ? 'rgba(239,68,68,.08)' : 'var(--bg2)',
                fontSize: 12, color: 'var(--text2)', borderLeft: `3px solid ${isLow ? 'var(--danger)' : FUNNEL_COLORS[i]}`,
              }}>
                {isLow && <span style={{ color: 'var(--danger)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> Низкая конверсия! </span>}
                {FUNNEL_TIPS[step.key] || ''}
              </div>
            );
          })}
        </div>
      </div>

      {/* Marketing ROI — 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24, marginBottom: 32 }}>

        {/* Campaigns ROI */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Megaphone size={18} style={{ color: 'var(--info)' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Кампании</h3>
          </div>
          {campaigns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {campaigns.slice(0, 8).map((c: any, i: number) => (
                <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg2)', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ fontWeight: 600, color: c.roi >= 0 ? 'var(--success)' : 'var(--danger)' }}>ROI {c.roi}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)' }}>
                    <span>Отправлено: {c.sent}</span>
                    <span>Бонусов: {fmtCur(c.bonus_cost)}</span>
                    <span>Выручка: {fmtCur(c.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 20, fontSize: 13 }}>Нет кампаний за период</p>
          )}
        </div>

        {/* Promo Codes ROI */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Ticket size={18} style={{ color: 'var(--violet)' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Промокоды</h3>
          </div>
          {promos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {promos.slice(0, 8).map((p: any, i: number) => (
                <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg2)', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontFamily: 'monospace', letterSpacing: 1 }}>{p.code}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {p.uses}/{p.max_uses || '∞'} исп.
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)' }}>
                    <span>Бонус: {fmtCur(p.bonus_amount)}</span>
                    <span>Общая сумма: {fmtCur(p.total_cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 20, fontSize: 13 }}>Нет промокодов за период</p>
          )}
        </div>

        {/* Referral Program */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <UserPlus size={18} style={{ color: 'var(--success)' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Реферальная программа</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: '14px', borderRadius: 10, background: 'var(--bg2)', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{fmt(referral.total_referrals || 0)}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Приведено друзей</div>
            </div>
            <div style={{ padding: '14px', borderRadius: 10, background: 'var(--bg2)', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--info)' }}>{fmt(referral.active_referrers || 0)}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Активных рефереров</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text2)' }}>Бонусы за рефералов</span>
              <span style={{ fontWeight: 600 }}>{fmtCur(referral.bonus_cost || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text2)' }}>Выручка от рефералов</span>
              <span style={{ fontWeight: 600 }}>{fmtCur(referral.revenue_from_referred || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0' }}>
              <span style={{ color: 'var(--text2)' }}>ROI реферальной программы</span>
              <span style={{ fontWeight: 700, color: (referral.roi || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {referral.roi || 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Marketing tips */}
      <div style={{ ...card }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} style={{ color: 'var(--success)' }} /> Как улучшить маркетинг?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          <div>
            <strong style={{ color: 'var(--text)' }}>Воронка</strong> — ищите этап с наибольшим «провалом». Если мало первых покупок — улучшите welcome-бонус. Мало повторных — добавьте push после 7 дней.
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>ROI кампаний</strong> — если ROI отрицательный, кампания убыточна. Сравнивайте типы кампаний между собой. A/B тестируйте сообщения.
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>Рефералы</strong> — самый дешёвый канал привлечения. Если мало рефереров — увеличьте бонус. Если много рефереров но мало покупок — проблема в продукте.
          </div>
        </div>
      </div>
    </div>
  );
}
