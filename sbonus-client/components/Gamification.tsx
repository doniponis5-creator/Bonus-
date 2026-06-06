'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Target, Flame, Award, Zap, Gift, Check, Loader2, Lock, Sparkles, Trophy,
  Store, ShoppingBag, CreditCard, Repeat, UserPlus, Disc3, ShoppingCart,
  Gem, Crown, PiggyBank, Landmark, Banknote, TrendingUp, Rocket, Star,
  Handshake, Users, Megaphone, Medal, X, Info, ArrowRight, HelpCircle,
} from 'lucide-react';
import { gamificationAPI } from '@/lib/api';

// Lucide icon name → component map
const ICONS: Record<string, any> = {
  Target, Flame, Award, Zap, Gift, Store, ShoppingBag, CreditCard, Repeat,
  UserPlus, Disc3, ShoppingCart, Gem, Crown, PiggyBank, Landmark, Banknote,
  TrendingUp, Rocket, Star, Sparkles, Handshake, Users, Megaphone, Medal, Trophy,
};
function Icon({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  const C = ICONS[name] || Award;
  return <C size={size} color={color} />;
}

const PERIOD_LABEL: Record<string, string> = {
  daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно', once: 'Разово',
};
const CAT_LABEL: Record<string, string> = {
  purchases: 'Покупки', bonuses: 'Бонусы', spending: 'Объём', social: 'Друзья',
  tiers: 'Уровни', streaks: 'Серии',
};

const ONBOARDING_KEY = 'sbonus_game_onboarded_v1';
const ONBOARDING_STEPS = [
  { icon: Target, color: '#FFE600', title: 'Выполняйте миссии', text: 'Покупайте, тратьте бонусы и приглашайте друзей — получайте награды каждый день и каждую неделю.' },
  { icon: Flame, color: '#f59e0b', title: 'Держите серию', text: 'Совершайте покупки несколько дней подряд. Ваша серия растёт — а вместе с ней и бонусы.' },
  { icon: Award, color: '#FFE600', title: 'Открывайте достижения', text: 'За покупки, накопленные бонусы и активность вы получаете красивые бейджи и бонусы на счёт.' },
  { icon: Zap, color: '#7C6FFF', title: 'Повышайте уровень', text: 'Каждое действие приносит XP. Копите опыт, поднимайтесь в уровне и станьте легендой магазина!' },
];

interface QuestItem {
  progress_id: string | null; code: string; title: string; description: string;
  icon: string; type: string; period: string; current: number; target: number;
  progress: number; status: string; reward_type: string; reward_amount: number; xp_reward: number;
}
interface AchItem {
  code: string; title: string; description: string; icon: string; category: string;
  grade: string; grade_color: string; xp_reward: number; bonus_reward: number;
  unlocked: boolean; unlocked_at: string | null; progress: number;
}
interface GameData {
  level: number; xp: number; xp_in_level: number; xp_for_next: number;
  streak: number; longest_streak: number; freeze_count: number;
  total_quests_completed: number; achievements_unlocked: number; achievements_total: number;
  claimable_count: number; quests: QuestItem[]; achievements: AchItem[];
  new_unlocks: { code: string; title: string; icon: string; grade: string }[];
}

export default function Gamification() {
  const [data, setData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; amount: number; error?: boolean } | null>(null);
  const [celebrate, setCelebrate] = useState<GameData['new_unlocks']>([]);
  const [achFilter, setAchFilter] = useState<string>('all');
  const [onb, setOnb] = useState(false);
  const [onbStep, setOnbStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) {
        setOnb(true);
        setOnbStep(0);
      }
    } catch { /* ignore */ }
  }, []);

  const finishOnb = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
    setOnb(false);
  };
  const openOnb = () => { setOnbStep(0); setOnb(true); };

  const load = useCallback(async () => {
    try {
      const res = await gamificationAPI.me();
      setData(res.data);
      if (res.data.new_unlocks?.length) setCelebrate(res.data.new_unlocks);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const claim = async (q: QuestItem) => {
    if (!q.progress_id || claiming) return;
    setClaiming(q.progress_id);
    try {
      const res = await gamificationAPI.claim(q.progress_id);
      setToast({ msg: q.title, amount: res.data.reward_amount || 0 });
      setTimeout(() => setToast(null), 3500);
      await load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setToast({ msg: typeof detail === 'string' ? detail : 'Не удалось получить награду', amount: 0, error: true });
      setTimeout(() => setToast(null), 3500);
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '80px 0', color: 'var(--text-2)' }}>
        <Loader2 size={22} className="spinner" />
        <span style={{ fontSize: 14 }}>Загрузка...</span>
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>Не удалось загрузить</div>;
  }

  const claimable = data.quests.filter(q => q.status === 'completed');
  const activeQuests = data.quests.filter(q => q.status === 'active');
  const xpPct = data.xp_for_next ? Math.min(100, (data.xp_in_level / data.xp_for_next) * 100) : 100;
  const achList = achFilter === 'all' ? data.achievements : data.achievements.filter(a => a.category === achFilter);
  const cats = ['all', ...Array.from(new Set(data.achievements.map(a => a.category)))];

  return (
    <div style={{ padding: '8px 0 20px' }}>
      {/* ── Title ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 16px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={22} color="#FFE600" /> Цели
        </h2>
        <button onClick={openOnb} aria-label="Как это работает" className="tap" style={{
          background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer',
          width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-2)',
        }}>
          <HelpCircle size={20} />
        </button>
      </div>

      {/* ── LEVEL / XP HERO ── */}
      <div className="card card-accent" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 58, height: 58, borderRadius: 16, flexShrink: 0,
            background: 'linear-gradient(135deg, #FFE600, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 22px rgba(255,230,0,0.32)',
          }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#0a0a0a' }}>{data.level}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Уровень</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Геймер · {data.xp} XP</div>
            <div className="progress" style={{ marginTop: 8 }}>
              <div className="progress-bar" style={{ width: `${xpPct}%` }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              До {data.level + 1} уровня: {Math.max(0, data.xp_for_next - data.xp_in_level)} XP
            </div>
          </div>
        </div>
      </div>

      {/* ── Подсказка для новичка ── */}
      {data.level === 1 && data.xp === 0 && (
        <div className="card" style={{ margin: '0 0 12px', padding: 14, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(255,230,0,0.18)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: 'rgba(255,230,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Info size={20} color="#FFE600" />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>
            Совершите первую покупку, чтобы начать выполнять миссии и открывать достижения!
          </div>
        </div>
      )}

      {/* ── STREAK + ACHIEVEMENTS COUNT ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ margin: 0, textAlign: 'center', padding: 16 }}>
          <Flame size={26} color={data.streak > 0 ? '#f59e0b' : 'var(--text-3)'} />
          <div style={{ fontSize: 28, fontWeight: 900, color: data.streak > 0 ? '#FFE600' : 'var(--text-2)', lineHeight: 1.2 }}>{data.streak}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>дней подряд</div>
          {data.longest_streak > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>рекорд: {data.longest_streak}</div>
          )}
        </div>
        <div className="card" style={{ margin: 0, textAlign: 'center', padding: 16 }}>
          <Award size={26} color="#FFE600" />
          <div style={{ fontSize: 28, fontWeight: 900, color: '#FFE600', lineHeight: 1.2 }}>
            {data.achievements_unlocked}<span style={{ fontSize: 16, color: 'var(--text-3)' }}>/{data.achievements_total}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>достижений</div>
        </div>
      </div>

      {/* ── CLAIMABLE (готово к получению) ── */}
      {claimable.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Gift size={16} color="#34d399" /> Заберите награду
          </h3>
          {claimable.map(q => (
            <div key={q.code} className="card" style={{
              margin: '0 0 10px', padding: 14, display: 'flex', alignItems: 'center', gap: 12,
              border: '1px solid rgba(52,211,153,0.35)',
              background: 'linear-gradient(135deg, rgba(52,211,153,0.10), rgba(52,211,153,0))',
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={q.icon} size={20} color="#34d399" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{q.title}</div>
                <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>
                  +{q.reward_amount} сом · +{q.xp_reward} XP
                </div>
              </div>
              <button
                onClick={() => claim(q)}
                disabled={claiming === q.progress_id}
                className="tap"
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 10, padding: '9px 16px',
                  fontWeight: 700, fontSize: 13, color: '#0a0a0a', flexShrink: 0,
                  background: 'linear-gradient(135deg, #34d399, #10b981)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: claiming === q.progress_id ? 0.6 : 1,
                }}
              >
                {claiming === q.progress_id ? <Loader2 size={14} className="spinner" /> : <Check size={14} />}
                Забрать
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── ACTIVE MISSIONS ── */}
      {activeQuests.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Zap size={16} color="#FFE600" /> Активные миссии
          </h3>
          {activeQuests.map(q => {
            const pct = Math.round((q.progress || 0) * 100);
            return (
              <div key={q.code} className="card" style={{ margin: '0 0 10px', padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'rgba(255,230,0,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={q.icon} size={20} color="#FFE600" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{q.title}</span>
                      <span className="badge badge-accent" style={{ flexShrink: 0 }}>+{q.reward_amount} сом</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>{q.description}</div>
                    <div className="progress" style={{ marginTop: 8 }}>
                      <div className="progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                      <span>{PERIOD_LABEL[q.period] || ''}</span>
                      <span>{Math.floor(q.current)} / {Math.floor(q.target)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ACHIEVEMENTS ── */}
      <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Trophy size={16} color="#FFE600" /> Достижения
      </h3>
      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 4 }}>
        {cats.map(c => (
          <button key={c} onClick={() => setAchFilter(c)} className="tap"
            style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: achFilter === c ? '#FFE600' : 'rgba(255,255,255,0.06)',
              color: achFilter === c ? '#0a0a0a' : 'var(--text-2)',
            }}>
            {c === 'all' ? 'Все' : (CAT_LABEL[c] || c)}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {achList.map(a => (
          <div key={a.code} style={{
            borderRadius: 16, padding: '14px 8px', textAlign: 'center', position: 'relative',
            background: a.unlocked ? `linear-gradient(135deg, ${a.grade_color}22, rgba(255,255,255,0.02))` : 'rgba(255,255,255,0.03)',
            border: a.unlocked ? `1px solid ${a.grade_color}66` : '1px solid rgba(255,255,255,0.05)',
            opacity: a.unlocked ? 1 : 0.72,
          }}>
            <div style={{
              width: 46, height: 46, borderRadius: 14, margin: '0 auto 8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: a.unlocked ? a.grade_color : 'rgba(255,255,255,0.06)',
              boxShadow: a.unlocked ? `0 4px 16px ${a.grade_color}55` : 'none',
            }}>
              {a.unlocked
                ? <Icon name={a.icon} size={22} color="#0a0a0a" />
                : <Lock size={18} color="var(--text-3)" />}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: a.unlocked ? 'var(--text)' : 'var(--text-2)' }}>{a.title}</div>
            {!a.unlocked && a.progress > 0 && a.progress < 1 && (
              <div className="progress" style={{ marginTop: 6, height: 4 }}>
                <div className="progress-bar" style={{ width: `${Math.round(a.progress * 100)}%` }} />
              </div>
            )}
            {a.unlocked && (
              <div style={{ fontSize: 10, color: a.grade_color, fontWeight: 700, marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Check size={11} /> Получено
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── CLAIM TOAST ── */}
      {toast && (
        <div className="float-up" style={{
          position: 'fixed', bottom: 96, left: 16, right: 16, maxWidth: 448, margin: '0 auto',
          background: toast.error ? 'linear-gradient(135deg, #f87171, #ef4444)' : 'linear-gradient(135deg, #34d399, #10b981)',
          color: toast.error ? '#fff' : '#0a0a0a',
          borderRadius: 16, padding: '14px 18px', zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}>
          {toast.error ? <X size={22} /> : <Sparkles size={22} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{toast.error ? 'Не получилось' : 'Награда получена!'}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{toast.error ? toast.msg : `${toast.msg} · +${toast.amount} сом`}</div>
          </div>
        </div>
      )}

      {/* ── ONBOARDING (первый вход) ── */}
      {onb && (() => {
        const step = ONBOARDING_STEPS[onbStep];
        const StepIcon = step.icon;
        const isLast = onbStep === ONBOARDING_STEPS.length - 1;
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(7,8,13,0.94)',
            backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <div className="float-up" style={{
              background: 'var(--bg-2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 28,
              padding: '32px 24px 24px', maxWidth: 360, width: '100%', textAlign: 'center', position: 'relative',
            }}>
              <button onClick={finishOnb} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontWeight: 600 }}>
                Пропустить
              </button>
              <div className="pulse" style={{
                width: 96, height: 96, borderRadius: 28, margin: '8px auto 22px',
                background: `linear-gradient(135deg, ${step.color}, ${step.color}99)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 44px ${step.color}66`,
              }}>
                <StepIcon size={46} color="#0a0a0a" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>{step.title}</h3>
              <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 24, minHeight: 66 }}>{step.text}</p>
              {/* Dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 22 }}>
                {ONBOARDING_STEPS.map((_, i) => (
                  <div key={i} style={{
                    width: i === onbStep ? 22 : 7, height: 7, borderRadius: 999,
                    background: i === onbStep ? '#FFE600' : 'rgba(255,255,255,0.18)',
                    transition: 'all 0.3s var(--ease-out)',
                  }} />
                ))}
              </div>
              <button
                onClick={() => isLast ? finishOnb() : setOnbStep(s => s + 1)}
                className="btn btn-primary"
              >
                {isLast ? 'Начать!' : 'Далее'} {!isLast && <ArrowRight size={18} />}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── ACHIEVEMENT CELEBRATION ── */}
      {celebrate.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(7,8,13,0.82)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setCelebrate([])}>
          <div className="float-up" style={{
            background: 'var(--bg-2)', border: '1px solid rgba(255,230,0,0.3)', borderRadius: 24,
            padding: '32px 24px', textAlign: 'center', maxWidth: 340, width: '100%', position: 'relative',
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setCelebrate([])} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
              <X size={20} />
            </button>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFE600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
              Новое достижение!
            </div>
            {celebrate.slice(0, 3).map(u => {
              const color = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#FFE600', platinum: '#e5e4e2' }[u.grade] || '#cd7f32';
              return (
                <div key={u.code} style={{ marginBottom: 16 }}>
                  <div className="pulse" style={{
                    width: 88, height: 88, borderRadius: 26, margin: '0 auto 10px',
                    background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 0 40px ${color}aa`,
                  }}>
                    <Icon name={u.icon} size={42} color="#0a0a0a" />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{u.title}</div>
                </div>
              );
            })}
            <button onClick={() => setCelebrate([])} className="btn btn-primary" style={{ marginTop: 8 }}>
              Отлично!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
