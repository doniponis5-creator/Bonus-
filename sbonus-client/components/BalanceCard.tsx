import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Wallet } from 'lucide-react';

const TIER_COLORS: Record<string, string> = {
  Bronze: 'var(--bronze)',
  Silver: 'var(--silver)',
  Gold: 'var(--gold)',
  Platinum: 'var(--platinum)',
};

function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      // Первый рендер: анимируем от 0
      firstRef.current = false;
      fromRef.current = 0;
    }
    const from = fromRef.current;
    if (from === target) { setValue(target); return; }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

interface Props {
  fullName: string;
  balance: number;
  tierName: string;
  tierPercent: number;
  nextTierName?: string | null;
  nextTierRemaining?: number | null;
  progressPercent: number;
  onTierClick?: () => void;
}

export default function BalanceCard({
  fullName,
  balance,
  tierName,
  tierPercent,
  nextTierName,
  nextTierRemaining,
  progressPercent,
  onTierClick,
}: Props) {
  const tierColor = TIER_COLORS[tierName] || 'var(--bronze)';
  const animatedBalance = useCountUp(Math.round(balance));

  return (
    <div className="card card-accent fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p className="muted" style={{ fontSize: 13 }}>Здравствуйте,</p>
          <p style={{ fontSize: 16, fontWeight: 700 }}>{fullName}</p>
        </div>
        <button
          onClick={onTierClick}
          className="tap"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${tierColor}40`,
            color: tierColor,
            padding: '4px 8px 4px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
            cursor: onTierClick ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          {tierName} • {Number(tierPercent)}%
          {onTierClick && <ChevronRight size={12} />}
        </button>
      </div>

      <p className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Wallet size={12} /> Ваш бонус
      </p>
      <div className="numeric" style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.1 }}>
        {animatedBalance.toLocaleString('ru-RU')} <span style={{ fontSize: 18, color: 'var(--text2)' }}>сом</span>
      </div>

      {nextTierName && nextTierRemaining != null && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)' }}>
            <span>До <strong style={{ color: 'var(--text)' }}>{nextTierName}</strong></span>
            <span className="numeric">{nextTierRemaining.toLocaleString('ru-RU')} сом</span>
          </div>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.min(100, Number(progressPercent))}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
