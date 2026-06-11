import React, { useEffect, useRef, useState } from 'react';

interface Props { icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string; }

/** Count-up для числовых значений (уважает prefers-reduced-motion). */
function useCountUp(target: number, dur = 600): number {
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

export default function StatsCard({ icon, label, value, sub, color = 'var(--accent)' }: Props) {
  const isNum = typeof value === 'number';
  const animated = useCountUp(isNum ? (value as number) : 0);
  return (
    <div className="card fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 20, display: 'flex', color: 'var(--text3)' }}>{icon}</span>
      </div>
      <div className="stat-value numeric" style={{ fontSize: 26, fontWeight: 700, color }}>
        {isNum ? animated.toLocaleString('ru-RU') : value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{sub}</div>}
    </div>
  );
}
