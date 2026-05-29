'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  User, Phone, Calendar, Star, TrendingUp, TrendingDown,
  ShoppingCart, Clock, Gift, AlertTriangle, ChevronRight,
  Search, ArrowLeft, CreditCard, Users, Zap, BarChart3,
  Target, Award, Package, Percent, History, Heart,
  Shield, RefreshCw, DollarSign, Activity,
} from 'lucide-react';
import { customer360API, customersAPI } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, LineChart, Line,
} from 'recharts';

const TIER_COLORS: Record<string, string> = {
  Bronze: '#cd7f32', Silver: '#b0b0b0', Gold: '#ffd700', Platinum: '#FFE600',
};

const RFM_COLORS: Record<string, string> = {
  Champion: '#10b981', Loyal: '#3b82f6', 'New Customer': '#8b5cf6',
  Regular: '#f59e0b', 'At Risk': '#f97316', Lost: '#ef4444',
};

const TX_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  earn: { icon: '💰', color: '#10b981', label: 'Бонус' },
  spend: { icon: '🛍️', color: '#ef4444', label: 'Списание' },
  expire: { icon: '⏰', color: '#6b7280', label: 'Истекло' },
  refund: { icon: '↩️', color: '#f59e0b', label: 'Возврат' },
  birthday: { icon: '🎂', color: '#ec4899', label: 'ДР' },
  referral: { icon: '👥', color: '#8b5cf6', label: 'Реферал' },
  promo: { icon: '🎁', color: '#06b6d4', label: 'Промо' },
  campaign: { icon: '📢', color: '#6366f1', label: 'Кампания' },
};

const CHURN_COLORS: Record<string, string> = {
  low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
};

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#10b981', '#06b6d4'];

export default function Customer360Page() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search customers
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await customersAPI.search(q);
      setSearchResults(data.customers || data || []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, doSearch]);

  // Load profile
  const loadProfile = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const { data } = await customer360API.profile(id);
      setProfile(data);
      setSelectedId(id);
      setSearchResults([]);
      setSearchQuery('');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Ошибка загрузки');
    }
    setLoading(false);
  }, []);

  // URL params support
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) loadProfile(id);
  }, [loadProfile]);

  const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
  const fmtD = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n);

  // ── Search view ──────────────────
  if (!selectedId || !profile) {
    return (
      <div className="page-root" style={{ maxWidth: 600, margin: '0 auto', paddingTop: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <User size={32} color="#fff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Customer 360</h1>
          <p style={{ color: 'var(--text3)', marginTop: 8 }}>Полный профиль клиента</p>
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--text3)' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени или телефону..."
            style={{
              width: '100%', padding: '12px 14px 12px 42px', borderRadius: 12,
              background: 'var(--bg2)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 15, outline: 'none',
            }}
            autoFocus
          />
        </div>

        {searching && <p style={{ textAlign: 'center', color: 'var(--text3)', marginTop: 20 }}>Поиск...</p>}

        {searchResults.length > 0 && (
          <div style={{
            marginTop: 12, borderRadius: 12, overflow: 'hidden',
            border: '1px solid var(--border)', background: 'var(--bg2)',
          }}>
            {searchResults.slice(0, 10).map((c: any) => (
              <button
                key={c.id}
                onClick={() => loadProfile(c.id)}
                style={{
                  width: '100%', padding: '14px 16px', display: 'flex',
                  alignItems: 'center', gap: 12, background: 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: TIER_COLORS[c.tier_name || 'Bronze'] + '22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <User size={18} color={TIER_COLORS[c.tier_name || 'Bronze']} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{c.phone}</div>
                </div>
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 6,
                  background: TIER_COLORS[c.tier_name || 'Bronze'] + '22',
                  color: TIER_COLORS[c.tier_name || 'Bronze'],
                }}>{c.tier_name || 'Bronze'}</span>
                <ChevronRight size={16} color="var(--text3)" />
              </button>
            ))}
          </div>
        )}

        {loading && <p style={{ textAlign: 'center', color: 'var(--text3)', marginTop: 40 }}>Загрузка профиля...</p>}
        {error && <p style={{ textAlign: 'center', color: '#ef4444', marginTop: 20 }}>{error}</p>}
      </div>
    );
  }

  const b = profile.basic;
  const tierColor = TIER_COLORS[b.tier?.name] || '#6b7280';
  const churnColor = CHURN_COLORS[profile.churn_risk?.level] || '#6b7280';
  const rfmColor = RFM_COLORS[profile.rfm?.segment] || '#6b7280';

  // Radar chart data
  const radarData = [
    { metric: 'Recency', value: profile.rfm.recency },
    { metric: 'Frequency', value: profile.rfm.frequency },
    { metric: 'Monetary', value: profile.rfm.monetary },
  ];

  // Visit pattern chart
  const dowData = Object.entries(profile.visit_pattern?.by_day || {}).map(([day, cnt]) => ({ day, count: cnt }));
  const hourData = Object.entries(profile.visit_pattern?.by_hour || {}).map(([hour, cnt]) => ({ hour, count: cnt }));

  // Category pie
  const catData = (profile.top_categories || []).map((c: any, i: number) => ({
    ...c, fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <button
          onClick={() => { setSelectedId(null); setProfile(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', color: 'var(--accent)',
            cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0,
          }}
        >
          <ArrowLeft size={18} /> Назад
        </button>
      </div>

      {/* Profile Card */}
      <div style={{
        background: 'var(--bg2)', borderRadius: 16, padding: 24,
        border: '1px solid var(--border)', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: `linear-gradient(135deg, ${tierColor}44, ${tierColor}22)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${tierColor}66`,
          }}>
            <User size={28} color={tierColor} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{b.full_name}</h2>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text3)' }}><Phone size={12} style={{ marginRight: 4 }} />{b.phone}</span>
              {b.birth_date && <span style={{ fontSize: 13, color: 'var(--text3)' }}><Calendar size={12} style={{ marginRight: 4 }} />{new Date(b.birth_date).toLocaleDateString('ru')}</span>}
              <span style={{
                fontSize: 12, padding: '2px 10px', borderRadius: 8,
                background: tierColor + '22', color: tierColor, fontWeight: 600,
              }}>{b.tier?.name} ({b.tier?.bonus_percent}%)</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)' }}>{fmt(profile.balance.balance)}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>бонусов</div>
          </div>
        </div>

        {/* Next tier progress */}
        {b.next_tier && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
              <span>До {b.next_tier.name}: {fmt(b.next_tier.remaining)} сом</span>
              <span>{fmtD(b.next_tier.progress)}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${b.next_tier.progress}%`,
                background: `linear-gradient(90deg, ${tierColor}, ${tierColor}cc)`,
                borderRadius: 3, transition: 'width 0.5s',
              }} />
            </div>
          </div>
        )}

        {/* Quick stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12, marginTop: 16,
        }}>
          {[
            { label: 'Заработано', value: fmt(profile.balance.total_earned), color: '#10b981', icon: TrendingUp },
            { label: 'Потрачено', value: fmt(profile.balance.total_spent), color: '#ef4444', icon: TrendingDown },
            { label: 'LTV', value: fmt(profile.ltv.total_purchases), color: '#6366f1', icon: DollarSign },
            { label: 'Покупок', value: String(profile.ltv.purchase_count), color: '#8b5cf6', icon: ShoppingCart },
            { label: 'Ср. чек', value: fmt(profile.ltv.avg_purchase), color: '#06b6d4', icon: CreditCard },
            { label: 'Дней с нами', value: String(profile.ltv.lifetime_days), color: '#f59e0b', icon: Clock },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <s.icon size={16} color={s.color} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RFM + Churn + Expiring row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* RFM Card */}
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Target size={18} color={rfmColor} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>RFM-анализ</h3>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 6, marginLeft: 'auto',
              background: rfmColor + '22', color: rfmColor, fontWeight: 600,
            }}>{profile.rfm.segment}</span>
          </div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text3)', fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 5]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke={rfmColor} fill={rfmColor} fillOpacity={0.3} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8 }}>
            {[
              { label: 'R', value: profile.rfm.recency },
              { label: 'F', value: profile.rfm.frequency },
              { label: 'M', value: profile.rfm.monetary },
            ].map(m => (
              <div key={m.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: rfmColor }}>{m.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Churn Risk + Alerts */}
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Shield size={18} color={churnColor} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Риск оттока</h3>
          </div>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 100, height: 100, borderRadius: '50%', margin: '0 auto',
              background: `conic-gradient(${churnColor} ${profile.churn_risk.score}%, var(--bg3) 0)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 76, height: 76, borderRadius: '50%', background: 'var(--bg2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column',
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: churnColor }}>{profile.churn_risk.score}%</div>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: churnColor, marginTop: 12 }}>
              {profile.churn_risk.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Последняя покупка: {profile.ltv.recency_days} дн. назад
            </div>
          </div>

          {/* Alerts */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {profile.expiring_bonus > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: '#f97316' }}>
                <AlertTriangle size={14} /> {fmt(profile.expiring_bonus)} бонусов сгорают через 30 дней
              </div>
            )}
            {profile.debts.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: '#ef4444' }}>
                <CreditCard size={14} /> {profile.debts.length} активных долгов
              </div>
            )}
            {profile.referrals.count > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: '#8b5cf6' }}>
                <Users size={14} /> Привёл {profile.referrals.count} друзей
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      {profile.monthly_trend.length > 0 && (
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} color="#6366f1" /> Динамика покупок (12 мес.)
          </h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={profile.monthly_trend}>
                <defs>
                  <linearGradient id="grad360" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${fmt(v)} сом`, 'Сумма']}
                />
                <Area type="monotone" dataKey="total" stroke="#6366f1" fill="url(#grad360)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Visit Pattern + Top Categories */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Visit by day */}
        {dowData.length > 0 && (
          <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={18} color="#8b5cf6" /> Визиты по дням
            </h3>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top categories pie */}
        {catData.length > 0 && (
          <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={18} color="#ec4899" /> Топ категории
            </h3>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catData} dataKey="total" nameKey="category" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
                    {catData.map((c: any, i: number) => <Cell key={i} fill={c.fill} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${fmt(v)} сом`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, justifyContent: 'center' }}>
              {catData.slice(0, 5).map((c: any) => (
                <span key={c.category} style={{ fontSize: 10, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c.fill, display: 'inline-block' }} />
                  {c.category}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Products */}
      {profile.top_products.length > 0 && (
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={18} color="#f59e0b" /> Любимые товары
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text3)', fontWeight: 500 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text3)', fontWeight: 500 }}>Товар</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text3)', fontWeight: 500 }}>Категория</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text3)', fontWeight: 500 }}>Кол-во</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text3)', fontWeight: 500 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {profile.top_products.map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text3)' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text3)' }}>{p.category || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text)', textAlign: 'right' }}>{fmtD(p.quantity)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--accent)', textAlign: 'right', fontWeight: 600 }}>{fmt(p.total)} сом</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Timeline + Referrals row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Timeline */}
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} color="#06b6d4" /> Последние операции
          </h3>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {profile.timeline.map((t: any) => {
              const tx = TX_ICONS[t.type] || TX_ICONS.earn;
              const isPositive = ['earn', 'birthday', 'referral', 'promo', 'campaign', 'refund'].includes(t.type);
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 20 }}>{tx.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{tx.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {new Date(t.created_at).toLocaleString('ru', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isPositive ? '#10b981' : '#ef4444' }}>
                      {isPositive ? '+' : '-'}{fmt(t.amount)}
                    </div>
                    {t.purchase_amount && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fmt(t.purchase_amount)} сом</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Referrals + Coupons + Debts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Referrals */}
          {profile.referrals.count > 0 && (
            <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} color="#8b5cf6" /> Рефералы ({profile.referrals.count})
              </h3>
              {profile.referrals.list.map((r: any) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <User size={14} color="#8b5cf6" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.phone}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {new Date(r.joined).toLocaleDateString('ru')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Coupons */}
          {profile.coupons.length > 0 && (
            <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Gift size={18} color="#ec4899" /> Купоны ({profile.coupons.length})
              </h3>
              {profile.coupons.map((c: any) => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <Gift size={14} color="#ec4899" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Код: {c.code}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>+{fmt(c.bonus_amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Active Debts */}
          {profile.debts.length > 0 && (
            <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={18} color="#ef4444" /> Долги ({profile.debts.length})
              </h3>
              {profile.debts.map((d: any) => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <AlertTriangle size={14} color={d.status === 'overdue' ? '#ef4444' : '#f97316'} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {fmt(d.remaining)} / {fmt(d.total_amount)} сом
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {d.status === 'overdue' ? `Просрочка ${d.overdue_days} дн.` : 'Активный'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Campaigns received */}
          {profile.campaigns.length > 0 && (
            <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} color="#6366f1" /> Кампании ({profile.campaigns.length})
              </h3>
              {profile.campaigns.map((c: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <Zap size={14} color="#6366f1" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {c.sent_at ? new Date(c.sent_at).toLocaleDateString('ru') : 'Ожидание'}
                    </div>
                  </div>
                  {c.amount && <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>+{fmt(c.amount)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Registration info */}
      <div style={{
        background: 'var(--bg2)', borderRadius: 14, padding: 16, border: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: 16,
      }}>
        <span>Реферальный код: <b style={{ color: 'var(--text)' }}>{b.referral_code || '—'}</b></span>
        <span>QR: <b style={{ color: 'var(--text)' }}>{b.qr_code || '—'}</b></span>
        <span>Регистрация: <b style={{ color: 'var(--text)' }}>{new Date(b.created_at).toLocaleDateString('ru')}</b></span>
        <span>Статус: <b style={{ color: b.is_active ? '#10b981' : '#ef4444' }}>{b.is_active ? 'Активен' : 'Неактивен'}</b></span>
      </div>
    </div>
  );
}
