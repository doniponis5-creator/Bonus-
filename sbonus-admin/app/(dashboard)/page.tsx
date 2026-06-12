'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import StatsCard from '@/components/StatsCard';
import ExportButton from '@/components/ExportButton';
import { adminAPI, analyticsProAPI } from '@/lib/api';
import {
  Users, Coins, CreditCard, Landmark, Calendar, UserPlus,
  Trophy, Loader2, XCircle, TrendingUp, BarChart3, Bell, ShoppingCart,
  ClipboardCheck, FlaskConical, Megaphone, ChevronRight, Activity,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
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

const fmt = (v: string | number) => Number(v).toLocaleString('ru-RU') + ' сом';
const fmtShort = (v: number) => {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toString();
};
const fmtDate = (v: string) => {
  const d = new Date(v);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const tooltipStyle = {
  background: 'rgba(19,27,43,0.92)',
  backdropFilter: 'blur(12px)',
  border: '1px solid var(--border-strong)',
  borderRadius: 12,
  color: 'var(--text)',
  fontSize: 13,
  boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
  padding: '10px 14px',
};

// Recharts SVG fills — hex literals required (CSS vars do not work in SVG attrs)
const TIER_COLORS: Record<string, string> = {
  Bronze: '#CD7F32', Silver: '#C0C0C0', Gold: '#FFD700', Platinum: '#7DD3FC',
};
const DEFAULT_TIER_COLOR = '#FFE600';
const MEDALS = [
  'linear-gradient(135deg, #FFE600, #FFB800)',
  'linear-gradient(135deg, #E8E8E8, #9CA3AF)',
  'linear-gradient(135deg, #E3964A, #B06A28)',
];

const PERIOD_OPTIONS = [
  { label: '7 дней', value: 7 },
  { label: '30 дней', value: 30 },
  { label: '90 дней', value: 90 },
  { label: '365 дней', value: 365 },
];

/** Заголовок секции с иконкой в цветной плитке */
function SectionTitle({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <div className="icon-tile" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent-dim)', color: 'var(--accent)' }}>
        {icon}
      </div>
      <h3 className="h3" style={{ color: 'var(--text)' }}>{children}</h3>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}

/** Легенда-пилюля для графиков */
function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
      color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 999, padding: '4px 12px',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const [notifStats, setNotifStats] = useState<any>(null);
  const [realtime, setRealtime] = useState<any>(null);

  const loadAll = () => {
    Promise.all([
      adminAPI.stats().then(r => setStats(r.data)),
      adminAPI.trends(period).then(r => setTrends(r.data)),
      adminAPI.notificationStats(7).then(r => setNotifStats(r.data)).catch(() => {}),
      analyticsProAPI.realtime().then(r => setRealtime(r.data)).catch(() => {}),
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
    <div style={{ padding: '8px 0' }}>
      <div className="skeleton" style={{ height: 56, marginBottom: 20, maxWidth: 420 }} />
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 110 }} />)}
      </div>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 110 }} />)}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
  if (!stats) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: 'var(--danger)' }}>
      <XCircle size={16} /> Ошибка загрузки
    </div>
  );

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="h1" style={{ fontSize: 26 }}>
            {(() => { const h = new Date().getHours(); return h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; })()},{' '}
            <span className="text-gradient">DonLee</span>
          </h1>
          <p className="caption" style={{ marginTop: 5, fontSize: 13 }}>
            {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })} · Смарт Центр · S Bonus
          </p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="seg period-selector">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setPeriod(opt.value)}
                className={`seg-item ${period === opt.value ? 'active' : ''}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <ExportButton />
        </div>
      </div>

      {/* ── Сейчас в магазине (live) ── */}
      {realtime?.today && (
        <div className="card card-accent fade-up" style={{ marginBottom: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span className="live-dot" />
            <span className="h3">Сегодня сейчас</span>
            <span className="caption" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Activity size={13} /> обновляется каждую минуту
            </span>
          </div>
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              { label: 'Выручка', v: `${Number(realtime.today.revenue || 0).toLocaleString('ru-RU')} сом`, c: 'var(--accent)' },
              { label: 'Чеков', v: String(realtime.today.tx_count || 0), c: 'var(--text)' },
              { label: 'Средний чек', v: `${Number(realtime.today.avg_check || 0).toLocaleString('ru-RU')} сом`, c: 'var(--text)' },
              { label: 'Покупателей', v: String(realtime.today.active_customers || 0), c: 'var(--text)' },
              { label: 'Новых клиентов', v: String(realtime.today.new_registrations || 0), c: 'var(--success)' },
            ].map(t => (
              <div key={t.label} style={{
                background: 'var(--bg2)', borderRadius: 12, padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.03)',
              }}>
                <div className="caption">{t.label}</div>
                <div className="numeric" style={{ fontSize: 18, fontWeight: 700, color: t.c, marginTop: 2 }}>{t.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Быстрые действия ── */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 22 }}>
        {[
          { href: '/biz-report', icon: ClipboardCheck, title: 'Бизнес-отчёт', desc: 'План действий недели' },
          { href: '/profit-lab', icon: FlaskConical, title: 'Прибыль Lab', desc: 'Скидки · комбо · ROI' },
          { href: '/campaigns', icon: Megaphone, title: 'Кампании', desc: 'Запустить рассылку' },
          { href: '/customers', icon: Users, title: 'Клиенты', desc: 'Поиск и база' },
        ].map(a => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href} className="card" style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginBottom: 0,
              cursor: 'pointer', textDecoration: 'none',
            }}>
              <div className="icon-tile" style={{ background: 'var(--accent-dim)' }}>
                <Icon size={17} color="var(--accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.title}</div>
                <div className="caption" style={{ marginTop: 1 }}>{a.desc}</div>
              </div>
              <ChevronRight size={15} color="var(--text3)" />
            </Link>
          );
        })}
      </div>

      {/* ── Main Stats Cards ── */}
      <div className="grid-4 stagger" style={{ marginBottom: 16 }}>
        <StatsCard icon={<Users size={18} />} label="Клиенты" value={stats.total_customers} sub={`Активных: ${stats.active_customers}`} color="var(--info)" />
        <StatsCard icon={<Coins size={18} />} label="Выдано бонусов" value={fmt(stats.total_bonus_issued)} color="var(--accent)" />
        <StatsCard icon={<CreditCard size={18} />} label="Использовано" value={fmt(stats.total_bonus_spent)} color="var(--violet)" />
        <StatsCard icon={<Landmark size={18} />} label="Баланс на счетах" value={fmt(stats.total_balance)} color="var(--accent)" />
      </div>

      {/* ── Quick Stats Row ── */}
      <div className="grid-4 stagger" style={{ marginBottom: 16 }}>
        <StatsCard icon={<Calendar size={18} />} label="Сегодня" value={stats.transactions_today} sub="транзакций" color="var(--text)" />
        <StatsCard icon={<BarChart3 size={18} />} label="За месяц" value={stats.transactions_month} sub="транзакций" color="var(--info)" />
        <StatsCard icon={<ShoppingCart size={18} />} label="Средний чек" value={trends ? fmt(trends.average_check) : '—'} color="var(--accent)" />
        <StatsCard icon={<UserPlus size={18} />} label="Новых клиентов" value={trends?.daily ? trends.daily.reduce((s, d) => s + (d.new_customers || 0), 0) : 0} sub={`за ${period} дн.`} color="var(--success)" />
      </div>

      {/* ── Notification Stats ── */}
      {notifStats && (
        <div className="grid-4 stagger" style={{ marginBottom: 22 }}>
          <StatsCard icon={<Bell size={18} />} label="WhatsApp отправлено" value={notifStats.sent || 0} sub="за 7 дней" color="var(--success)" />
          <StatsCard icon={<Bell size={18} />} label="Ошибки" value={notifStats.failed || 0} sub="за 7 дней" color="var(--danger)" />
          <StatsCard icon={<Bell size={18} />} label="В ожидании" value={notifStats.pending || 0} sub="в очереди" color="var(--warn)" />
          <StatsCard icon={<Bell size={18} />} label="Успешность" value={notifStats.total > 0 ? `${Math.round((notifStats.sent / notifStats.total) * 100)}%` : '—'} sub="доставки" color="var(--success)" />
        </div>
      )}

      {/* ── Earn/Spend Trends Chart ── */}
      {trends && trends.daily.length > 0 && (
        <div className="card fade-up" style={{ marginBottom: 16 }}>
          <SectionTitle
            icon={<TrendingUp size={15} />}
            right={
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <LegendPill color="#FFE600" label="Начислено" />
                <LegendPill color="#8b5cf6" label="Использовано" />
              </div>
            }
          >
            Тренд начисления и использования бонусов
          </SectionTitle>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={trends.daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFE600" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#FFE600" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="earnStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FFE600" />
                  <stop offset="100%" stopColor="#FFC400" />
                </linearGradient>
                <linearGradient id="spendStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis
                dataKey="date" axisLine={false} tickLine={false}
                tick={{ fill: '#8899aa', fontSize: 11 }}
                tickFormatter={fmtDate}
                interval={Math.max(0, Math.floor(trends.daily.length / 8))}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8899aa', fontSize: 11 }} tickFormatter={fmtShort} width={44} />
              <Tooltip
                contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,230,0,0.25)', strokeWidth: 1, strokeDasharray: '4 4' }}
                formatter={(value: number, name: string) => [fmt(value), name === 'earn' ? 'Начислено' : 'Использовано']}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
              />
              <Area type="monotone" dataKey="earn" stroke="url(#earnStroke)" fill="url(#earnGrad)"
                strokeWidth={2.5} name="earn" dot={false}
                activeDot={{ r: 5, fill: '#FFE600', stroke: '#0a0f1a', strokeWidth: 2 }}
                animationDuration={900} />
              <Area type="monotone" dataKey="spend" stroke="url(#spendStroke)" fill="url(#spendGrad)"
                strokeWidth={2.5} name="spend" dot={false}
                activeDot={{ r: 5, fill: '#8b5cf6', stroke: '#0a0f1a', strokeWidth: 2 }}
                animationDuration={900} animationBegin={150} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── New Customers Trend + Transactions Count ── */}
      {trends && trends.daily.length > 0 && (
        <div className="grid-2 stagger" style={{ marginBottom: 16 }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <SectionTitle icon={<Users size={15} />}>Новые клиенты</SectionTitle>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={trends.daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="newCustGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ade80" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis
                  dataKey="date" axisLine={false} tickLine={false}
                  tick={{ fill: '#8899aa', fontSize: 10 }}
                  tickFormatter={fmtDate}
                  interval={Math.max(0, Math.floor(trends.daily.length / 6))}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8899aa', fontSize: 10 }} allowDecimals={false} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 6 }}
                  formatter={(value: number) => [`${value} клиентов`, 'Новые']}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString('ru-RU')}
                />
                <Bar dataKey="new_customers" fill="url(#newCustGrad)" radius={[5, 5, 0, 0]} maxBarSize={26} name="Новые клиенты" animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <SectionTitle
              icon={<BarChart3 size={15} />}
              right={
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <LegendPill color="#FFE600" label="Начисления" />
                  <LegendPill color="#8b5cf6" label="Списания" />
                </div>
              }
            >
              Количество транзакций
            </SectionTitle>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={trends.daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barGap={2}>
                <defs>
                  <linearGradient id="earnCntGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFE600" />
                    <stop offset="100%" stopColor="#D9A800" />
                  </linearGradient>
                  <linearGradient id="spendCntGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis
                  dataKey="date" axisLine={false} tickLine={false}
                  tick={{ fill: '#8899aa', fontSize: 10 }}
                  tickFormatter={fmtDate}
                  interval={Math.max(0, Math.floor(trends.daily.length / 6))}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8899aa', fontSize: 10 }} allowDecimals={false} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 6 }}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString('ru-RU')}
                />
                <Bar dataKey="earn_count" fill="url(#earnCntGrad)" radius={[5, 5, 0, 0]} maxBarSize={18} name="Начислений" animationDuration={900} />
                <Bar dataKey="spend_count" fill="url(#spendCntGrad)" radius={[5, 5, 0, 0]} maxBarSize={18} name="Списаний" animationDuration={900} animationBegin={120} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Bottom Row: Tier Donut + Top Customers ── */}
      <div className="grid-2 stagger" style={{ marginBottom: 24 }}>
        {/* Tier Distribution Donut */}
        <div className="card" style={{ marginBottom: 0 }}>
          <SectionTitle icon={<Trophy size={15} />}>Распределение по уровням</SectionTitle>
          {(() => {
            const tierData = Object.entries(stats.tier_distribution).map(([name, value]) => ({
              name, value, color: TIER_COLORS[name] || DEFAULT_TIER_COLOR,
            }));
            const total = tierData.reduce((s, d) => s + d.value, 0);
            if (!total) return <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных</p>;
            return (
              <>
                <div style={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={tierData} cx="50%" cy="50%"
                        innerRadius={68} outerRadius={98}
                        paddingAngle={4} cornerRadius={6}
                        dataKey="value" stroke="none"
                        animationDuration={900}
                      >
                        {tierData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number, name: string) => [`${value} клиентов (${Math.round((value / total) * 100)}%)`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                  }}>
                    <div className="numeric" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{total.toLocaleString('ru-RU')}</div>
                    <div className="caption" style={{ marginTop: 4 }}>клиентов</div>
                  </div>
                </div>
                {/* Legend with bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  {tierData.map(t => {
                    const pct = Math.round((t.value / total) * 100);
                    return (
                      <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, boxShadow: `0 0 8px ${t.color}`, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', width: 70 }}>{t.name}</span>
                        <div className="progress" style={{ flex: 1 }}>
                          <div className="progress-fill" style={{ width: `${pct}%`, background: t.color }} />
                        </div>
                        <span className="numeric" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', width: 64, textAlign: 'right' }}>
                          {t.value} · {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>

        {/* Top Customers */}
        <div className="card" style={{ marginBottom: 0 }}>
          <SectionTitle icon={<Trophy size={15} />}>Топ-5 клиентов за период</SectionTitle>
          {trends && trends.top_customers.length > 0 ? (
            <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                const maxPurchase = Math.max(...trends.top_customers.map(c => c.total_purchase), 1);
                return trends.top_customers.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--bg2)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="numeric" style={{
                          width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: i < 3 ? MEDALS[i] : 'var(--bg3)',
                          color: i < 3 ? '#0a0f1a' : 'var(--text2)', fontSize: 12, fontWeight: 800,
                          boxShadow: i === 0 ? '0 0 14px -3px rgba(255,230,0,0.6)' : 'none',
                        }}>
                          {i + 1}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.phone} • {c.transactions} покупок</div>
                        </div>
                      </div>
                      <div className="numeric" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                        {fmt(c.total_purchase)}
                      </div>
                    </div>
                    <div className="progress" style={{ height: 4 }}>
                      <div className="progress-fill" style={{ width: `${Math.max(4, Math.round((c.total_purchase / maxPurchase) * 100))}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных за период</p>
          )}
        </div>
      </div>
    </div>
  );
}
