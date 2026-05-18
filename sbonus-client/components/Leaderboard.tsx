'use client';

import { useEffect, useState } from 'react';
import { customerAPI } from '@/lib/api';

interface Leader {
  rank: number;
  name: string;
  total_purchases: number;
  txn_count: number;
  is_me: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];
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
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        🏆 Рейтинг покупателей
      </h2>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px' }}>
        Войдите в TOP-10 и получите бонус!
      </p>

      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: period === p.id ? '#FFE600' : 'rgba(255,255,255,0.06)',
              color: period === p.id ? '#0a0f1a' : '#8899aa',
              transition: 'all 0.2s',
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* My position card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,230,0,0.12), rgba(255,230,0,0.04))',
        border: '1px solid rgba(255,230,0,0.2)',
        borderRadius: 14, padding: 16, marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 12, color: '#8899aa' }}>Ваша позиция</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#FFE600' }}>#{myRank}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#8899aa' }}>Покупки</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2eaf6' }}>
            {myTotal.toLocaleString()} KGS
          </div>
        </div>
      </div>

      {/* Leaders list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#8899aa' }}>Загрузка...</div>
      ) : leaders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
          Пока нет данных. Будьте первым!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {leaders.map((l) => (
            <div key={l.rank} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 12,
              background: l.is_me
                ? 'rgba(255,230,0,0.1)'
                : 'rgba(255,255,255,0.03)',
              border: l.is_me
                ? '1px solid rgba(255,230,0,0.3)'
                : '1px solid rgba(255,255,255,0.04)',
              transition: 'all 0.2s',
            }}>
              {/* Rank */}
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: l.rank <= 3 ? 20 : 14,
                fontWeight: 800,
                background: l.rank === 1
                  ? 'linear-gradient(135deg, #FFE600, #f59e0b)'
                  : l.rank === 2
                    ? 'linear-gradient(135deg, #c0c0c0, #9ca3af)'
                    : l.rank === 3
                      ? 'linear-gradient(135deg, #cd7f32, #b45309)'
                      : 'rgba(255,255,255,0.06)',
                color: l.rank <= 3 ? '#0a0f1a' : '#8899aa',
                flexShrink: 0,
              }}>
                {l.rank <= 3 ? MEDALS[l.rank - 1] : l.rank}
              </div>

              {/* Name */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15, fontWeight: l.is_me ? 700 : 500,
                  color: l.is_me ? '#FFE600' : '#e2eaf6',
                }}>
                  {l.name} {l.is_me && '(Вы)'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {l.txn_count} покупок
                </div>
              </div>

              {/* Total */}
              <div style={{
                fontSize: 15, fontWeight: 700, color: '#e2eaf6',
                textAlign: 'right',
              }}>
                {l.total_purchases.toLocaleString()} <span style={{ fontSize: 11, color: '#8899aa' }}>KGS</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Motivational text */}
      {myRank > 10 && (
        <div style={{
          textAlign: 'center', marginTop: 20, padding: '14px 20px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 12,
          fontSize: 13, color: '#8899aa', lineHeight: 1.6,
        }}>
          До TOP-10 осталось совсем немного! 💪<br />
          Делайте покупки и поднимайтесь в рейтинге!
        </div>
      )}
    </div>
  );
}
