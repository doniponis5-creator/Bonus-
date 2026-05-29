'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Trophy, Star, TrendingUp, Award, ChevronRight,
  ChevronDown, ChevronUp, User, Phone, Calendar, Gift,
  Target, Crown, Medal, Gem, Loader2,
} from 'lucide-react';
import { referralAPI } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const RANK_ICONS = [Crown, Medal, Award, Star, Star];
const RANK_COLORS = ['#ffd700', '#b0b0b0', '#cd7f32', '#6366f1', '#8b5cf6'];

export default function ReferralBoardPage() {
  const [stats, setStats] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [tree, setTree] = useState<any>(null);
  const [treeCustomerId, setTreeCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [sRes, lRes] = await Promise.all([
          referralAPI.stats().catch(() => ({ data: {} })),
          referralAPI.leaderboard(50).catch(() => ({ data: { leaderboard: [] } })),
        ]);
        setStats(sRes.data);
        setLeaderboard(lRes.data?.leaderboard || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const loadTree = useCallback(async (customerId: string) => {
    if (treeCustomerId === customerId) { setTreeCustomerId(null); setTree(null); return; }
    setTreeLoading(true); setTreeCustomerId(customerId);
    try {
      const { data } = await referralAPI.tree(customerId);
      setTree(data);
    } catch { setTree(null); }
    setTreeLoading(false);
  }, [treeCustomerId]);

  const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Loader2 size={18} className="animate-spin" /> Загрузка...
    </div>
  );

  // Chart data (top 10)
  const chartData = leaderboard.slice(0, 10).map((e: any) => ({
    name: (e.full_name || '').split(' ')[0] || `#${e.rank}`,
    referrals: e.referral_count,
    bonus: e.bonus_earned,
  }));

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Users size={20} color="#fff" />
            </div>
            Referral 2.0
          </h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>Лидерборд, дерево рефералов, milestones</p>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Всего рефералов', value: fmt(stats.total_referrals), icon: Users, color: '#8b5cf6' },
            { label: 'За месяц', value: fmt(stats.this_month), icon: TrendingUp, color: '#10b981' },
            { label: 'Бонусов выплачено', value: `${fmt(stats.total_bonus_paid)} сом`, icon: Gift, color: '#f59e0b' },
            { label: 'Milestones', value: fmt(stats.milestones_claimed), icon: Target, color: '#6366f1' },
          ].map((kpi, i) => (
            <div key={i} style={{
              background: 'var(--bg2)', borderRadius: 14, padding: 16,
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: kpi.color + '22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <kpi.icon size={18} color={kpi.color} />
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top Referrer Banner */}
      {stats?.top_referrer && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(245,158,11,0.06))',
          borderRadius: 14, padding: 16, marginBottom: 24,
          border: '1px solid rgba(255,215,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <Crown size={24} color="#ffd700" />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffd700' }}>Лучший рефёрер</div>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              {stats.top_referrer.name} — <b>{stats.top_referrer.count}</b> приглашённых
            </div>
          </div>
        </div>
      )}

      {/* Chart + Leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* Chart */}
        {chartData.length > 0 && (
          <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={18} color="#ffd700" /> Топ-10 рефёреров
            </h3>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, n: string) => [v, n === 'referrals' ? 'Рефералы' : 'Бонус']}
                  />
                  <Bar dataKey="referrals" radius={[0, 6, 6, 0]}>
                    {chartData.map((_: any, i: number) => (
                      <Cell key={i} fill={RANK_COLORS[Math.min(i, 4)]} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Referral tree panel */}
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gem size={18} color="#8b5cf6" /> Дерево рефералов
          </h3>
          {!treeCustomerId && (
            <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 32 }}>
              Нажмите на рефёрера в таблице, чтобы увидеть дерево
            </p>
          )}
          {treeLoading && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text3)' }} />
            </div>
          )}
          {tree && !treeLoading && (
            <div>
              {/* Root */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <Crown size={18} color="#ffd700" />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ffd700' }}>{tree.root.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{tree.root.phone} | Код: {tree.root.referral_code}</div>
                </div>
              </div>
              {/* Level 1 */}
              <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
                {tree.tree.map((l1: any) => (
                  <div key={l1.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 8px 20px', borderBottom: '1px solid var(--border)' }}>
                      <User size={14} color="#8b5cf6" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{l1.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{l1.phone} | {new Date(l1.joined).toLocaleDateString('ru')}</div>
                      </div>
                      {l1.referrals.length > 0 && (
                        <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600 }}>+{l1.referrals.length}</span>
                      )}
                    </div>
                    {/* Level 2 */}
                    {l1.referrals.map((l2: any) => (
                      <div key={l2.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 6px 44px', borderBottom: '1px solid var(--border)' }}>
                        <User size={12} color="var(--text3)" />
                        <div>
                          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{l2.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>{new Date(l2.joined).toLocaleDateString('ru')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
                L1: {tree.total_level1} | L2: {tree.total_level2} | Всего: {tree.total_level1 + tree.total_level2}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Leaderboard Table */}
      <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Полный рейтинг</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Клиент', 'Телефон', 'Рефералов', 'Бонус', 'Код', 'Дерево'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', color: 'var(--text3)', fontWeight: 500, textAlign: 'left', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((e: any) => {
                const RankIcon = RANK_ICONS[Math.min(e.rank - 1, 4)];
                const rankColor = RANK_COLORS[Math.min(e.rank - 1, 4)];
                const isSelected = treeCustomerId === e.customer_id;

                return (
                  <tr key={e.customer_id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'rgba(139,92,246,0.08)' : 'transparent',
                    cursor: 'pointer',
                  }} onClick={() => loadTree(e.customer_id)}>
                    <td style={{ padding: '12px', width: 40 }}>
                      {e.rank <= 3 ? (
                        <RankIcon size={18} color={rankColor} />
                      ) : (
                        <span style={{ color: 'var(--text3)', fontWeight: 600 }}>{e.rank}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text)' }}>{e.full_name}</td>
                    <td style={{ padding: '12px', color: 'var(--text3)', fontSize: 12 }}>{e.phone}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 8,
                        background: '#8b5cf622', color: '#8b5cf6', fontWeight: 700,
                      }}>
                        <Users size={12} /> {e.referral_count}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#10b981', fontWeight: 600 }}>{fmt(e.bonus_earned)} сом</td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)' }}>{e.referral_code}</td>
                    <td style={{ padding: '12px' }}>
                      <ChevronRight size={14} color={isSelected ? '#8b5cf6' : 'var(--text3)'} />
                    </td>
                  </tr>
                );
              })}
              {leaderboard.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Нет рефералов</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
