import React, { useEffect, useRef, useState } from 'react';

interface Props {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  /** Опционально: изменение в % (стрелка вверх/вниз) */
  trend?: number;
}

/** Count-up для числовых значений (уважает prefers-reduced-motion). */
function useCountUp(target: number, dur = 700): number {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      prev.current = target; setV(target); return;
    }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick); else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

export default function StatsCard({ icon, label, value, sub, color = 'var(--accent)', trend }: Props) {
  const isNum = typeof value === 'number';
  const animated = useCountUp(isNum ? (value as number) : 0);
  const trendUp = typeof trend === 'number' && trend >= 0;
  return (
    <div
      className="card kpi-card"
      style={{ ['--c' as any]: color, display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 20px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</span>
        <div className="kpi-icon">{icon}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div className="stat-value numeric" style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>
          {isNum ? animated.toLocaleString('ru-RU') : value}
        </div>
        {typeof trend === 'number' && (
          <span
            className="numeric"
            style={{
              fontSize: 12, fontWeight: 700,
              color: trendUp ? 'var(--success)' : 'var(--danger)',
              background: trendUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              padding: '2px 8px', borderRadius: 999,
            }}
          >
            {trendUp ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{sub}</div>}
    </div>
  );
}
