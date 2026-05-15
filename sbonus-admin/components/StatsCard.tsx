import React from 'react';

interface Props { icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string; }

export default function StatsCard({ icon, label, value, sub, color = 'var(--accent)' }: Props) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 20, display: 'flex' }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{typeof value === 'number' ? value.toLocaleString('ru-RU') : value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{sub}</div>}
    </div>
  );
}
