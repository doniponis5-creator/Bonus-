'use client';
import { useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, Search, X } from 'lucide-react';
import { NAV_GROUPS, GROUP_COLORS } from '@/lib/nav';

export default function MenuHubPage() {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const groups = NAV_GROUPS
    .map(g => ({
      ...g,
      items: query
        ? g.items.filter(i => i.label.toLowerCase().includes(query) || (i.desc || '').toLowerCase().includes(query))
        : g.items,
    }))
    .filter(g => g.items.length > 0);

  const total = NAV_GROUPS.reduce((s, g) => s + g.items.length, 0);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LayoutGrid size={24} color="var(--accent)" />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Все разделы</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>{total} разделов — выберите нужный</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 420, margin: '18px 0 26px' }}>
        <Search size={18} color="var(--text3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Поиск раздела…"
          autoFocus
          style={{
            width: '100%', padding: '12px 40px', background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none',
          }}
        />
        {q && (
          <button onClick={() => setQ('')} aria-label="Очистить" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
            <X size={18} color="var(--text3)" />
          </button>
        )}
      </div>

      {/* Groups */}
      {groups.map(group => {
        const color = GROUP_COLORS[group.title] || '#3b82f6';
        return (
          <div key={group.title} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 10, background: color }} />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group.title}</h2>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>· {group.items.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="hub-card" style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
                    textDecoration: 'none', transition: 'all 0.18s ease',
                  }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: `${color}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={21} color={color} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                      {item.desc && <div style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</div>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Ничего не найдено</div>
      )}

      <style>{`
        .hub-card:hover {
          border-color: var(--border-strong) !important;
          background: var(--bg3) !important;
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}
