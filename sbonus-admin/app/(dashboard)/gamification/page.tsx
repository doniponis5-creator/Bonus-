'use client';
import { useEffect, useState } from 'react';
import { Trophy, Flame, Target, Crown, Medal, Star, Users, TrendingUp, Award, Zap, ShoppingCart, Coins, Handshake, RefreshCw, Gem, Landmark, Banknote, Rocket, Sparkles, UserPlus, Globe, Megaphone, CircleDot } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { gamificationAPI } from '@/lib/api';

const CATEGORY_ICONS: Record<string, any> = {
  purchases: { Icon: ShoppingCart, color: '#6366f1' },
  bonuses: { Icon: Coins, color: '#f59e0b' },
  spending: { Icon: TrendingUp, color: '#10b981' },
  social: { Icon: Handshake, color: '#ec4899' },
  tiers: { Icon: Trophy, color: '#8b5cf6' },
  streaks: { Icon: Flame, color: '#ef4444' },
};

const ACHIEVEMENT_ICONS: Record<string, { Icon: any; color: string }> = {
  first_purchase: { Icon: ShoppingCart, color: '#6366f1' },
  regular_10: { Icon: RefreshCw, color: '#6366f1' },
  loyal_50: { Icon: Gem, color: '#8b5cf6' },
  legend_100: { Icon: Crown, color: '#f59e0b' },
  mega_200: { Icon: Trophy, color: '#f59e0b' },
  saver_1k: { Icon: Coins, color: '#f59e0b' },
  saver_5k: { Icon: Landmark, color: '#10b981' },
  saver_10k: { Icon: Banknote, color: '#10b981' },
  big_spender: { Icon: Target, color: '#ef4444' },
  ltv_10k: { Icon: TrendingUp, color: '#10b981' },
  ltv_50k: { Icon: Rocket, color: '#ec4899' },
  ltv_100k: { Icon: Star, color: '#f59e0b' },
  ltv_500k: { Icon: Sparkles, color: '#f59e0b' },
  referrer_1: { Icon: UserPlus, color: '#ec4899' },
  referrer_5: { Icon: Globe, color: '#6366f1' },
  referrer_10: { Icon: Megaphone, color: '#ef4444' },
  wheel_winner: { Icon: CircleDot, color: '#f59e0b' },
  tier_silver: { Icon: Medal, color: '#94a3b8' },
  tier_gold: { Icon: Medal, color: '#f59e0b' },
  tier_platinum: { Icon: Gem, color: '#06b6d4' },
};

function AchievementIcon({ achievement }: { achievement: any }) {
  const byId = ACHIEVEMENT_ICONS[achievement.id];
  if (byId) {
    const { Icon, color } = byId;
    return <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={color} /></div>;
  }
  const cat = CATEGORY_ICONS[achievement.category] || { Icon: Medal, color: '#6b7280' };
  return <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><cat.Icon size={18} color={cat.color} /></div>;
}

const STREAK_COLORS = ['#374151', '#6366f1', '#8b5cf6', '#f59e0b', '#ef4444', '#dc2626'];

export default function GamificationPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gamificationAPI.adminStats()
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Загрузка...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Ошибка загрузки</div>;

  const streakData = Object.entries(data.streak_distribution || {}).map(([k, v]) => ({ name: k, value: v as number }));
  const achievementData = (data.popular_achievements || []).slice(0, 8);

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trophy size={24} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Gamification Engine</h1>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>Достижения, серии, миссии клиентов</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { icon: <Users size={20} />, label: 'Всего клиентов', value: data.total_customers, color: '#6366f1' },
          { icon: <Zap size={20} />, label: 'Активных (30д)', value: data.active_last_30d, color: '#10b981' },
          { icon: <Award size={20} />, label: 'Достижений', value: data.total_achievements, color: '#f59e0b' },
          { icon: <Flame size={20} />, label: 'Макс серия', value: data.top_streakers?.[0]?.streak || 0, color: '#ef4444' },
        ].map((k, i) => (
          <div key={i} style={{ background: '#1e293b', borderRadius: 12, padding: '16px 20px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ color: k.color }}>{k.icon}</div>
              <span style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>{typeof k.value === 'number' ? k.value.toLocaleString() : k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Streak Distribution */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flame size={18} color="#ef4444" /> Распределение серий
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={streakData}>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {streakData.map((_, i) => <Cell key={i} fill={STREAK_COLORS[i % STREAK_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Popular Achievements */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={18} color="#f59e0b" /> Популярные достижения
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {achievementData.map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#0f172a', borderRadius: 8 }}>
                <AchievementIcon achievement={a} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.desc}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{a.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Streakers */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155', marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Crown size={18} color="#f59e0b" /> Топ по сериям
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {(data.top_streakers || []).map((s: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: i === 0 ? 'linear-gradient(135deg, #1e1b4b, #312e81)' : '#0f172a', borderRadius: 10, border: i === 0 ? '1px solid #6366f1' : '1px solid #1e293b' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'white' }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{s.name}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{s.phone}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Flame size={16} color="#ef4444" />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{s.streak}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Achievement Leaderboard */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Medal size={18} color="#8b5cf6" /> Лидеры достижений
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                {['#', 'Клиент', 'Телефон', 'Уровень', 'Достижения', 'Прогресс'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.achievement_leaders || []).map((l: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: i < 3 ? '#f59e0b' : '#9ca3af' }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{l.name}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: '#9ca3af' }}>{l.phone}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: '#312e81', color: '#a5b4fc', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>LVL {l.level}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{l.unlocked}/{l.total}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ width: 120, height: 8, background: '#374151', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(l.unlocked / l.total * 100)}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 4 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Achievements Config */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155', marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={18} color="#f59e0b" /> Все достижения ({data.total_achievements})
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {(data.achievements_config || []).map((a: any, i: number) => {
            const cat = CATEGORY_ICONS[a.category] || { Icon: Medal, color: '#6b7280' };
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#0f172a', borderRadius: 10, borderLeft: `3px solid ${cat.color}` }}>
                <AchievementIcon achievement={a} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
