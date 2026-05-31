'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { analyticsProAPI } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import {
  Activity, DollarSign, ShoppingCart, Users, Clock, TrendingUp,
  Zap, RefreshCw, Radio, CreditCard, Gift, ArrowUpRight,
  Pause, Play, Eye,
  Coins, Megaphone, RotateCcw, Cake,
} from 'lucide-react';

const TX_CONFIG: Record<string, { Icon: any; color: string; label: string; sign: string }> = {
  earn: { Icon: Coins, color: '#10b981', label: 'Покупка', sign: '+' },
  spend: { Icon: ShoppingCart, color: '#ef4444', label: 'Списание', sign: '-' },
  expire: { Icon: Clock, color: '#6b7280', label: 'Истекло', sign: '-' },
  refund: { Icon: RotateCcw, color: '#f59e0b', label: 'Возврат', sign: '+' },
  birthday: { Icon: Cake, color: '#ec4899', label: 'ДР', sign: '+' },
  referral: { Icon: Users, color: '#8b5cf6', label: 'Реферал', sign: '+' },
  promo: { Icon: Gift, color: '#06b6d4', label: 'Промо', sign: '+' },
  campaign: { Icon: Megaphone, color: '#6366f1', label: 'Кампания', sign: '+' },
};

export default function RealtimePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const { data: d } = await analyticsProAPI.realtime();
      setData(d);
      setLastUpdate(new Date());
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 15000); // 15 sec
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, load]);

  const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
  const fmtK = (n: number) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n/1000)}K` : String(Math.round(n));
  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}с назад`;
    if (diff < 3600) return `${Math.round(diff/60)}м назад`;
    return `${Math.round(diff/3600)}ч назад`;
  };

  if (loading || !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Activity size={18} className="animate-spin" /> Подключение...
    </div>
  );

  const hourlyData = (data.hourly_breakdown || []).map((h: any) => ({
    ...h, label: `${h.hour}:00`,
  }));

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: pulse ? 'linear-gradient(135deg, #ef4444, #f97316)' : 'linear-gradient(135deg, #10b981, #06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.3s',
          }}>
            <Radio size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Live Dashboard
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: autoRefresh ? '#10b981' : '#6b7280',
                display: 'inline-block',
                animation: autoRefresh ? 'pulse 2s infinite' : 'none',
              }} />
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>
              Обновлено: {lastUpdate.toLocaleTimeString('ru')}
              {autoRefresh && ' • авто-обновление 15с'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setAutoRefresh(!autoRefresh)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: autoRefresh ? '#10b98122' : 'transparent',
            color: autoRefresh ? '#10b981' : 'var(--text3)', fontSize: 12, cursor: 'pointer',
          }}>
            {autoRefresh ? <Pause size={14} /> : <Play size={14} />}
            {autoRefresh ? 'Пауза' : 'Возобновить'}
          </button>
          <button onClick={load} style={{
            padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <RefreshCw size={14} /> Сейчас
          </button>
        </div>
      </div>

      {/* Today KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Выручка сегодня', value: fmt(data.today.revenue) + ' сом', icon: DollarSign, color: '#6366f1' },
          { label: 'Транзакций', value: fmt(data.today.tx_count), icon: ShoppingCart, color: '#8b5cf6' },
          { label: 'Ср. чек', value: fmt(data.today.avg_check) + ' сом', icon: CreditCard, color: '#06b6d4' },
          { label: 'Клиентов', value: fmt(data.today.active_customers), icon: Users, color: '#10b981' },
          { label: 'Новых', value: fmt(data.today.new_registrations), icon: TrendingUp, color: '#f59e0b' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--bg2)', borderRadius: 14, padding: 16,
            border: '1px solid var(--border)',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: kpi.color + '22',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
            }}>
              <kpi.icon size={17} color={kpi.color} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Last Hour Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.05))',
        borderRadius: 14, padding: 16, marginBottom: 20,
        border: '1px solid rgba(99,102,241,0.2)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} color="#6366f1" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Последний час</span>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>
            <b style={{ color: '#6366f1' }}>{fmt(data.last_hour.revenue)}</b> сом
          </span>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>
            <b style={{ color: '#8b5cf6' }}>{data.last_hour.tx_count}</b> операций
          </span>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>
            <b style={{ color: '#10b981' }}>{data.last_hour.unique_customers}</b> клиентов
          </span>
        </div>
      </div>

      {/* Chart + Live Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Hourly chart */}
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} color="#6366f1" /> По часам
          </h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="liveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text3)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} tickFormatter={(v: number) => fmtK(v)} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, n: string) => [n === 'revenue' ? fmt(v) + ' сом' : v, n === 'revenue' ? 'Выручка' : 'Операций']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#liveGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live feed */}
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} color="#f59e0b" /> Live Feed
          </h3>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {(data.recent_transactions || []).map((tx: any, i: number) => {
              const conf = TX_CONFIG[tx.type] || TX_CONFIG.earn;
              const isRecent = (Date.now() - new Date(tx.created_at).getTime()) < 300000; // 5 min

              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                  animation: i === 0 && pulse ? 'fadeIn 0.3s ease-in' : 'none',
                }}>
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <conf.Icon size={20} style={{ color: conf.color }} />
                    {isRecent && (
                      <span style={{
                        position: 'absolute', top: -2, right: -2, width: 6, height: 6,
                        borderRadius: '50%', background: '#10b981',
                      }} />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.customer_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {conf.label} • {timeAgo(tx.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: conf.color }}>
                      {conf.sign}{fmt(tx.amount)}
                    </div>
                    {tx.purchase_amount > 0 && tx.type === 'earn' && (
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                        {fmt(tx.purchase_amount)} сом
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {(!data.recent_transactions || data.recent_transactions.length === 0) && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>
                Нет операций
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
