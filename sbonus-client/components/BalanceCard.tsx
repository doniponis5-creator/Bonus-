import { useEffect, useRef, useState } from 'react';
import { ChevronRight, QrCode } from 'lucide-react';

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
  onQrClick?: () => void;
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
  onQrClick,
}: Props) {
  const tierColor = TIER_COLORS[tierName] || 'var(--bronze)';
  const animatedBalance = useCountUp(Math.round(balance));

  return (
    <div className="card card-accent fade-up" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <p className="caption">Здравствуйте,</p>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{fullName}</p>
        </div>
        <button
          onClick={onTierClick}
          className="tap"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--border-strong)',
            color: tierColor,
            padding: '5px 8px 5px 11px', borderRadius: 999,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
            cursor: onTierClick ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          {tierName} · {Number(tierPercent)}%
          {onTierClick && <ChevronRight size={12} />}
        </button>
      </div>

      <p className="label" style={{ marginBottom: 4 }}>Бонусный баланс</p>
      <div className="numeric display" style={{ color: 'var(--accent)' }}>
        {animatedBalance.toLocaleString('ru-RU')}
        <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-2)', marginLeft: 8, letterSpacing: 0 }}>сом</span>
      </div>

      {nextTierName && nextTierRemaining != null && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
            <span>До уровня <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{nextTierName}</strong></span>
            <span className="numeric">{nextTierRemaining.toLocaleString('ru-RU')} сом</span>
          </div>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.min(100, Number(progressPercent))}%` }} />
          </div>
        </div>
      )}

      {onQrClick && (
        <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onQrClick}>
          <QrCode size={18} /> Показать QR кассиру
        </button>
      )}
    </div>
  );
}
