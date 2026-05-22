'use client';
import { useEffect, useState, useCallback } from 'react';
import { analyticsProAPI } from '@/lib/api';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart,
  Target, RefreshCw, ArrowUpRight, ArrowDownRight, Info,
} from 'lucide-react';

/* ── Стили ── */
const card: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, padding: 24,
  border: '1px solid var(--border)',
};
const kpiCard: React.CSSProperties = {
  ...card, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative',
};
const badge = (positive: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
  padding: '2px 8px', borderRadius: 20,
  background: positive ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
  color: positive ? '#22c55e' : '#ef4444',
});
const periodBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  background: active ? 'var(--accent)' : 'var(--bg2)',
  color: active ? '#000' : 'var(--text2)',
  transition: 'all .2s',
});
const tooltip: React.CSSProperties = {
  position: 'absolute', top: 8, right: 8, cursor: 'help', color: 'var(--text2)', opacity: .5,
};

const RFM_COLORS: Record<string, string> = {
  champions: '#22c55e', loyal: '#3b82f6', potential_loyal: '#8b5cf6',
  new_customers: '#06b6d4', sleeping: '#f59e0b', at_risk: '#f97316', lost: '#ef4444',
};
const RFM_LABELS: Record<string, string> = {
  champions: 'Чемпионы', loyal: 'Лояльные', potential_loyal: 'Перспективные',
  new_customers: 'Новые', sleeping: 'Засыпающие', at_risk: 'Под риском', lost: 'Потерянные',
};
const RFM_TIPS: Record<string, string> = {
  champions: 'Покупают часто и много. Предложите VIP-программу.',
  loyal: 'Стабильные клиенты. Поддерживайте контакт.',
  potential_loyal: 'Покупают недавно. Стимулируйте повторные покупки.',
  new_customers: 'Только начали. Отправьте welcome-предложение.',
  sleeping: 'Давно не были. Напомните о себе акцией.',
  at_risk: 'Раньше были активны. Срочная реактивация!',
  lost: 'Потеряны. Агрессивная акция или отпустите.',
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('ru-RU');
}
function fmtCur(n: number): string { return fmt(n) + ' сум'; }
function pctChange(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export default function BusinessAnalyticsPage() {
  const [period, setPeriod] = useState(30);
  const [biz, setBiz] = useState<any>(null);
  const [cohorts, setCohorts] = useState<any>(null);
  const [rfm, setRfm] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRfm, setActiveRfm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, c, r, t] = await Promise.all([
        analyticsProAPI.business(period),
        analyticsProAPI.cohorts(6),
        analyticsProAPI.rfm(),
        analyticsProAPI.dailyTrends(period),
      ]);
      setBiz(b.data); setCohorts(c.data); setRfm(r.data); setTrends(t.data?.trends || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading || !biz) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const kpis = [
    { label: 'Выручка', value: fmtCur(biz.revenue), prev: biz.prev_revenue, cur: biz.revenue, icon: DollarSign, color: '#22c55e' },
    { label: 'Транзакции', value: fmt(biz.tx_count), prev: biz.prev_tx_count, cur: biz.tx_count, icon: ShoppingCart, color: '#3b82f6' },
    { label: 'Средний чек', value: fmtCur(biz.avg_check), prev: biz.prev_avg_check, cur: biz.avg_check, icon: Target, color: '#8b5cf6' },
    { label: 'Активные клиенты', value: fmt(biz.active_buyers), prev: biz.prev_active_buyers, cur: biz.active_buyers, icon: Users, color: '#f59e0b' },
    { label: 'LTV (средний)', value: fmtCur(biz.ltv), prev: biz.prev_ltv || 0, cur: biz.ltv, icon: TrendingUp, color: '#06b6d4' },
    { label: 'Burn Rate', value: biz.burn_rate + '%', prev: biz.prev_burn_rate || 0, cur: biz.burn_rate, icon: TrendingDown, color: '#ef4444' },
  ];

  const rfmData = rfm?.segments ? Object.entries(rfm.segments).map(([key, val]: any) => ({
    name: RFM_LABELS[key] || key, value: val.count, key,
    avg_revenue: val.avg_revenue, pct: val.percent,
  })).filter((s: any) => s.value > 0) : [];

  // Cohort heatmap data
  const cohortMonths = cohorts?.cohorts || [];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Бизнес-аналитика PRO</h1>
          <p style={{ color: 'var(--text2)', margin: '4px 0 0', fontSize: 14 }}>
            Ключевые метрики вашего бизнеса — сравнение по периодам
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

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        {kpis.map((k, i) => {
          const change = pctChange(k.cur, k.prev);
          const positive = change >= 0;
          const Icon = k.icon;
          return (
            <div key={i} style={kpiCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{k.label}</span>
                <Icon size={18} style={{ color: k.color, opacity: .7 }} />
              </div>
              <span style={{ fontSize: 26, fontWeight: 700 }}>{k.value}</span>
              <span style={badge(k.label === 'Burn Rate' ? !positive : positive)}>
                {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(change)}% vs пред. период
              </span>
            </div>
          );
        })}
      </div>

      {/* Revenue Trend Chart */}
      <div style={{ ...card, marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Тренд выручки и транзакций</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={trends}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text2)' }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--text2)' }} tickFormatter={(v: number) => fmt(v)} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--text2)' }} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              formatter={(v: number, name: string) => [name === 'revenue' ? fmtCur(v) : fmt(v), name === 'revenue' ? 'Выручка' : 'Транзакции']}
            />
            <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#22c55e" fill="url(#gRev)" strokeWidth={2} name="revenue" />
            <Line yAxisId="right" type="monotone" dataKey="tx_count" stroke="#3b82f6" strokeWidth={2} dot={false} name="tx_count" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two columns: RFM + Cohort */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* RFM Segmentation */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>RFM-сегментация клиентов</h3>
            <div style={tooltip} title="Recency-Frequency-Monetary: группировка клиентов по давности, частоте и сумме покупок"><Info size={16} /></div>
          </div>
          {rfmData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={rfmData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={100} innerRadius={50}
                    onMouseEnter={(_: any, idx: number) => setActiveRfm(rfmData[idx]?.key)}
                    onMouseLeave={() => setActiveRfm(null)}
                  >
                    {rfmData.map((s: any, i: number) => (
                      <Cell key={i} fill={RFM_COLORS[s.key] || '#888'} stroke="var(--card)" strokeWidth={2}
                        opacity={activeRfm && activeRfm !== s.key ? 0.4 : 1} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v + ' клиентов', name]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
              {activeRfm && RFM_TIPS[activeRfm] && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--bg2)', fontSize: 13, color: 'var(--text2)', borderLeft: `3px solid ${RFM_COLORS[activeRfm]}` }}>
                  <strong>{RFM_LABELS[activeRfm]}:</strong> {RFM_TIPS[activeRfm]}
                </div>
              )}
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {rfmData.map((s: any) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'var(--bg2)', cursor: 'pointer' }}
                    onMouseEnter={() => setActiveRfm(s.key)} onMouseLeave={() => setActiveRfm(null)}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: RFM_COLORS[s.key] }} />
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <span style={{ fontWeight: 600 }}>{s.value}</span>
                    <span style={{ color: 'var(--text2)', fontSize: 11 }}>({s.pct}%)</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Недостаточно данных для RFM-анализа</p>
          )}
        </div>

        {/* Cohort Retention */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Когортный анализ удержания</h3>
            <div style={tooltip} title="Показывает % клиентов, вернувшихся через N месяцев после регистрации"><Info size={16} /></div>
          </div>
          {cohortMonths.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text2)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Когорта</th>
                    <th style={{ padding: '8px 6px', color: 'var(--text2)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Кол-во</th>
                    {[1, 2, 3, 4, 5, 6].map(m => (
                      <th key={m} style={{ padding: '8px 6px', color: 'var(--text2)', fontWeight: 500, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>M{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohortMonths.map((c: any) => (
                    <tr key={c.month}>
                      <td style={{ padding: '6px', fontWeight: 500, whiteSpace: 'nowrap' }}>{c.month}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: 500 }}>{c.size}</td>
                      {(c.retention || []).map((r: number, i: number) => {
                        const intensity = Math.min(r / 100, 1);
                        const bg = r > 0
                          ? `rgba(34, 197, 94, ${0.1 + intensity * 0.6})`
                          : 'transparent';
                        return (
                          <td key={i} style={{ padding: '6px', textAlign: 'center', background: bg, borderRadius: 4, fontWeight: r > 30 ? 600 : 400 }}>
                            {r > 0 ? r + '%' : '—'}
                          </td>
                        );
                      })}
                      {/* Fill empty cells if retention array is short */}
                      {Array.from({ length: Math.max(0, 6 - (c.retention?.length || 0)) }).map((_, i) => (
                        <td key={`e${i}`} style={{ padding: '6px', textAlign: 'center', color: 'var(--text2)' }}>—</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Нужно минимум 2 месяца данных</p>
          )}
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'var(--bg2)', fontSize: 13, color: 'var(--text2)' }}>
            <strong>Как читать:</strong> Каждая строка — когорта клиентов, зарегистрированных в этом месяце. M1 = % вернувшихся через 1 месяц, M2 = через 2 и т.д. Зелёный — хорошее удержание.
          </div>
        </div>
      </div>

      {/* Avg Check Trend */}
      <div style={{ ...card, marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Средний чек по дням</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text2)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text2)' }} tickFormatter={(v: number) => fmt(v)} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              formatter={(v: number) => [fmtCur(v), 'Ср. чек']}
            />
            <Bar dataKey="avg_check" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary info */}
      <div style={{ ...card, background: 'linear-gradient(135deg, rgba(255,230,0,.05), rgba(34,197,94,.05))' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>📊 Что значат эти метрики?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          <div>
            <strong style={{ color: 'var(--text)' }}>LTV (Lifetime Value)</strong> — сколько в среднем один клиент принёс за всё время. Чем выше — тем лучше работает удержание.
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>Burn Rate</strong> — какой % начисленных бонусов клиенты потратили. Оптимально 40-70%. Ниже — бонусы не мотивируют, выше — слишком дорого.
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>RFM-анализ</strong> — разделяет клиентов на сегменты по давности, частоте и сумме покупок. Каждому сегменту — своя стратегия.
          </div>
          <div>
            <strong style={{ color: 'var(--text)' }}>Когортный анализ</strong> — показывает, как быстро новые клиенты возвращаются. Если M1 &lt; 20% — нужно улучшать первое впечатление.
          </div>
        </div>
      </div>
    </div>
  );
}
