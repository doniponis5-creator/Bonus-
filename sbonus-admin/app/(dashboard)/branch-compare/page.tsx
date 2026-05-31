'use client';
import { useEffect, useState } from 'react';
import { Store, TrendingUp, Users, CreditCard, ArrowUpRight, ArrowDownRight, Award, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell } from 'recharts';
import { branchAPI } from '@/lib/api';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

export default function BranchComparePage() {
  const [data, setData] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview'|'trends'|'cashiers'>('overview');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      branchAPI.comparison(days),
      branchAPI.trends(Math.min(days, 90)),
    ]).then(([comp, tr]) => {
      setData(comp.data);
      setTrends(tr.data);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Загрузка...</div>;

  const branches = data?.branches || [];
  const totalRevenue = branches.reduce((s: number, b: any) => s + b.revenue, 0);

  // Radar data
  const radarData = branches.map((b: any) => ({
    name: b.name,
    revenue: b.revenue,
    transactions: b.transactions * 100,
    customers: b.unique_customers * 100,
    avgCheck: b.avg_check,
  }));

  // Trend chart data (merge all branches by date)
  const trendMap: Record<string, any> = {};
  (trends?.trends || []).forEach((br: any, bi: number) => {
    (br.daily || []).forEach((d: any) => {
      if (!trendMap[d.date]) trendMap[d.date] = { date: d.date };
      trendMap[d.date][br.name] = d.revenue;
    });
  });
  const trendData = Object.values(trendMap).sort((a: any, b: any) => a.date.localeCompare(b.date));

  const TABS = [
    { id: 'overview', label: 'Обзор', icon: <Store size={16} /> },
    { id: 'trends', label: 'Тренды', icon: <TrendingUp size={16} /> },
    { id: 'cashiers', label: 'Кассиры', icon: <Users size={16} /> },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Store size={24} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Сравнение филиалов</h1>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>{branches.length} филиалов • {days} дней</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: days === d ? '#6366f1' : '#1e293b', color: days === d ? 'white' : '#9ca3af' }}>{d}д</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#0f172a', borderRadius: 10, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t.id ? '#1e293b' : 'transparent', color: tab === t.id ? '#f1f5f9' : '#9ca3af' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Branch Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
            {branches.map((b: any, i: number) => {
              const pct = totalRevenue > 0 ? (b.revenue / totalRevenue * 100) : 0;
              return (
                <div key={i} style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: i === 0 ? '2px solid #6366f1' : '1px solid #334155', position: 'relative', overflow: 'hidden' }}>
                  {i === 0 && <div style={{ position: 'absolute', top: 10, right: 10 }}><Award size={20} color="#f59e0b" /></div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS[i % COLORS.length] + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS[i % COLORS.length], fontWeight: 700, fontSize: 16 }}>#{b.rank}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{b.name}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{b.city || b.address || '—'}</div>
                    </div>
                  </div>

                  <div style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>{Math.round(b.revenue).toLocaleString()} сом</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    {b.revenue_growth >= 0 ? <ArrowUpRight size={14} color="#10b981" /> : <ArrowDownRight size={14} color="#ef4444" />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: b.revenue_growth >= 0 ? '#10b981' : '#ef4444' }}>{b.revenue_growth > 0 ? '+' : ''}{b.revenue_growth}%</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>vs прошлый период</span>
                  </div>

                  {/* Revenue share bar */}
                  <div style={{ height: 6, background: '#374151', borderRadius: 3, marginBottom: 14, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 3 }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { l: 'Транзакции', v: b.transactions },
                      { l: 'Клиенты', v: b.unique_customers },
                      { l: 'Ср. чек', v: `${Math.round(b.avg_check).toLocaleString()}` },
                    ].map((m, j) => (
                      <div key={j} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{m.l}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{typeof m.v === 'number' ? m.v.toLocaleString() : m.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comparison Bar Chart */}
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Сравнение по выручке</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={branches} layout="vertical">
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#f1f5f9', fontSize: 13 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} formatter={(v: number) => [`${Math.round(v).toLocaleString()} сом`, 'Выручка']} />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                  {branches.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {tab === 'trends' && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Дневные тренды выручки</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={trendData}>
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
              <Legend />
              {(trends?.trends || []).map((br: any, i: number) => (
                <Line key={br.name} type="monotone" dataKey={br.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === 'cashiers' && (
        <CashierTab days={days} />
      )}
    </div>
  );
}

function CashierTab({ days }: { days: number }) {
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    branchAPI.cashierPerformance(days)
      .then(r => setCashiers(r.data.cashiers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div style={{ padding: 20, color: '#9ca3af' }}>Загрузка...</div>;

  return (
    <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Производительность кассиров</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              {['#', 'Кассир', 'Филиал', 'Транзакции', 'Выручка', 'Клиенты', 'Ср. чек'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cashiers.map((c, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: i < 3 ? '#f59e0b' : '#9ca3af' }}>{i + 1}</td>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f1f5f9' }}>{c.name}</td>
                <td style={{ padding: '10px 12px', color: '#9ca3af', fontSize: 13 }}>{c.branch}</td>
                <td style={{ padding: '10px 12px', color: '#f1f5f9' }}>{c.transactions}</td>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#10b981' }}>{Math.round(c.revenue).toLocaleString()} сом</td>
                <td style={{ padding: '10px 12px', color: '#f1f5f9' }}>{c.unique_customers}</td>
                <td style={{ padding: '10px 12px', color: '#f1f5f9' }}>{Math.round(c.avg_check).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
