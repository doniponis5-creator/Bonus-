'use client';
import { useEffect, useState } from 'react';
import { qrAnalyticsAPI } from '@/lib/api';
import { QrCode, Loader2, Smartphone, Monitor, Tablet, Globe, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const tooltipStyle = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
  color: 'var(--text)', fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '10px 14px',
};

const DEVICE_COLORS: Record<string, string> = { mobile: '#22c55e', desktop: '#3b82f6', tablet: '#f59e0b', unknown: '#8899aa' };
const DEVICE_ICONS: Record<string, any> = { mobile: Smartphone, desktop: Monitor, tablet: Tablet, unknown: Globe };

export default function QRAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      qrAnalyticsAPI.overview(days).then(r => setData(r.data)).catch(() => {}),
      qrAnalyticsAPI.scans(20).then(r => setScans(r.data)).catch(() => setScans([])),
    ]).finally(() => setLoading(false));
  }, [days]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Loader2 size={16} className="animate-spin" /> Загрузка...
    </div>
  );

  if (!data) return <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Нет данных</div>;

  const deviceData = Object.entries(data.device_breakdown || {}).filter(([,v]) => (v as number) > 0).map(([k, v]) => ({
    name: k === 'mobile' ? 'Мобильный' : k === 'desktop' ? 'Десктоп' : k === 'tablet' ? 'Планшет' : 'Неизвестно',
    value: v as number, color: DEVICE_COLORS[k] || 'var(--text2)',
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <QrCode size={24} /> QR Аналитика
        </h1>
        <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 10, padding: 3 }}>
          {[{ l: '7д', v: 7 }, { l: '30д', v: 30 }, { l: '90д', v: 90 }].map(p => (
            <button key={p.v} onClick={() => setDays(p.v)} style={{
              padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: days === p.v ? 'var(--accent)' : 'transparent',
              color: days === p.v ? 'var(--on-accent)' : 'var(--text2)',
            }}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {[
          { label: 'Всего сканов', value: data.total_scans, color: 'var(--text)' },
          { label: 'Сегодня', value: data.scans_today, color: 'var(--success)' },
          { label: 'За неделю', value: data.scans_this_week, color: 'var(--info)' },
          { label: 'Уникальных QR', value: data.unique_qr_codes, color: 'var(--accent)' },
        ].map((c, i) => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Hourly chart */}
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>Сканы по часам</h3>
          {data.hourly_distribution?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.hourly_distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="hour" tick={{ fill: '#8899aa', fontSize: 10 }} tickFormatter={(v: number) => `${v}:00`} />
                <YAxis tick={{ fill: '#8899aa', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v: number) => `${v}:00 — ${v + 1}:00`} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="count" fill="#FFE600" radius={[3, 3, 0, 0]} name="Сканы" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных</p>}
        </div>

        {/* Device pie */}
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>Устройства</h3>
          {deviceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={deviceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                  {deviceData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'transparent' }} />
                <Legend verticalAlign="bottom" iconType="circle" iconSize={8}
                  formatter={(v: string) => <span style={{ color: 'var(--text2)', fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных</p>}
        </div>
      </div>

      {/* Top sources & campaigns */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>Топ источники</h3>
          {data.top_sources?.length > 0 ? data.top_sources.map((s: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--bg3)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.source}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{s.count}</span>
            </div>
          )) : <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных</p>}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>Топ кампании</h3>
          {data.top_campaigns?.length > 0 ? data.top_campaigns.map((c: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--bg3)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.campaign}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--info)' }}>{c.count}</span>
            </div>
          )) : <p style={{ color: 'var(--text3)', fontSize: 13 }}>Нет данных</p>}
        </div>
      </div>

      {/* Recent scans table */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>Последние сканирования</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                {['QR код', 'Клиент', 'Источник', 'Устройство', 'Дата'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--bg3)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scans.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Нет сканирований</td></tr>
              )}
              {scans.map((s, i) => (
                <tr key={i}>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--bg3)', fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)' }}>{s.qr_code?.slice(0, 12)}...</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--bg3)', fontSize: 13, fontWeight: 600 }}>{s.customer_name || '—'}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text2)' }}>{s.utm_source || 'direct'}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text2)' }}>{s.device_type || '—'}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text2)' }}>
                    {s.scanned_at ? new Date(s.scanned_at).toLocaleString('ru-RU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
