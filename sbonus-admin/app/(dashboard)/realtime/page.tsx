'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { analyticsProAPI } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Activity, Clock, DollarSign, ShoppingCart, Users, Zap, RefreshCw,
  TrendingUp, ArrowUpRight, Eye,
} from 'lucide-react';

const card: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, padding: 24,
  border: '1px solid var(--border)',
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('ru-RU');
}
function fmtCur(n: number): string { return fmt(n) + ' сом'; }
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  return `${Math.floor(hrs / 24)} дн назад`;
}

const TX_TYPE_LABELS: Record<string, string> = {
  earn: '💰 Начисление', spend: '🛍 Списание', expire: '⏰ Истечение',
  refund: '↩ Возврат', birthday: '🎂 День рождения', referral: '👥 Реферал',
  promo: '🎟 Промокод', campaign: '📢 Кампания',
};
const TX_TYPE_COLORS: Record<string, string> = {
  earn: '#22c55e', spend: '#3b82f6', expire: '#f59e0b',
  refund: '#ef4444', birthday: '#ec4899', referral: '#8b5cf6',
  promo: '#06b6d4', campaign: '#f97316',
};

export default function RealtimePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await analyticsProAPI.realtime();
      setData(res.data);
      setLastUpdate(new Date());
      setPulse(true);
      setTimeout(() => setPulse(false), 500);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(load, 30000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, load]);

  if (loading || !data) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const todayStats = data.today || {};
  const lastHour = data.last_hour || {};
  const transactions = data.recent_transactions || [];
  const hourly = data.hourly_breakdown || [];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse-green{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.4)}70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Header with live indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Real-time мониторинг</h1>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: autoRefresh ? '#22c55e' : '#666',
              animation: autoRefresh ? 'pulse-green 2s infinite' : 'none',
            }} />
          </div>
          <p style={{ color: 'var(--text2)', margin: '4px 0 0', fontSize: 14 }}>
            {lastUpdate && `Обновлено: ${lastUpdate.toLocaleTimeString('ru-RU')} • `}
            Авто-обновление каждые 30 сек
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: autoRefresh ? 'rgba(34,197,94,.15)' : 'var(--bg2)',
              color: autoRefresh ? '#22c55e' : 'var(--text2)',
            }}
          >
            {autoRefresh ? '⏸ Пауза' : '▶ Включить'}
          </button>
          <button onClick={load} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            background: 'var(--accent)', color: '#000',
          }}>
            <RefreshCw size={14} style={{ marginRight: 4 }} /> Обновить
          </button>
        </div>
      </div>

      {/* Today stats — big KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Выручка сегодня', value: fmtCur(todayStats.revenue || 0), icon: DollarSign, color: '#22c55e' },
          { label: 'Транзакций', value: fmt(todayStats.tx_count || 0), icon: ShoppingCart, color: '#3b82f6' },
          { label: 'Активных клиентов', value: fmt(todayStats.active_customers || 0), icon: Users, color: '#8b5cf6' },
          { label: 'Средний чек', value: fmtCur(todayStats.avg_check || 0), icon: TrendingUp, color: '#f59e0b' },
          { label: 'Новые регистрации', value: fmt(todayStats.new_registrations || 0), icon: ArrowUpRight, color: '#06b6d4' },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} style={{
              ...card,
              transition: 'transform .2s',
              transform: pulse ? 'scale(1.02)' : 'scale(1)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>{k.label}</span>
                <Icon size={16} style={{ color: k.color, opacity: .7 }} />
              </div>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{k.value}</span>
            </div>
          );
        })}
      </div>

      {/* Last hour mini-stats */}
      <div style={{ ...card, marginBottom: 32, background: 'linear-gradient(135deg, rgba(255,230,0,.03), rgba(34,197,94,.03))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Clock size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>За последний час</h3>
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 14 }}>
          <div><span style={{ color: 'var(--text2)' }}>Транзакций:</span> <strong>{lastHour.tx_count || 0}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>Выручка:</span> <strong>{fmtCur(lastHour.revenue || 0)}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>Клиентов:</span> <strong>{lastHour.unique_customers || 0}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>Бонусов начислено:</span> <strong>{fmtCur(lastHour.bonus_issued || 0)}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>Бонусов потрачено:</span> <strong>{fmtCur(lastHour.bonus_spent || 0)}</strong></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Hourly breakdown chart */}
        <div style={card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Активность по часам (сегодня)</h3>
          {hourly.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--text2)' }}
                  tickFormatter={(h: number) => `${h}:00`} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text2)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  labelFormatter={(h: number) => `${h}:00 — ${h + 1}:00`}
                  formatter={(v: number, name: string) => [
                    name === 'revenue' ? fmtCur(v) : fmt(v),
                    name === 'revenue' ? 'Выручка' : 'Транзакции',
                  ]}
                />
                <Bar dataKey="tx_count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="tx_count" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Нет данных</p>
          )}
        </div>

        {/* Live transaction feed */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Activity size={18} style={{ color: '#22c55e' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Последние транзакции</h3>
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transactions.length > 0 ? transactions.map((tx: any, i: number) => {
              const typeLabel = TX_TYPE_LABELS[tx.type] || tx.type;
              const typeColor = TX_TYPE_COLORS[tx.type] || '#888';
              const isEarn = tx.type === 'earn';

              return (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 10, background: 'var(--bg2)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  animation: `slideIn .3s ease ${i * 0.05}s both`,
                  borderLeft: `3px solid ${typeColor}`,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{typeLabel}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                      {tx.customer_name || tx.customer_phone || 'Клиент'}
                      {tx.purchase_amount > 0 && ` • Покупка: ${fmtCur(tx.purchase_amount)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isEarn ? '#22c55e' : typeColor }}>
                      {isEarn ? '+' : ''}{fmt(tx.amount)} бонусов
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{timeAgo(tx.created_at)}</div>
                  </div>
                </div>
              );
            }) : (
              <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 20 }}>Нет транзакций сегодня</p>
            )}
          </div>
        </div>
      </div>

      {/* Pro tip */}
      <div style={{ ...card, background: 'linear-gradient(135deg, rgba(34,197,94,.05), rgba(59,130,246,.05))' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>⚡ Зачем real-time мониторинг?</h3>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          Следите за бизнесом в реальном времени: видите каждую транзакцию, отслеживайте пиковые часы, реагируйте на аномалии мгновенно.
          Если видите необычный спад — проверьте кассу. Если резкий рост — подготовьте запасы. Данные обновляются автоматически каждые 30 секунд.
        </p>
      </div>
    </div>
  );
}
