import { Wallet } from 'lucide-react';

const TIER_CLASS: Record<string, string> = {
  Bronze: 'tier-bronze',
  Silver: 'tier-silver',
  Gold: 'tier-gold',
  Platinum: 'tier-platinum',
};

interface Props {
  fullName: string;
  balance: number;
  tierName: string;
  tierPercent: number;
  nextTierName?: string | null;
  nextTierRemaining?: number | null;
  progressPercent: number;
}

export default function BalanceCard({
  fullName,
  balance,
  tierName,
  tierPercent,
  nextTierName,
  nextTierRemaining,
  progressPercent,
}: Props) {
  const tierClass = TIER_CLASS[tierName] || 'tier-bronze';
  return (
    <div className="card card-accent">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p className="muted" style={{ fontSize: 13 }}>Здравствуйте,</p>
          <p style={{ fontSize: 16, fontWeight: 700 }}>{fullName}</p>
        </div>
        <span className={`badge badge-green ${tierClass}`} style={{ background: 'rgba(255,255,255,0.05)' }}>
          {tierName} • {Number(tierPercent)}%
        </span>
      </div>

      <p className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Wallet size={12} /> Ваш бонус
      </p>
      <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.1 }}>
        {balance.toLocaleString('ru-RU')} <span style={{ fontSize: 18, color: 'var(--text2)' }}>сом</span>
      </div>

      {nextTierName && nextTierRemaining != null && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)' }}>
            <span>До <strong style={{ color: 'var(--text)' }}>{nextTierName}</strong></span>
            <span>{nextTierRemaining.toLocaleString('ru-RU')} сом</span>
          </div>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.min(100, Number(progressPercent))}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
