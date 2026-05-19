'use client';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';
import { BarChart3, Loader2, TrendingUp, TrendingDown, Users, Repeat, Clock, Moon, AlertTriangle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  earn: { label: 'Начисление', color: '#FFE600' },
  spend: { label: 'Списание', color: '#f97316' },
  expire: { label: 'Истечение', color: '#8899aa' },
  promo: { label: 'Промокод', color: '#c084fc' },
  referral: { label: 'Реферал', color: '#60a5fa' },
  campaign: { label: 'Кампания', color: '#22c55e' },
  refund: { label: 'Возврат', color: '#fb923c' },
  birthday: { label: 'День рождения', color: '#fbbf24' },
};

const PERIOD_OPTIONS = [
  { label: '7 дней', value: 7 },
  { label: '30 дней', value: 30 },
  { label: '90 дней', value: 90 },
  { label: '365 дней', value: 365 },
];

const fmt = (v: number) => Number(v).toLocaleString('ru-RU') + ' KGS';

const tooltipStyle = {
  background: '#141c2b',
  border: '1px solid #1e293b',
  borderRadius: 10,
  color: '#e2eaf6',
  fontSize: 13,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  padding: '10px 14px',
};

const BUCKET_COLORS: Record<string, string> = {
  '7_days': '#22c55e',
  '14_days': '#FFE600',
  '30_days': '#f97316',
  '60_days': '#ef4444',
  '90_days': '#dc2626',
  'never': '#8899aa',
};

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [inactive, setInactive] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminAPI.analytics(period).then(r => setData(r.data)).catch(() => {}),
      adminAPI.inactiveCustomers().then(r => setInactive(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [period]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Loader2 size={16} className="animate-spin" /> Загрузка...
    </div>
  );

  if (!data) return null;

  const revenueUp = data.revenue_change_pct >= 0;
  const custUp = data.new_customers_current >= data.new_customers_previous;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={24} /> Детальная аналитика
        </h1>
        <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 10, padding: 3 }}>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setPeriod(opt.value)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: period === opt.value ? 'var(--accent)' : 'transparent',
                color: period === opt.value ? '#000' : 'var(--text2)',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comparison cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Выручка</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(data.revenue_current)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 13, fontWeight: 600, color: revenueUp ? '#22c55e' : '#ff4d4d' }}>
            {revenueUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {revenueUp ? '+' : ''}{data.revenue_change_pct}% vs пред. период
          </div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Новые клиенты</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{data.new_customers_current}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 13, fontWeight: 600, color: custUp ? '#22c55e' : '#ff4d4d' }}>
            {custUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            было {data.new_customers_previous}
          </div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
            <Repeat size={13} /> Retention
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{data.retention_rate}%</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
            {data.repeat_buyers} из {data.total_buyers} покупателей
          </div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Средний LTV</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{fmt(data.average_ltv)}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>бонусов на клиента</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Hourly activity */}
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} /> Активность по часам
          </h3>
          {data.hourly_activity?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.hourly_activity}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v: number) => `${v}:00`} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,230,0,0.06)' }}
                  formatter={(value: number, name: string) => [
                    name === 'count' ? `${value} покупок` : fmt(value),
                    name === 'count' ? 'Транзакции' : 'Выручка'
                  ]}
                  labelFormatter={(v: number) => `${v}:00 — ${v + 1}:00`}
                />
                <Bar dataKey="count" fill="#FFE600" radius={[3, 3, 0, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных</p>
          )}
        </div>

        {/* Transaction types distribution */}
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={16} /> Распределение операций
          </h3>
          {data.transaction_types?.length > 0 ? (() => {
            const pieData = data.transaction_types.map((t: any) => ({
              name: TYPE_LABELS[t.type]?.label || t.type,
              value: t.count,
              color: TYPE_LABELS[t.type]?.color || '#8899aa',
            }));
            return (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                    {pieData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,230,0,0.06)' }}
                    formatter={(value: number, name: string) => [`${value} операций`, name]}
                  />
                  <Legend verticalAlign="bottom" iconType="circle" iconSize={8}
                    formatter={(value: string) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            );
          })() : (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных</p>
          )}
        </div>
      </div>

      {/* Transaction types table */}
      {data.transaction_types?.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>Детализация по типам операций</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  {['Тип', 'Количество', 'Сумма'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.transaction_types.map((t: any) => {
                  const meta = TYPE_LABELS[t.type] || { label: t.type, color: '#8899aa' };
                  return (
                    <tr key={t.type}>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid #1c2a3a', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 600 }}>
                        {t.count.toLocaleString('ru-RU')}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 700, color: meta.color }}>
                        {fmt(t.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SLEEPING CUSTOMERS */}
      {inactive && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Moon size={20} /> Спящие клиенты
          </h2>

          {/* Summary cards */}
          <div className="grid-3" style={{ marginBottom: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Всего активных</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{inactive.total_active}</div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={12} /> Спящих клиентов
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f97316' }}>{inactive.total_sleeping}</div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>% спящих</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: inactive.sleeping_pct > 50 ? '#ef4444' : '#FFE600' }}>
                {inactive.sleeping_pct}%
              </div>
            </div>
          </div>

          {/* Buckets */}
          <div className="grid-3" style={{ gap: 12 }}>
            {Object.entries(inactive.buckets as Record<string, any>).map(([key, bucket]: [string, any]) => (
              <div key={key} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: BUCKET_COLORS[key] || '#8899aa' }} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{bucket.label}</span>
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 800, color: BUCKET_COLORS[key] || '#8899aa' }}>{bucket.count}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                  Бонусов на счетах: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{bucket.total_balance.toLocaleString('ru-RU')} KGS</span>
                </div>
                {bucket.customers.length > 0 && (
                  <div style={{ borderTop: '1px solid #1c2a3a', paddingTop: 10 }}>
                    {bucket.customers.map((c: any) => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          <span style={{ color: 'var(--text3)', marginLeft: 8 }}>{c.phone}</span>
                        </div>
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{c.balance.toLocaleString('ru-RU')} KGS</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
