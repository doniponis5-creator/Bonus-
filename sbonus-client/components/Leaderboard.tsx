'use client';

import { useEffect, useState } from 'react';
import { Trophy, Medal, TrendingUp } from 'lucide-react';
import { customerAPI } from '@/lib/api';

interface Leader {
  rank: number;
  name: string;
  total_purchases: number;
  txn_count: number;
  is_me: boolean;
}

const MEDAL_COLORS = ['var(--gold)', 'var(--silver)', 'var(--bronze)'];
const PERIODS = [
  { id: 'week' as const, label: 'Неделя' },
  { id: 'month' as const, label: 'Месяц' },
  { id: 'all' as const, label: 'Всё время' },
];

export default function Leaderboard() {
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [myRank, setMyRank] = useState(0);
  const [myTotal, setMyTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [period]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await customerAPI.leaderboard(period);
      setLeaders(data.leaders);
      setMyRank(data.my_rank);
      setMyTotal(data.my_total);
    } catch {} finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Title */}
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.022em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Trophy size={20} color="var(--accent)" /> Рейтинг покупателей
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px' }}>
        Топ-10 покупателей месяца получают бонус
      </p>

      {/* Period tabs */}
      <div className="seg" style={{ marginBottom: 20 }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`seg-item${period === p.id ? ' active' : ''}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* My position card */}
      <div style={{
        background: 'var(--accent-dim)',
        border: '1px solid var(--accent-border)',
        borderRadius: 16, padding: 16, marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div className="caption">Ваша позиция</div>
          <div className="numeric" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>#{myRank}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="caption">Покупки</div>
          <div className="numeric" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {myTotal.toLocaleString()} сом
          </div>
        </div>
      </div>

      {/* Leaders list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-2)', fontSize: 14 }}>Загрузка...</div>
      ) : leaders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)', fontSize: 14 }}>
          Пока нет данных
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {leaders.map((l) => (
            <div key={l.rank} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 12,
              background: l.is_me
                ? 'var(--accent-dim)'
                : 'var(--card)',
              border: l.is_me
                ? '1px solid var(--accent-border)'
                : '1px solid var(--border)',
              transition: 'border-color 0.2s',
            }}>
              {/* Rank */}
              <div className="icon-tile numeric" style={{
                fontSize: 13, fontWeight: 600, color: 'var(--text-2)',
              }}>
                {l.rank <= 3 ? <Medal size={17} color={MEDAL_COLORS[l.rank - 1]} /> : l.rank}
              </div>

              {/* Name */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15, fontWeight: l.is_me ? 600 : 400,
                  color: l.is_me ? 'var(--accent)' : 'var(--text)',
                }}>
                  {l.name} {l.is_me && '(Вы)'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {l.txn_count} покупок
                </div>
              </div>

              {/* Total */}
              <div className="numeric" style={{
                fontSize: 15, fontWeight: 600, color: 'var(--text)',
                textAlign: 'right',
              }}>
                {l.total_purchases.toLocaleString()} <span style={{ fontSize: 11, color: 'var(--text-2)' }}>сом</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hint */}
      {myRank > 10 && (
        <div style={{
          textAlign: 'center', marginTop: 20, padding: '14px 20px',
          background: 'var(--bg-2)', border: '1px solid var(--border-strong)', borderRadius: 12,
          fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          <TrendingUp size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} color="var(--accent)" />
          Совершайте покупки, чтобы подняться в рейтинге
        </div>
      )}
    </div>
  );
}
