'use client';
import { useEffect, useState } from 'react';
import {
  Trophy, Flame, Target, Crown, Medal, Star, Users, TrendingUp, Award, Zap,
  Gift, Plus, Pencil, Trash2, X, Loader2, BarChart3, CheckCircle2, Coins,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { gamificationAPI } from '@/lib/api';

const tooltipStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13 };
// Hex literals — used in alpha-suffix backgrounds and chart fills (SVG attrs)
const GRADE_COLOR: Record<string, string> = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#FFE600', platinum: '#e5e4e2' };
const STREAK_COLORS = ['#8899aa', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];

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

const card: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: 20, border: '1px solid var(--border)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 600 };

type TabId = 'overview' | 'quests' | 'achievements';

export default function GamificationPage() {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div className="icon-tile" style={{ width: 44, height: 44, background: 'var(--accent-dim)' }}>
          <Trophy size={24} color="var(--accent)" />
        </div>
        <div>
          <h1 className="h1">Геймификация 2.0</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Миссии, достижения, уровни и серии</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="seg" style={{ marginBottom: 24 }}>
        {([
          { id: 'overview', label: 'Обзор', icon: BarChart3 },
          { id: 'quests', label: 'Миссии', icon: Target },
          { id: 'achievements', label: 'Достижения', icon: Award },
        ] as const).map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`seg-item${active ? ' active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
    { icon: <Users size={20} />, label: 'Игроков', value: data.total_players, color: 'var(--info)' },
    { icon: <Zap size={20} />, label: 'Всего XP', value: data.total_xp, color: 'var(--warn)' },
    { icon: <CheckCircle2 size={20} />, label: 'Наград забрано', value: data.quests_claimed, color: 'var(--success)' },
    { icon: <Award size={20} />, label: 'Достижений выдано', value: data.achievements_unlocked, color: 'var(--violet)' },
  ];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ color: k.color, display: 'flex' }}>{k.icon}</div>
              <span className="label">{k.label}</span>
            </div>
            <div className="stat-value">{Number(k.value || 0).toLocaleString('ru-RU')}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={card}>
          <h3 className="h3" style={{ color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={18} color="var(--info)" /> Распределение уровней
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={levelData}>
              <XAxis dataKey="name" tick={{ fill: '#8899aa', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8899aa', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <h3 className="h3" style={{ color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flame size={18} color="var(--danger)" /> Распределение серий
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={streakData}>
              <XAxis dataKey="name" tick={{ fill: '#8899aa', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8899aa', fontSize: 12 }} axisLine={false} tickLine={false} />
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
          <h3 className="h3" style={{ color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crown size={18} color="var(--accent)" /> Топ игроков по XP
          </h3>
          <div className="table-scroll-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Клиент', 'Уровень', 'XP', 'Серия'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.top_players || []).map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                    <td className="numeric" style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: i < 3 ? 'var(--accent)' : 'var(--text2)' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.name}<div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.phone}</div></td>
                    <td style={{ padding: '10px 12px' }}><span className="badge badge-blue">LVL {p.level}</span></td>
                    <td className="numeric" style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: 'var(--warn)' }}>{Number(p.xp).toLocaleString('ru-RU')}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: 'var(--danger)', fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flame size={14} /> {p.streak}</span></td>
                  </tr>
                ))}
                {(!data.top_players || data.top_players.length === 0) && (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Пока нет игроков</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/* Popular achievements */}
        <div style={card}>
          <h3 className="h3" style={{ color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Medal size={18} color="var(--violet)" /> Популярные достижения
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.popular_achievements || []).map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${GRADE_COLOR[a.grade] || '#8899aa'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Award size={16} color={GRADE_COLOR[a.grade] || '#8899aa'} />
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.title}</div>
                <div className="numeric" style={{ fontSize: 15, fontWeight: 700, color: 'var(--warn)' }}>{a.count}</div>
              </div>
            ))}
            {(!data.popular_achievements || data.popular_achievements.length === 0) && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Пока нет данных</div>
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
        <h3 className="h3" style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={18} color="var(--accent)" /> Миссии ({quests.length})
        </h3>
        <button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} /> Создать</button>
      </div>
      <div className="table-scroll-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Миссия', 'Тип', 'Период', 'Цель', 'Награда', 'XP', 'Участники', 'Статус', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quests.map(q => (
              <tr key={q.id} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                <td style={{ padding: '12px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{q.title}<div style={{ fontSize: 11, color: 'var(--text3)' }}>{q.description}</div></td>
                <td style={{ padding: '12px', fontSize: 12, color: 'var(--text2)' }}>{QUEST_TYPES.find(t => t.v === q.type)?.l || q.type}</td>
                <td style={{ padding: '12px', fontSize: 12, color: 'var(--text2)' }}>{PERIODS.find(p => p.v === q.period)?.l || q.period}</td>
                <td className="numeric" style={{ padding: '12px', fontSize: 13, color: 'var(--text)' }}>{q.target_value}</td>
                <td className="numeric" style={{ padding: '12px', fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>+{q.reward_amount} сом</td>
                <td className="numeric" style={{ padding: '12px', fontSize: 13, color: 'var(--warn)' }}>+{q.xp_reward}</td>
                <td className="numeric" style={{ padding: '12px', fontSize: 13, color: 'var(--text2)' }}>{q.stats?.participants ?? 0} / <span style={{ color: 'var(--success)' }}>{q.stats?.claimed ?? 0}</span></td>
                <td style={{ padding: '12px' }}>
                  <span className={`badge ${q.is_active ? 'badge-green' : 'badge-gray'}`}>
                    {q.is_active ? 'Активна' : 'Выкл'}
                  </span>
                </td>
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setEditing(q)} style={iconBtn}><Pencil size={15} color="var(--text2)" /></button>
                  <button onClick={() => del(q.id)} style={iconBtn}><Trash2 size={15} color="var(--danger)" /></button>
                </td>
              </tr>
            ))}
            {quests.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Нет миссий</td></tr>}
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
          <input className="input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="daily_visit" /></div>
      )}
      <div><label style={labelStyle}>Название</label>
        <input className="input" value={form.title} onChange={e => set('title', e.target.value)} /></div>
      <div><label style={labelStyle}>Описание</label>
        <input className="input" value={form.description || ''} onChange={e => set('description', e.target.value)} /></div>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Тип</label>
          <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
            {QUEST_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select></div>
        <div><label style={labelStyle}>Период</label>
          <select className="input" value={form.period} onChange={e => set('period', e.target.value)}>
            {PERIODS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select></div>
      </div>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Цель</label>
          <input type="number" className="input" value={form.target_value} onChange={e => set('target_value', e.target.value)} /></div>
        <div><label style={labelStyle}>Бонус (сом)</label>
          <input type="number" className="input" value={form.reward_amount} onChange={e => set('reward_amount', e.target.value)} /></div>
        <div><label style={labelStyle}>XP</label>
          <input type="number" className="input" value={form.xp_reward} onChange={e => set('xp_reward', e.target.value)} /></div>
      </div>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Иконка</label>
          <select className="input" value={form.icon} onChange={e => set('icon', e.target.value)}>
            {ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select></div>
        <div><label style={labelStyle}>Сортировка</label>
          <input type="number" className="input" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} /></div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} /> Активна
      </label>
      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
      <div className="btn-row" style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Сохранить
        </button>
        <button onClick={onClose} className="btn btn-secondary">Отмена</button>
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
        <h3 className="h3" style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Award size={18} color="var(--accent)" /> Достижения ({items.length})
        </h3>
        <button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} /> Создать</button>
      </div>
      <div className="table-scroll-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Достижение', 'Категория', 'Класс', 'Условие', 'Награда', 'XP', 'Получили', 'Статус', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${GRADE_COLOR[a.grade]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Award size={16} color={GRADE_COLOR[a.grade]} />
                  </div>
                  <div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a.title}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.description}</div></div>
                </td>
                <td style={{ padding: '12px', fontSize: 12, color: 'var(--text2)' }}>{CATEGORIES.find(c => c.v === a.category)?.l || a.category}</td>
                <td style={{ padding: '12px' }}><span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: `${GRADE_COLOR[a.grade]}22`, color: GRADE_COLOR[a.grade] }}>{GRADES.find(g => g.v === a.grade)?.l || a.grade}</span></td>
                <td style={{ padding: '12px', fontSize: 12, color: 'var(--text2)' }}>{METRICS.find(m => m.v === a.metric)?.l || a.metric} ≥ {a.threshold}</td>
                <td className="numeric" style={{ padding: '12px', fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>{a.bonus_reward > 0 ? `+${a.bonus_reward} сом` : '—'}</td>
                <td className="numeric" style={{ padding: '12px', fontSize: 13, color: 'var(--warn)' }}>+{a.xp_reward}</td>
                <td className="numeric" style={{ padding: '12px', fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{a.unlocked_by}</td>
                <td style={{ padding: '12px' }}>
                  <span className={`badge ${a.is_active ? 'badge-green' : 'badge-gray'}`}>{a.is_active ? 'Активно' : 'Выкл'}</span>
                </td>
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => setEditing(a)} style={iconBtn}><Pencil size={15} color="var(--text2)" /></button>
                  <button onClick={() => del(a.id)} style={iconBtn}><Trash2 size={15} color="var(--danger)" /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Нет достижений</td></tr>}
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
          <input className="input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="first_purchase" /></div>
      )}
      <div><label style={labelStyle}>Название</label>
        <input className="input" value={form.title} onChange={e => set('title', e.target.value)} /></div>
      <div><label style={labelStyle}>Описание</label>
        <input className="input" value={form.description || ''} onChange={e => set('description', e.target.value)} /></div>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Категория</label>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select></div>
        <div><label style={labelStyle}>Класс</label>
          <select className="input" value={form.grade} onChange={e => set('grade', e.target.value)}>
            {GRADES.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select></div>
      </div>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Метрика (условие)</label>
          <select className="input" value={form.metric} onChange={e => set('metric', e.target.value)}>
            {METRICS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select></div>
        <div><label style={labelStyle}>Порог ≥</label>
          <input type="number" className="input" value={form.threshold} onChange={e => set('threshold', e.target.value)} /></div>
      </div>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Бонус (сом)</label>
          <input type="number" className="input" value={form.bonus_reward} onChange={e => set('bonus_reward', e.target.value)} /></div>
        <div><label style={labelStyle}>XP</label>
          <input type="number" className="input" value={form.xp_reward} onChange={e => set('xp_reward', e.target.value)} /></div>
        <div><label style={labelStyle}>Сортировка</label>
          <input type="number" className="input" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} /></div>
      </div>
      <div><label style={labelStyle}>Иконка</label>
        <select className="input" value={form.icon} onChange={e => set('icon', e.target.value)}>
          {ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
        </select></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} /> Активно
      </label>
      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
      <div className="btn-row" style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Сохранить
        </button>
        <button onClick={onClose} className="btn btn-secondary">Отмена</button>
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
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, marginTop: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="h2" style={{ color: 'var(--text)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color="var(--text2)" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Loading = () => <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}><Loader2 size={18} className="animate-spin" /> Загрузка...</div>;
const ErrorBox = () => <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>Ошибка загрузки</div>;

const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 6 };
