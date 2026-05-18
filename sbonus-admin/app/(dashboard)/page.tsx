'use client';
import { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import ExportButton from '@/components/ExportButton';
import { adminAPI } from '@/lib/api';
import {
  LayoutDashboard, Users, Coins, CreditCard, Landmark, Calendar,
  Trophy, Loader2, XCircle, TrendingUp, BarChart3, Bell, ShoppingCart,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts';

interface Stats {
  total_customers: number; active_customers: number;
  total_bonus_issued: string; total_bonus_spent: string; total_balance: string;
  transactions_today: number; transactions_month: number;
  tier_distribution: Record<string, number>;
}

interface TrendsData {
  daily: Array<{
    date: string; earn: number; spend: number;
    earn_count: number; spend_count: number; new_customers: number;
  }>;
  top_customers: Array<{ name: string; phone: string; total_purchase: number; transactions: number }>;
  average_check: number;
  period_days: number;
}

const fmt = (v: string | number) => Number(v).toLocaleString('ru-RU') + ' KGS';
const fmtShort = (v: number) => {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toString();
};

const TIER_COLORS: Record<string, string> = {
  Bronze: '#CD7F32', Silver: '#C0C0C0', Gold: '#FFD700', Platinum: '#B9F2FF',
};
const DEFAULT_TIER_COLOR = '#FFE600';

const PERIOD_OPTIONS = [
  { label: '7 дней', value: 7 },
  { label: '30 дней', value: 30 },
  { label: '90 дней', value: 90 },
  { label: '365 дней', value: 365 },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const [notifStats, setNotifStats] = useState<any>(null);

  const loadAll = () => {
    Promise.all([
      adminAPI.stats().then(r => setStats(r.data)),
      adminAPI.trends(period).then(r => setTrends(r.data)),
      adminAPI.notificationStats(7).then(r => setNotifStats(r.data)).catch(() => {}),
    ]).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
    // Auto-refresh every 60 seconds
    const interval = setInterval(loadAll, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Reload trends when period changes
  useEffect(() => {
    adminAPI.trends(period).then(r => setTrends(r.data)).catch(() => {});
  }, [period]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Loader2 size={16} className="animate-spin" /> Загрузка...
    </div>
  );
  if (!stats) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: 'var(--danger)' }}>
      <XCircle size={16} /> Ошибка загрузки
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <LayoutDashboard size={24} /> Дашборд
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Смарт Центр • S Bonus</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 10, padding: 3 }}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: period === opt.value ? 'var(--accent)' : 'transparent',
                  color: period === opt.value ? '#000' : 'var(--text2)',
                  transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <ExportButton />
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatsCard icon={<Users size={20} />} label="Клиенты" value={stats.total_customers} sub={`Активных: ${stats.active_customers}`} />
        <StatsCard icon={<Coins size={20} />} label="Выдано бонусов" value={fmt(stats.total_bonus_issued)} color="var(--accent)" />
        <StatsCard icon={<CreditCard size={20} />} label="Использовано" value={fmt(stats.total_bonus_spent)} color="var(--accent3)" />
        <StatsCard icon={<Landmark size={20} />} label="Баланс на счетах" value={fmt(stats.total_balance)} color="var(--accent2)" />
      </div>

      {/* Quick Stats Row */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatsCard icon={<Calendar size={20} />} label="Сегодня" value={stats.transactions_today} sub="транзакций" />
        <StatsCard icon={<BarChart3 size={20} />} label="За месяц" value={stats.transactions_month} sub="транзакций" />
        <StatsCard icon={<ShoppingCart size={20} />} label="Средний чек" value={trends ? fmt(trends.average_check) : '—'} color="var(--accent)" />
        <StatsCard icon={<TrendingUp size={20} />} label="Период" value={`${period} дн.`} sub={`${trends?.daily?.length || 0} точек данных`} />
      </div>

      {/* Notification Stats */}
      {notifStats && (
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatsCard icon={<Bell size={20} />} label="WhatsApp отправлено" value={notifStats.sent || 0} sub="за 7 дней" color="#25D366" />
          <StatsCard icon={<Bell size={20} />} label="Ошибки" value={notifStats.failed || 0} sub="за 7 дней" color="var(--danger)" />
          <StatsCard icon={<Bell size={20} />} label="В ожидании" value={notifStats.pending || 0} sub="в очереди" color="#f59e0b" />
          <StatsCard icon={<Bell size={20} />} label="Успешность" value={notifStats.total > 0 ? `${Math.round((notifStats.sent / notifStats.total) * 100)}%` : '—'} sub="доставки" color="#22c55e" />
        </div>
      )}

      {/* Earn/Spend Trends Chart */}
      {trends && trends.daily.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={16} /> Тренд начисления и использования бонусов
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trends.daily}>
              <defs>
                <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFE600" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FFE600" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={(v: string) => { const d = new Date(v); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`; }}
                interval={Math.max(0, Math.floor(trends.daily.length / 8))}
              />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtShort} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 13 }}
                formatter={(value: number, name: string) => [fmt(value), name === 'earn' ? 'Начислено' : 'Использовано']}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString('ru-RU')}
              />
              <Area type="monotone" dataKey="earn" stroke="#FFE600" fill="url(#earnGrad)" strokeWidth={2} name="earn" />
              <Area type="monotone" dataKey="spend" stroke="#f97316" fill="url(#spendGrad)" strokeWidth={2} name="spend" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* New Customers Trend + Transactions Count */}
      {trends && trends.daily.length > 0 && (
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <div className="card">
            <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={16} /> Новые клиенты
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trends.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={(v: string) => { const d = new Date(v); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`; }}
                  interval={Math.max(0, Math.floor(trends.daily.length / 6))}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 13 }}
                  formatter={(value: number) => [`${value} клиентов`, 'Новые']}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString('ru-RU')}
                />
                <Bar dataKey="new_customers" fill="#22c55e" radius={[4, 4, 0, 0]} name="Новые клиенты" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart3 size={16} /> Количество транзакций
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trends.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={(v: string) => { const d = new Date(v); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`; }}
                  interval={Math.max(0, Math.floor(trends.daily.length / 6))}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 13 }}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString('ru-RU')}
                />
                <Bar dataKey="earn_count" fill="#FFE600" radius={[4, 4, 0, 0]} name="Начислений" />
                <Bar dataKey="spend_count" fill="#f97316" radius={[4, 4, 0, 0]} name="Списаний" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bottom Row: Tier Donut + Top Customers */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Tier Distribution Donut */}
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trophy size={16} /> Распределение по уровням
          </h3>
          {(() => {
            const tierData = Object.entries(stats.tier_distribution).map(([name, value]) => ({
              name, value, color: TIER_COLORS[name] || DEFAULT_TIER_COLOR,
            }));
            const total = tierData.reduce((s, d) => s + d.value, 0);
            if (!total) return <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных</p>;
            return (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={tierData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value" stroke="none">
                    {tierData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 13 }}
                    formatter={(value: number, name: string) => [`${value} клиентов`, name]}
                  />
                  <Legend verticalAlign="bottom" iconType="circle" iconSize={8}
                    formatter={(value: string) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            );
          })()}
        </div>

        {/* Top Customers */}
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trophy size={16} /> Топ-5 клиентов за период
          </h3>
          {trends && trends.top_customers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trends.top_customers.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(30,41,59,0.5)', borderRadius: 10, padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'rgba(148,163,184,0.2)',
                      color: i < 3 ? '#000' : '#94a3b8', fontSize: 12, fontWeight: 700,
                    }}>
                      {i + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{c.phone} • {c.transactions} покупок</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                    {fmt(c.total_purchase)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных за период</p>
          )}
        </div>
      </div>
    </div>
  );
}
