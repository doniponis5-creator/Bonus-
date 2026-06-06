'use client';
import { useEffect, useState } from 'react';
import {
  Trophy, Flame, Target, Crown, Medal, Star, Users, TrendingUp, Award, Zap,
  Gift, Plus, Pencil, Trash2, X, Loader2, BarChart3, CheckCircle2, Coins,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { gamificationAPI } from '@/lib/api';

const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13 };
const GRADE_COLOR: Record<string, string> = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#FFE600', platinum: '#e5e4e2' };
const STREAK_COLORS = ['#374151', '#6366f1', '#8b5cf6', '#f59e0b', '#ef4444', '#dc2626'];

const QUEST_TYPES = [
  { v: 'visit', l: 'Покупка сегодня' },
  { v: 'purchase_count', l: 'Кол-во покупок' },
  { v: 'purchase_amount', l: 'Покупка на сумму' },
  { v: 'spend_sum', l: 'Сумма покупок' },
  { v: 'spend_bonus', l: 'Списать бонусы' },
  { v: 'referral', l: 'Пригласить друга' },
  { v: 'wheel_spin', l: 'Крутить колесо' },
  { v: 'streak', l: 'Серия дней' },
];
const PERIODS = [
  { v: 'daily', l: 'Ежедневно' }, { v: 'weekly', l: 'Еженедельно' },
  { v: 'monthly', l: 'Ежемесячно' }, { v: 'once', l: 'Разово' },
];
const CATEGORIES = [
  { v: 'purchases', l: 'Покупки' }, { v: 'bonuses', l: 'Бонусы' }, { v: 'spending', l: 'Объём' },
  { v: 'social', l: 'Друзья' }, { v: 'tiers', l: 'Уровни' }, { v: 'streaks', l: 'Серии' },
];
const METRICS = [
  { v: 'purchases', l: 'Кол-во покупок' }, { v: 'ltv', l: 'Объём покупок (сом)' },
  { v: 'total_earned', l: 'Накоплено бонусов' }, { v: 'total_spent', l: 'Потрачено бонусов' },
  { v: 'referrals', l: 'Рефералов' }, { v: 'longest_streak', l: 'Рекорд серии' },
  { v: 'tier_rank', l: 'Ранг уровня (1-4)' },
];
const GRADES = [
  { v: 'bronze', l: 'Бронза' }, { v: 'silver', l: 'Серебро' },
  { v: 'gold', l: 'Золото' }, { v: 'platinum', l: 'Платина' },
];
const ICON_NAMES = [
  'Target', 'Flame', 'Award', 'Zap', 'Gift', 'Store', 'ShoppingBag', 'CreditCard', 'Repeat',
  'UserPlus', 'Disc3', 'ShoppingCart', 'Gem', 'Crown', 'PiggyBank', 'Landmark', 'Banknote',
  'TrendingUp', 'Rocket', 'Star', 'Sparkles', 'Handshake', 'Users', 'Megaphone', 'Medal', 'Trophy',
];

const card: React.CSSProperties = { background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 14, outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 6, fontWeight: 600 };

type TabId = 'overview' | 'quests' | 'achievements';

export default function GamificationPage() {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trophy size={24} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Геймификация 2.0</h1>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>Миссии, достижения, уровни и серии</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: '#0f172a', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {([
          { id: 'overview', label: 'Обзор', icon: BarChart3 },
          { id: 'quests', label: 'Миссии', icon: Target },
          { id: 'achievements', label: 'Достижения', icon: Award },
        ] as const).map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: active ? '#f59e0b' : 'transparent', color: active ? '#0a0a0a' : '#9ca3af',
              transition: 'all 0.2s',
            }}>
              <t.icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'quests' && <QuestsTab />}
      {tab === 'achievements' && <AchievementsTab />}
    </div>
  );
}

// ═══════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════
function OverviewTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gamificationAPI.overview().then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!data) return <ErrorBox />;

  const levelData = (data.level_distribution || []).map((l: any) => ({ name: `LVL ${l.level}`, value: l.count }));
  const streakData = Object.entries(data.streak_distribution || {}).map(([k, v]) => ({ name: k, value: v as number }));

  const kpis = [
    { icon: <Users size={20} />, label: 'Игроков', value: data.total_players, color: '#6366f1' },
    { icon: <Zap size={20} />, label: 'Всего XP', value: data.total_xp, color: '#f59e0b' },
    { icon: <CheckCircle2 size={20} />, label: 'Наград забрано', value: data.quests_claimed, color: '#10b981' },
    { icon: <Award size={20} />, label: 'Достижений выдано', value: data.achievements_unlocked, color: '#ec4899' },
  ];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ ...card, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ color: k.color }}>{k.icon}</div>
              <span style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>{Number(k.value || 0).toLocaleString('ru-RU')}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={18} color="#6366f1" /> Распределение уровней
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={levelData}>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flame size={18} color="#ef4444" /> Распределение серий
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={streakData}>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {streakData.map((_, i) => <Cell key={i} fill={STREAK_COLORS[i % STREAK_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        {/* Top players */}
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crown size={18} color="#f59e0b" /> Топ игроков по XP
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  {['#', 'Клиент', 'Уровень', 'XP', 'Серия'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.top_players || []).map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: i < 3 ? '#f59e0b' : '#9ca3af' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{p.name}<div style={{ fontSize: 11, color: '#64748b' }}>{p.phone}</div></td>
                    <td style={{ padding: '10px 12px' }}><span style={{ background: '#312e81', color: '#a5b4fc', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>LVL {p.level}</span></td>
                    <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>{Number(p.xp).toLocaleString('ru-RU')}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: '#ef4444', fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flame size={14} /> {p.streak}</span></td>
                  </tr>
                ))}
                {(!data.top_players || data.top_players.length === 0) && (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Пока нет игроков</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/* Popular achievements */}
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Medal size={18} color="#8b5cf6" /> Популярные достижения
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.popular_achievements || []).map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#0f172a', borderRadius: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${GRADE_COLOR[a.grade] || '#888'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Award size={16} color={GRADE_COLOR[a.grade] || '#888'} />
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{a.title}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>{a.count}</div>
              </div>
            ))}
            {(!data.popular_achievements || data.popular_achievements.length === 0) && (
              <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Пока нет данных</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// QUESTS
// ═══════════════════════════════════════════
function QuestsTab() {
  const [quests, setQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    gamificationAPI.listQuests().then(r => setQuests(r.data.quests || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const del = async (id: string) => {
    if (!confirm('Удалить миссию?')) return;
    await gamificationAPI.deleteQuest(id);
    load();
  };

  if (loading) return <Loading />;

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={18} color="#f59e0b" /> Миссии ({quests.length})
        </h3>
        <button onClick={() => setCreating(true)} style={btnPrimary}><Plus size={16} /> Создать</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              {['Миссия', 'Тип', 'Период', 'Цель', 'Награда', 'XP', 'Участники', 'Статус', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quests.map(q => (
              <tr key={q.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '12px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{q.title}<div style={{ fontSize: 11, color: '#64748b' }}>{q.description}</div></td>
                <td style={{ padding: '12px', fontSize: 12, color: '#9ca3af' }}>{QUEST_TYPES.find(t => t.v === q.type)?.l || q.type}</td>
                <td style={{ padding: '12px', fontSize: 12, color: '#9ca3af' }}>{PERIODS.find(p => p.v === q.period)?.l || q.period}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#f1f5f9' }}>{q.target_value}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#10b981', fontWeight: 600 }}>+{q.reward_amount} сом</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#f59e0b' }}>+{q.xp_reward}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#9ca3af' }}>{q.stats?.participants ?? 0} / <span style={{ color: '#10b981' }}>{q.stats?.claimed ?? 0}</span></td>
                <td style={{ padding: '12px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: q.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)', color: q.is_active ? '#10b981' : '#94a3b8' }}>
                    {q.is_active ? 'Активна' : 'Выкл'}
                  </span>
                </td>
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setEditing(q)} style={iconBtn}><Pencil size={15} color="#9ca3af" /></button>
                  <button onClick={() => del(q.id)} style={iconBtn}><Trash2 size={15} color="#ef4444" /></button>
                </td>
              </tr>
            ))}
            {quests.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Нет миссий</td></tr>}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <QuestModal
          quest={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function QuestModal({ quest, onClose, onSaved }: { quest: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(quest || {
    code: '', title: '', description: '', icon: 'Target', type: 'visit', target_value: 1,
    reward_type: 'bonus', reward_amount: 20, xp_reward: 10, period: 'daily', sort_order: 0, is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr(''); setSaving(true);
    try {
      if (quest) {
        const { code, id, stats, ...upd } = form;
        await gamificationAPI.updateQuest(quest.id, upd);
      } else {
        await gamificationAPI.createQuest(form);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  return (
    <Modal title={quest ? 'Редактировать миссию' : 'Новая миссия'} onClose={onClose}>
      {!quest && (
        <div><label style={labelStyle}>Код (уникальный)</label>
          <input style={inputStyle} value={form.code} onChange={e => set('code', e.target.value)} placeholder="daily_visit" /></div>
      )}
      <div><label style={labelStyle}>Название</label>
        <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} /></div>
      <div><label style={labelStyle}>Описание</label>
        <input style={inputStyle} value={form.description || ''} onChange={e => set('description', e.target.value)} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Тип</label>
          <select style={inputStyle} value={form.type} onChange={e => set('type', e.target.value)}>
            {QUEST_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select></div>
        <div><label style={labelStyle}>Период</label>
          <select style={inputStyle} value={form.period} onChange={e => set('period', e.target.value)}>
            {PERIODS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Цель</label>
          <input type="number" style={inputStyle} value={form.target_value} onChange={e => set('target_value', e.target.value)} /></div>
        <div><label style={labelStyle}>Бонус (сом)</label>
          <input type="number" style={inputStyle} value={form.reward_amount} onChange={e => set('reward_amount', e.target.value)} /></div>
        <div><label style={labelStyle}>XP</label>
          <input type="number" style={inputStyle} value={form.xp_reward} onChange={e => set('xp_reward', e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Иконка</label>
          <select style={inputStyle} value={form.icon} onChange={e => set('icon', e.target.value)}>
            {ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select></div>
        <div><label style={labelStyle}>Сортировка</label>
          <input type="number" style={inputStyle} value={form.sort_order} onChange={e => set('sort_order', e.target.value)} /></div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#f1f5f9', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} /> Активна
      </label>
      {err && <div style={{ color: '#ef4444', fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={save} disabled={saving} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Сохранить
        </button>
        <button onClick={onClose} style={btnSecondary}>Отмена</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════
function AchievementsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    gamificationAPI.listAchievements().then(r => setItems(r.data.achievements || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const del = async (id: string) => {
    if (!confirm('Удалить достижение?')) return;
    await gamificationAPI.deleteAchievement(id);
    load();
  };

  if (loading) return <Loading />;

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Award size={18} color="#f59e0b" /> Достижения ({items.length})
        </h3>
        <button onClick={() => setCreating(true)} style={btnPrimary}><Plus size={16} /> Создать</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              {['Достижение', 'Категория', 'Класс', 'Условие', 'Награда', 'XP', 'Получили', 'Статус', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${GRADE_COLOR[a.grade]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Award size={16} color={GRADE_COLOR[a.grade]} />
                  </div>
                  <div><div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{a.title}</div><div style={{ fontSize: 11, color: '#64748b' }}>{a.description}</div></div>
                </td>
                <td style={{ padding: '12px', fontSize: 12, color: '#9ca3af' }}>{CATEGORIES.find(c => c.v === a.category)?.l || a.category}</td>
                <td style={{ padding: '12px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: `${GRADE_COLOR[a.grade]}22`, color: GRADE_COLOR[a.grade] }}>{GRADES.find(g => g.v === a.grade)?.l || a.grade}</span></td>
                <td style={{ padding: '12px', fontSize: 12, color: '#9ca3af' }}>{METRICS.find(m => m.v === a.metric)?.l || a.metric} ≥ {a.threshold}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#10b981', fontWeight: 600 }}>{a.bonus_reward > 0 ? `+${a.bonus_reward} сом` : '—'}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#f59e0b' }}>+{a.xp_reward}</td>
                <td style={{ padding: '12px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{a.unlocked_by}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: a.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)', color: a.is_active ? '#10b981' : '#94a3b8' }}>{a.is_active ? 'Активно' : 'Выкл'}</span>
                </td>
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setEditing(a)} style={iconBtn}><Pencil size={15} color="#9ca3af" /></button>
                  <button onClick={() => del(a.id)} style={iconBtn}><Trash2 size={15} color="#ef4444" /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Нет достижений</td></tr>}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <AchievementModal achievement={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}

function AchievementModal({ achievement, onClose, onSaved }: { achievement: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(achievement || {
    code: '', title: '', description: '', icon: 'Award', category: 'purchases', grade: 'bronze',
    metric: 'purchases', threshold: 1, xp_reward: 100, bonus_reward: 0, sort_order: 0, is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr(''); setSaving(true);
    try {
      if (achievement) {
        const { code, id, unlocked_by, ...upd } = form;
        await gamificationAPI.updateAchievement(achievement.id, upd);
      } else {
        await gamificationAPI.createAchievement(form);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  return (
    <Modal title={achievement ? 'Редактировать достижение' : 'Новое достижение'} onClose={onClose}>
      {!achievement && (
        <div><label style={labelStyle}>Код (уникальный)</label>
          <input style={inputStyle} value={form.code} onChange={e => set('code', e.target.value)} placeholder="first_purchase" /></div>
      )}
      <div><label style={labelStyle}>Название</label>
        <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} /></div>
      <div><label style={labelStyle}>Описание</label>
        <input style={inputStyle} value={form.description || ''} onChange={e => set('description', e.target.value)} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Категория</label>
          <select style={inputStyle} value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select></div>
        <div><label style={labelStyle}>Класс</label>
          <select style={inputStyle} value={form.grade} onChange={e => set('grade', e.target.value)}>
            {GRADES.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Метрика (условие)</label>
          <select style={inputStyle} value={form.metric} onChange={e => set('metric', e.target.value)}>
            {METRICS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select></div>
        <div><label style={labelStyle}>Порог ≥</label>
          <input type="number" style={inputStyle} value={form.threshold} onChange={e => set('threshold', e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Бонус (сом)</label>
          <input type="number" style={inputStyle} value={form.bonus_reward} onChange={e => set('bonus_reward', e.target.value)} /></div>
        <div><label style={labelStyle}>XP</label>
          <input type="number" style={inputStyle} value={form.xp_reward} onChange={e => set('xp_reward', e.target.value)} /></div>
        <div><label style={labelStyle}>Сортировка</label>
          <input type="number" style={inputStyle} value={form.sort_order} onChange={e => set('sort_order', e.target.value)} /></div>
      </div>
      <div><label style={labelStyle}>Иконка</label>
        <select style={inputStyle} value={form.icon} onChange={e => set('icon', e.target.value)}>
          {ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
        </select></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#f1f5f9', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} /> Активно
      </label>
      {err && <div style={{ color: '#ef4444', fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={save} disabled={saving} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Сохранить
        </button>
        <button onClick={onClose} style={btnSecondary}>Отмена</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════
// SHARED UI
// ═══════════════════════════════════════════
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, marginTop: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#9ca3af" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Loading = () => <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}><Loader2 size={18} className="animate-spin" /> Загрузка...</div>;
const ErrorBox = () => <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Ошибка загрузки</div>;

const btnPrimary: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#f59e0b', color: '#0a0a0a' };
const btnSecondary: React.CSSProperties = { padding: '9px 16px', borderRadius: 8, border: '1px solid #334155', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'transparent', color: '#9ca3af' };
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 6 };
