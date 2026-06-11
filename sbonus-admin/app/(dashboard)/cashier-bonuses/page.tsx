'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';
import {
  Flame, Settings, Trophy, Zap, Calendar, TrendingUp,
  Save, Plus, Trash2, Target, Clock, Award, Star,
  ChevronRight, AlertCircle, Loader2, RefreshCw,
} from 'lucide-react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface MilestoneItem {
  sales: number;
  bonus: number;
}

interface StreakItem {
  days: number;
  bonus: number;
}

interface CashierBonusConfig {
  enabled: boolean;
  daily_milestones: MilestoneItem[];
  monthly_milestones: MilestoneItem[];
  streak_milestones: StreakItem[];
  streak_min_sales: number;
}

interface CashierProgress {
  id: string;
  full_name: string;
  phone: string;
  branch_id: string | null;
  daily: {
    sales: number;
    revenue: number;
    current_milestone: MilestoneItem | null;
    next_milestone: MilestoneItem | null;
    earned_today: number;
  };
  monthly: {
    sales: number;
    revenue: number;
    current_milestone: MilestoneItem | null;
    next_milestone: MilestoneItem | null;
    earned_month: number;
  };
  streak: {
    days: number;
    min_sales: number;
    current_milestone: StreakItem | null;
    next_milestone: StreakItem | null;
    earned_total: number;
  };
}

// ═══════════════════════════════════════════
// CUSTOM TOGGLE
// ═══════════════════════════════════════════

const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
  <div
    onClick={onToggle}
    style={{
      width: 52, height: 28, borderRadius: 16, cursor: 'pointer',
      background: on ? 'var(--success)' : 'var(--bg3)', position: 'relative', transition: 'background 0.2s',
    }}
  >
    <div style={{
      width: 22, height: 22, borderRadius: '16%', background: '#fff', position: 'absolute',
      top: 3, left: on ? 27 : 3, transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    }} />
  </div>
);

// ═══════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════

const ProgressBar = ({ current, target, color = 'var(--accent)' }: { current: number; target: number; color?: string }) => {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%', borderRadius: 10, background: color,
          width: `${pct}%`, transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  );
};

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function CashierBonusesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'progress' | 'settings'>('progress');

  // Config state
  const [config, setConfig] = useState<CashierBonusConfig>({
    enabled: true,
    daily_milestones: [{ sales: 5, bonus: 200 }, { sales: 10, bonus: 500 }, { sales: 20, bonus: 1200 }],
    monthly_milestones: [{ sales: 100, bonus: 3000 }, { sales: 200, bonus: 8000 }, { sales: 500, bonus: 25000 }],
    streak_milestones: [{ days: 7, bonus: 1000 }, { days: 14, bonus: 3000 }, { days: 30, bonus: 10000 }],
    streak_min_sales: 5,
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Progress state
  const [progress, setProgress] = useState<CashierProgress[]>([]);
  const [progressLoading, setProgressLoading] = useState(true);

  // ─── Fetch ───
  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await adminAPI.cashierBonusConfig();
      setConfig(data);
    } catch { /* use defaults */ }
    finally { setConfigLoading(false); }
  }, []);

  const fetchProgress = useCallback(async () => {
    setProgressLoading(true);
    try {
      const { data } = await adminAPI.cashierBonusProgress();
      setProgress(data);
    } catch { /* empty */ }
    finally { setProgressLoading(false); }
  }, []);

  useEffect(() => { fetchConfig(); fetchProgress(); }, [fetchConfig, fetchProgress]);

  // ─── Save Config ───
  const handleSave = async () => {
    setSaving(true);
    try {
      await adminAPI.updateCashierBonusConfig(config);
      toast('success', 'Конфигурация сохранена');
    } catch {
      toast('error', 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  // ─── Milestone editors ───
  const addDaily = () => setConfig(c => ({ ...c, daily_milestones: [...c.daily_milestones, { sales: 0, bonus: 0 }] }));
  const removeDaily = (i: number) => setConfig(c => ({ ...c, daily_milestones: c.daily_milestones.filter((_, idx) => idx !== i) }));
  const updateDaily = (i: number, field: 'sales' | 'bonus', val: number) =>
    setConfig(c => ({ ...c, daily_milestones: c.daily_milestones.map((m, idx) => idx === i ? { ...m, [field]: val } : m) }));

  const addMonthly = () => setConfig(c => ({ ...c, monthly_milestones: [...c.monthly_milestones, { sales: 0, bonus: 0 }] }));
  const removeMonthly = (i: number) => setConfig(c => ({ ...c, monthly_milestones: c.monthly_milestones.filter((_, idx) => idx !== i) }));
  const updateMonthly = (i: number, field: 'sales' | 'bonus', val: number) =>
    setConfig(c => ({ ...c, monthly_milestones: c.monthly_milestones.map((m, idx) => idx === i ? { ...m, [field]: val } : m) }));

  const addStreak = () => setConfig(c => ({ ...c, streak_milestones: [...c.streak_milestones, { days: 0, bonus: 0 }] }));
  const removeStreak = (i: number) => setConfig(c => ({ ...c, streak_milestones: c.streak_milestones.filter((_, idx) => idx !== i) }));
  const updateStreak = (i: number, field: 'days' | 'bonus', val: number) =>
    setConfig(c => ({ ...c, streak_milestones: c.streak_milestones.map((m, idx) => idx === i ? { ...m, [field]: val } : m) }));

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 16,
            background: 'var(--warn)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Flame size={26} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Мотивация кассиров</h1>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>Ступенчатые бонусы за продажи</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setTab('progress')}
            className="btn"
            style={{
              background: tab === 'progress' ? 'rgba(255,230,0,0.12)' : 'var(--bg3)',
              color: tab === 'progress' ? 'var(--accent)' : 'var(--text2)',
              border: `1px solid ${tab === 'progress' ? 'rgba(255,230,0,0.3)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Trophy size={16} /> Прогресс
          </button>
          <button
            onClick={() => setTab('settings')}
            className="btn"
            style={{
              background: tab === 'settings' ? 'rgba(255,230,0,0.12)' : 'var(--bg3)',
              color: tab === 'settings' ? 'var(--accent)' : 'var(--text2)',
              border: `1px solid ${tab === 'settings' ? 'rgba(255,230,0,0.3)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Settings size={16} /> Настройки
          </button>
        </div>
      </div>

      {tab === 'progress' ? (
        <ProgressTab progress={progress} loading={progressLoading} onRefresh={fetchProgress} config={config} />
      ) : (
        <SettingsTab
          config={config}
          setConfig={setConfig}
          loading={configLoading}
          saving={saving}
          onSave={handleSave}
          addDaily={addDaily} removeDaily={removeDaily} updateDaily={updateDaily}
          addMonthly={addMonthly} removeMonthly={removeMonthly} updateMonthly={updateMonthly}
          addStreak={addStreak} removeStreak={removeStreak} updateStreak={updateStreak}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// PROGRESS TAB
// ═══════════════════════════════════════════

function ProgressTab({
  progress, loading, onRefresh, config,
}: {
  progress: CashierProgress[];
  loading: boolean;
  onRefresh: () => void;
  config: CashierBonusConfig;
}) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
        Загрузка прогресса...
      </div>
    );
  }

  if (!progress.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
        <AlertCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
        <p style={{ fontSize: 16, fontWeight: 600 }}>Нет активных кассиров</p>
        <p style={{ fontSize: 13, marginTop: 4 }}>Добавьте кассиров в разделе «Кассиры»</p>
      </div>
    );
  }

  // Summary stats
  const totalSalesToday = progress.reduce((s, c) => s + c.daily.sales, 0);
  const totalRevenueToday = progress.reduce((s, c) => s + c.daily.revenue, 0);
  const totalEarnedToday = progress.reduce((s, c) => s + c.daily.earned_today, 0);
  const topStreak = Math.max(...progress.map(c => c.streak.days), 0);

  return (
    <div>
      {/* Summary cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <SummaryCard icon={<Zap size={20} />} label="Продажи сегодня" value={totalSalesToday} color="#22c55e" />
        <SummaryCard icon={<TrendingUp size={20} />} label="Выручка сегодня" value={`${totalRevenueToday.toLocaleString()} сом`} color="#3b82f6" />
        <SummaryCard icon={<Award size={20} />} label="Бонусы выданы" value={`${totalEarnedToday.toLocaleString()} сом`} color="#f59e0b" />
        <SummaryCard icon={<Flame size={20} />} label="Макс. стрик" value={`${topStreak} дней`} color="#ef4444" />
      </div>

      {/* Refresh */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={onRefresh} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      {/* Cashier cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {progress.map(c => (
          <CashierCard key={c.id} cashier={c} config={config} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function CashierCard({ cashier: c, config }: { cashier: CashierProgress; config: CashierBonusConfig }) {
  const [expanded, setExpanded] = useState(false);

  const dailyNext = c.daily.next_milestone;
  const monthlyNext = c.monthly.next_milestone;
  const streakNext = c.streak.next_milestone;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', cursor: 'pointer', transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: 'var(--warn)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 16,
          }}>
            {c.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{c.full_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{c.phone}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Quick stats */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>Сегодня</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>{c.daily.sales}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>Месяц</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--info)' }}>{c.monthly.sales}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>Стрик</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c.streak.days >= 7 ? 'var(--warn)' : 'var(--text2)' }}>
              {c.streak.days}d
            </div>
          </div>
          <ChevronRight
            size={18}
            style={{
              color: 'var(--text3)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--border)' }}>
          <div className="grid-3" style={{ marginTop: 20 }}>
            {/* Daily */}
            <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Zap size={16} color="var(--success)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Дневной прогресс</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>
                {c.daily.sales} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>продаж</span>
              </div>
              {dailyNext && (
                <>
                  <ProgressBar current={c.daily.sales} target={dailyNext.sales} color="var(--success)" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                    <span>Цель: {dailyNext.sales} продаж</span>
                    <span>+{dailyNext.bonus} сом</span>
                  </div>
                </>
              )}
              {!dailyNext && c.daily.current_milestone && (
                <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 6 }}>
                  Все вехи пройдены!
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                Выручка: <b style={{ color: 'var(--text)' }}>{c.daily.revenue.toLocaleString()} сом</b>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                Заработано: <b style={{ color: 'var(--success)' }}>+{c.daily.earned_today.toLocaleString()} сом</b>
              </div>
            </div>

            {/* Monthly */}
            <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Calendar size={16} color="var(--info)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Месячный прогресс</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--info)', marginBottom: 4 }}>
                {c.monthly.sales} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>продаж</span>
              </div>
              {monthlyNext && (
                <>
                  <ProgressBar current={c.monthly.sales} target={monthlyNext.sales} color="var(--info)" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                    <span>Цель: {monthlyNext.sales} продаж</span>
                    <span>+{monthlyNext.bonus} сом</span>
                  </div>
                </>
              )}
              {!monthlyNext && c.monthly.current_milestone && (
                <div style={{ fontSize: 12, color: 'var(--info)', fontWeight: 600, marginTop: 6 }}>
                  Все вехи пройдены!
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                Выручка: <b style={{ color: 'var(--text)' }}>{c.monthly.revenue.toLocaleString()} сом</b>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                Заработано: <b style={{ color: 'var(--info)' }}>+{c.monthly.earned_month.toLocaleString()} сом</b>
              </div>
            </div>

            {/* Streak */}
            <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Flame size={16} color="var(--warn)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Стрик</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warn)', marginBottom: 4 }}>
                {c.streak.days} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>дней подряд</span>
              </div>
              {streakNext && (
                <>
                  <ProgressBar current={c.streak.days} target={streakNext.days} color="var(--warn)" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                    <span>Цель: {streakNext.days} дней</span>
                    <span>+{streakNext.bonus} сом</span>
                  </div>
                </>
              )}
              {!streakNext && c.streak.current_milestone && (
                <div style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600, marginTop: 6 }}>
                  Все вехи пройдены!
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                Мин. продаж/день: <b style={{ color: 'var(--text)' }}>{c.streak.min_sales}</b>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                Всего за стрик: <b style={{ color: 'var(--warn)' }}>+{c.streak.earned_total.toLocaleString()} сом</b>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════

function SettingsTab({
  config, setConfig, loading, saving, onSave,
  addDaily, removeDaily, updateDaily,
  addMonthly, removeMonthly, updateMonthly,
  addStreak, removeStreak, updateStreak,
}: {
  config: CashierBonusConfig;
  setConfig: React.Dispatch<React.SetStateAction<CashierBonusConfig>>;
  loading: boolean;
  saving: boolean;
  onSave: () => void;
  addDaily: () => void; removeDaily: (i: number) => void; updateDaily: (i: number, f: 'sales' | 'bonus', v: number) => void;
  addMonthly: () => void; removeMonthly: (i: number) => void; updateMonthly: (i: number, f: 'sales' | 'bonus', v: number) => void;
  addStreak: () => void; removeStreak: (i: number) => void; updateStreak: (i: number, f: 'days' | 'bonus', v: number) => void;
}) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
        Загрузка настроек...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Master toggle */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: config.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {config.enabled ? <Zap size={20} color="var(--success)" /> : <AlertCircle size={20} color="var(--danger)" />}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Система мотивации</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {config.enabled ? 'Активна — бонусы начисляются автоматически' : 'Выключена — бонусы не начисляются'}
            </div>
          </div>
        </div>
        <Toggle on={config.enabled} onToggle={() => setConfig(c => ({ ...c, enabled: !c.enabled }))} />
      </div>

      {/* Daily milestones */}
      <MilestoneEditor
        title="Дневные вехи"
        subtitle="Сбрасываются каждый день в полночь"
        icon={<Zap size={18} />}
        iconBg="var(--success)"
        items={config.daily_milestones}
        field1Label="Продаж"
        field1Key="sales"
        field2Label="Бонус (сом)"
        field2Key="bonus"
        onAdd={addDaily}
        onRemove={removeDaily}
        onUpdate={(i, f, v) => updateDaily(i, f as 'sales' | 'bonus', v)}
      />

      {/* Monthly milestones */}
      <MilestoneEditor
        title="Месячные вехи"
        subtitle="Сбрасываются 1-го числа каждого месяца"
        icon={<Calendar size={18} />}
        iconBg="var(--info)"
        items={config.monthly_milestones}
        field1Label="Продаж"
        field1Key="sales"
        field2Label="Бонус (сом)"
        field2Key="bonus"
        onAdd={addMonthly}
        onRemove={removeMonthly}
        onUpdate={(i, f, v) => updateMonthly(i, f as 'sales' | 'bonus', v)}
      />

      {/* Streak milestones */}
      <MilestoneEditor
        title="Стрик-бонусы"
        subtitle="За непрерывные дни с минимум N продажами"
        icon={<Flame size={18} />}
        iconBg="var(--warn)"
        items={config.streak_milestones.map(s => ({ sales: s.days, bonus: s.bonus }))}
        field1Label="Дней подряд"
        field1Key="days"
        field2Label="Бонус (сом)"
        field2Key="bonus"
        onAdd={addStreak}
        onRemove={removeStreak}
        onUpdate={(i, f, v) => updateStreak(i, f as 'days' | 'bonus', v)}
      />

      {/* Streak min sales */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(249,115,22,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Target size={16} color="var(--warn)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Минимум продаж для стрика</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>Сколько продаж в день нужно для сохранения стрика</div>
          </div>
        </div>
        <input
          className="input"
          type="number"
          min={1}
          max={100}
          value={config.streak_min_sales}
          onChange={e => setConfig(c => ({ ...c, streak_min_sales: parseInt(e.target.value) || 1 }))}
          style={{ maxWidth: 180 }}
        />
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 32px', fontSize: 15 }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MILESTONE EDITOR (reusable)
// ═══════════════════════════════════════════

function MilestoneEditor({
  title, subtitle, icon, iconBg, items,
  field1Label, field1Key, field2Label, field2Key,
  onAdd, onRemove, onUpdate,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  items: { sales: number; bonus: number }[];
  field1Label: string;
  field1Key: string;
  field2Label: string;
  field2Key: string;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: string, val: number) => void;
}) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${iconBg}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconBg,
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{subtitle}</div>
          </div>
        </div>
        <button
          onClick={onAdd}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 14px' }}
        >
          <Plus size={14} /> Добавить
        </button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 13 }}>
          Нет вех. Нажмите «Добавить» чтобы создать.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--bg2)', borderRadius: 10, padding: '10px 14px',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 10,
              background: `${iconBg}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: iconBg, fontSize: 12, fontWeight: 700,
            }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{field1Label}</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.sales}
                  onChange={e => onUpdate(i, field1Key, parseInt(e.target.value) || 0)}
                  style={{ padding: '8px 12px', fontSize: 14 }}
                />
              </div>
              <ChevronRight size={16} color="var(--text3)" style={{ marginTop: 16 }} />
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{field2Label}</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.bonus}
                  onChange={e => onUpdate(i, field2Key, parseInt(e.target.value) || 0)}
                  style={{ padding: '8px 12px', fontSize: 14 }}
                />
              </div>
            </div>
            <button
              onClick={() => onRemove(i)}
              style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 10, padding: 8, cursor: 'pointer', marginTop: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Trash2 size={14} color="var(--danger)" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
