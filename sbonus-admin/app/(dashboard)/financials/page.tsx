'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { financialsAPI } from '@/lib/api';
import {
  Wallet, Loader2, TrendingUp, TrendingDown, DollarSign,
  Plus, Trash2, Edit3, RefreshCw, BarChart3, PieChart as PieIcon,
  Users, Calendar, ArrowUpRight, ArrowDownRight, Save, X, Lock, Shield, Delete,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, Area, AreaChart,
} from 'recharts';

const tooltipStyle = {
  background: '#141c2b', border: '1px solid #1e293b', borderRadius: 10,
  color: '#e2eaf6', fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  padding: '10px 14px',
};
const fmt = (v: number) => Number(v).toLocaleString('ru-RU');
const fmtMoney = (v: number) => fmt(Math.round(v)) + ' сом';
const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return fmt(v);
};

const CATEGORY_COLORS: Record<string, string> = {
  rent: '#ef4444', salary: '#f59e0b', utilities: '#3b82f6', transport: '#8b5cf6',
  marketing: '#ec4899', equipment: '#14b8a6', supplies: '#f97316', taxes: '#6366f1',
  insurance: '#06b6d4', communication: '#84cc16', maintenance: '#a855f7', other: '#64748b',
};

const CATEGORIES = [
  { value: 'rent', label: 'Аренда' }, { value: 'salary', label: 'Зарплата' },
  { value: 'utilities', label: 'Коммунальные' }, { value: 'transport', label: 'Транспорт' },
  { value: 'marketing', label: 'Маркетинг' }, { value: 'equipment', label: 'Оборудование' },
  { value: 'supplies', label: 'Расходные материалы' }, { value: 'taxes', label: 'Налоги' },
  { value: 'insurance', label: 'Страхование' }, { value: 'communication', label: 'Связь/Интернет' },
  { value: 'maintenance', label: 'Ремонт' }, { value: 'other', label: 'Прочие' },
];

type Tab = 'overview' | 'pnl' | 'expenses' | 'cashiers' | 'trends';


// ─── PIN Gate ───
function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasPin, setHasPin] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [setupStep, setSetupStep] = useState<'new' | 'confirm'>('new');
  const [shake, setShake] = useState(false);
  const [dots, setDots] = useState<number[]>([]);

  useEffect(() => {
    const saved = sessionStorage.getItem('pnl_unlocked');
    if (saved === 'true') { onUnlock(); return; }
    financialsAPI.pinStatus().then(r => {
      setHasPin(r.data.has_pin);
      if (!r.data.has_pin) setShowSetup(true);
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const handleDigit = (d: string) => {
    if (showSetup) {
      if (setupStep === 'new') {
        if (newPin.length < 6) setNewPin(p => p + d);
      } else {
        if (confirmPin.length < 6) setConfirmPin(p => p + d);
      }
      return;
    }
    if (pin.length < 6) {
      const next = pin + d;
      setPin(next);
      setDots(prev => [...prev, Date.now()]);
      if (next.length >= 4) {
        // Auto-submit at 4+ digits
        setTimeout(() => submitPin(next), 200);
      }
    }
  };

  const handleDelete = () => {
    if (showSetup) {
      if (setupStep === 'new') setNewPin(p => p.slice(0, -1));
      else setConfirmPin(p => p.slice(0, -1));
      return;
    }
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const submitPin = async (p: string) => {
    setLoading(true);
    setError('');
    try {
      await financialsAPI.verifyPin(p);
      sessionStorage.setItem('pnl_unlocked', 'true');
      onUnlock();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Неверный PIN-код');
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  const submitSetup = async () => {
    if (setupStep === 'new') {
      if (newPin.length < 4) { setError('Минимум 4 цифры'); return; }
      setSetupStep('confirm');
      setError('');
      return;
    }
    if (confirmPin !== newPin) {
      setError('PIN-коды не совпадают');
      setConfirmPin('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    setLoading(true);
    try {
      await financialsAPI.setPin(newPin);
      sessionStorage.setItem('pnl_unlocked', 'true');
      onUnlock();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка установки PIN');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#080e1a' }}>
        <Loader2 size={32} color="#FFE600" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const currentPin = showSetup ? (setupStep === 'new' ? newPin : confirmPin) : pin;
  const maxLen = 6;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#080e1a', padding: '20px',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shakeX {
          0%,100% { transform: translateX(0); }
          20%,60% { transform: translateX(-8px); }
          40%,80% { transform: translateX(8px); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        .pin-digit:active { transform: scale(0.9); background: #1e293b !important; }
        @media (max-width: 480px) {
          .pin-container { padding: 16px !important; }
          .pin-digit { width: 64px !important; height: 64px !important; font-size: 24px !important; }
        }
      `}</style>

      <div className="pin-container" style={{
        background: '#0d1526', border: '1px solid #1e293b', borderRadius: 24,
        padding: '40px 32px', maxWidth: 380, width: '100%',
        animation: 'fadeInUp 0.4s ease-out',
      }}>
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, #FFE600 0%, #f59e0b 100%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(255,230,0,0.2)',
          }}>
            {showSetup ? <Shield size={36} color="#080e1a" /> : <Lock size={36} color="#080e1a" />}
          </div>
        </div>

        {/* Title */}
        <h2 style={{
          color: '#e2eaf6', textAlign: 'center', fontSize: 20, fontWeight: 700,
          margin: '0 0 6px', letterSpacing: 0.3,
        }}>
          {showSetup
            ? (setupStep === 'new' ? 'Установите PIN-код' : 'Подтвердите PIN-код')
            : 'P&L Финансы'}
        </h2>
        <p style={{ color: '#5e6e82', textAlign: 'center', fontSize: 13, margin: '0 0 28px' }}>
          {showSetup
            ? (setupStep === 'new' ? 'Придумайте PIN (4–6 цифр)' : 'Введите PIN ещё раз')
            : 'Введите PIN-код для доступа'}
        </p>

        {/* Dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 28,
          animation: shake ? 'shakeX 0.4s ease' : 'none',
        }}>
          {Array.from({ length: maxLen }).map((_, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < currentPin.length ? '#FFE600' : 'transparent',
              border: `2px solid ${i < currentPin.length ? '#FFE600' : '#2a3a4e'}`,
              transition: 'all 0.15s ease',
              animation: i < currentPin.length ? 'pulse 0.2s ease' : 'none',
            }} />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            color: '#ef4444', textAlign: 'center', fontSize: 13, marginBottom: 16,
            background: '#ef444415', padding: '8px 12px', borderRadius: 8,
          }}>
            {error}
          </div>
        )}

        {/* Numpad */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10, maxWidth: 260, margin: '0 auto',
        }}>
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} className="pin-digit" onClick={() => handleDigit(d)} style={{
              width: 76, height: 76, borderRadius: '50%', border: '1px solid #1e293b',
              background: '#141c2b', color: '#e2eaf6', fontSize: 28, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {d}
            </button>
          ))}
          {/* Bottom row */}
          <div />
          <button className="pin-digit" onClick={() => handleDigit('0')} style={{
            width: 76, height: 76, borderRadius: '50%', border: '1px solid #1e293b',
            background: '#141c2b', color: '#e2eaf6', fontSize: 28, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            0
          </button>
          <button onClick={handleDelete} style={{
            width: 76, height: 76, borderRadius: '50%', border: 'none',
            background: 'transparent', color: '#8899aa', fontSize: 14,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Delete size={24} />
          </button>
        </div>

        {/* Setup confirm button */}
        {showSetup && currentPin.length >= 4 && (
          <button onClick={submitSetup} disabled={loading} style={{
            width: '100%', marginTop: 20, padding: '14px',
            background: 'linear-gradient(135deg, #FFE600, #f59e0b)',
            border: 'none', borderRadius: 12, color: '#080e1a',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Сохранение...' : (setupStep === 'new' ? 'Далее' : 'Установить PIN')}
          </button>
        )}

        {showSetup && setupStep === 'confirm' && (
          <button onClick={() => { setSetupStep('new'); setConfirmPin(''); setError(''); }}
            style={{
              width: '100%', marginTop: 10, padding: '12px',
              background: 'transparent', border: '1px solid #1e293b',
              borderRadius: 12, color: '#8899aa', fontSize: 13, cursor: 'pointer',
            }}>
            Назад
          </button>
        )}

        {loading && !showSetup && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Loader2 size={24} color="#FFE600" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color = '#FFE600', trend }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
  trend?: { value: number; label: string };
}) {
  return (
    <div style={{
      background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14,
      padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'center',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#8899aa', fontSize: 12, marginBottom: 2 }}>{label}</div>
        <div style={{ color: '#e2eaf6', fontSize: 20, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ color: '#5e6e82', fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
      {trend && trend.value !== 0 && (
        <div style={{ textAlign: 'right' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            color: trend.value > 0 ? '#22c55e' : '#ef4444', fontSize: 13, fontWeight: 600,
          }}>
            {trend.value > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend.value)}%
          </div>
          <div style={{ color: '#5e6e82', fontSize: 10 }}>{trend.label}</div>
        </div>
      )}
    </div>
  );
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function FinancialsPage() {
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [summary, setSummary] = useState<any>(null);
  const [monthly, setMonthly] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [expenses, setExpenses] = useState<any>(null);
  const [cashiers, setCashiers] = useState<any>(null);
  const [byCategory, setByCategory] = useState<any>(null);

  const loadData = useCallback(async () => {
    if (!pinUnlocked) return;
    setLoading(true);
    setError('');
    try {
      const [sumRes, monthlyRes] = await Promise.all([
        financialsAPI.summary(month),
        financialsAPI.monthly(6),
      ]);
      setSummary(sumRes.data);
      setMonthly(monthlyRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [month, pinUnlocked]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const loadTab = async () => {
      try {
        if (tab === 'pnl' && !pnl) { const r = await financialsAPI.pnl(month); setPnl(r.data); }
        if (tab === 'expenses' && !expenses) {
          const [eRes, cRes] = await Promise.all([
            financialsAPI.expenses(month),
            financialsAPI.byCategory(month),
          ]);
          setExpenses(eRes.data);
          setByCategory(cRes.data);
        }
        if (tab === 'cashiers' && !cashiers) { const r = await financialsAPI.byCashier(month); setCashiers(r.data); }
      } catch {}
    };
    loadTab();
  }, [tab, month, pnl, expenses, cashiers, byCategory]);

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    setSummary(null); setPnl(null); setExpenses(null); setCashiers(null); setByCategory(null);
  };

  const tabs = [
    { key: 'overview' as const, label: 'Обзор', icon: BarChart3 },
    { key: 'pnl' as const, label: 'P&L отчёт', icon: DollarSign },
    { key: 'expenses' as const, label: 'Расходы', icon: Wallet },
    { key: 'cashiers' as const, label: 'Кассиры', icon: Users },
    { key: 'trends' as const, label: 'Тренды', icon: TrendingUp },
  ];

  // PIN Gate
  if (!pinUnlocked) {
    return <PinGate onUnlock={() => setPinUnlocked(true)} />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#8899aa' }}>
        <Loader2 size={32} className="animate-spin" style={{ marginRight: 12 }} />
        Загрузка финансов...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#ef4444' }}>
        <div>{error}</div>
        <button onClick={loadData} style={{
          marginTop: 16, padding: '8px 20px', background: '#1e293b', border: 'none',
          borderRadius: 8, color: '#e2eaf6', cursor: 'pointer',
        }}>Повторить</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Wallet size={28} color="#FFE600" />
          <h1 style={{ color: '#e2eaf6', fontSize: 24, fontWeight: 700, margin: 0 }}>P&L Финансы</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={month} onChange={e => handleMonthChange(e.target.value)} style={{
            padding: '8px 14px', background: '#0a101e', border: '1px solid #1e293b',
            borderRadius: 8, color: '#e2eaf6', fontSize: 13, cursor: 'pointer',
          }} />
          <button onClick={loadData} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: '#1e293b', border: '1px solid #334155',
            borderRadius: 8, color: '#e2eaf6', cursor: 'pointer', fontSize: 13,
          }}>
            <RefreshCw size={14} /> Обновить
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24, background: '#0a101e',
        borderRadius: 12, padding: 4, border: '1px solid #1e293b',
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            border: 'none', borderRadius: 8,
            background: tab === t.key ? '#1e293b' : 'transparent',
            color: tab === t.key ? '#FFE600' : '#8899aa',
            cursor: 'pointer', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
            whiteSpace: 'nowrap',
          }}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewSection summary={summary} monthly={monthly} />}
      {tab === 'pnl' && <PnlSection data={pnl} />}
      {tab === 'expenses' && <ExpensesSection data={expenses} byCategory={byCategory} month={month}
        onReload={async () => {
          const [e, c] = await Promise.all([financialsAPI.expenses(month), financialsAPI.byCategory(month)]);
          setExpenses(e.data); setByCategory(c.data);
          loadData();
        }} />}
      {tab === 'cashiers' && <CashiersSection data={cashiers} />}
      {tab === 'trends' && <TrendsSection data={monthly} />}
    </div>
  );
}


// ═══════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════

function OverviewSection({ summary, monthly }: { summary: any; monthly: any }) {
  if (!summary) return null;
  const vs = summary.vs_prev_month || {};
  const chartData = (monthly?.months || []).map((m: any) => ({
    name: m.month_label,
    revenue: Math.round(m.revenue),
    expenses: Math.round(m.total_expenses),
    profit: Math.round(m.net_profit),
  }));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon={TrendingUp} label="Выручка" value={fmtMoney(summary.revenue)}
          sub={`${summary.receipts} чеков · ср. ${fmtMoney(summary.avg_receipt)}`}
          color="#22c55e" trend={{ value: vs.revenue_change_pct, label: 'vs прошлый мес' }} />
        <KpiCard icon={DollarSign} label="Валовая прибыль" value={fmtMoney(summary.gross_profit)}
          sub={`Маржа ${summary.gross_margin_pct}%`} color="#3b82f6" />
        <KpiCard icon={Wallet} label="Расходы" value={fmtMoney(summary.total_expenses)}
          sub={`Опер: ${fmtMoney(summary.operating_expenses)} · Бонусы: ${fmtMoney(summary.bonus_expenses)}`}
          color="#f59e0b" />
        <KpiCard icon={BarChart3} label="Чистая прибыль" value={fmtMoney(summary.net_profit)}
          sub={`Маржа ${summary.net_margin_pct}%`}
          color={summary.net_profit >= 0 ? '#22c55e' : '#ef4444'}
          trend={{ value: vs.profit_change_pct, label: 'vs прошлый мес' }} />
      </div>

      {/* Revenue vs Expenses Chart */}
      {chartData.length > 1 && (
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: '#e2eaf6', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Динамика доходов и расходов</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#5e6e82" tick={{ fontSize: 11 }} />
              <YAxis stroke="#5e6e82" tickFormatter={fmtShort} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="Выручка" />
              <Bar dataKey="expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Расходы" />
              <Bar dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Прибыль" />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Expense Categories Pie */}
      {(summary.expense_categories || []).length > 0 && (
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
          <h3 style={{ color: '#e2eaf6', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Структура расходов</h3>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <ResponsiveContainer width="50%" height={240}>
              <PieChart>
                <Pie data={summary.expense_categories.map((c: any) => ({
                  name: c.label, value: c.amount, fill: CATEGORY_COLORS[c.category] || '#64748b',
                }))} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {summary.expense_categories.map((c: any, i: number) => (
                    <Cell key={i} fill={CATEGORY_COLORS[c.category] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'transparent' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {summary.expense_categories.map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e293b20' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: CATEGORY_COLORS[c.category] || '#64748b' }} />
                    <span style={{ color: '#e2eaf6', fontSize: 13 }}>{c.label}</span>
                  </div>
                  <span style={{ color: '#FFE600', fontSize: 13, fontWeight: 600 }}>{fmtMoney(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// ═══════════════════════════════════════════
// P&L REPORT
// ═══════════════════════════════════════════

function PnlSection({ data }: { data: any }) {
  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка P&L...</div>;
  const r = data.report;
  if (!r) return null;

  const lines = [
    { ...r.revenue, bold: false, positive: true },
    { ...r.bonus_discount, bold: false, positive: false },
    { ...r.net_revenue, bold: true, positive: true, separator: true },
    { ...r.cost_of_goods, bold: false, positive: false },
    { ...r.gross_profit, bold: true, positive: true, separator: true, showMargin: true },
  ];

  const opex = r.operating_expenses;
  const expLines = opex?.lines || [];

  return (
    <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 24, maxWidth: 700 }}>
      <h3 style={{ color: '#e2eaf6', fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
        P&L — {data.month}
      </h3>
      <div style={{ display: 'grid', gap: 0 }}>
        {lines.map((line, i) => (
          <div key={i}>
            {line.separator && <div style={{ borderTop: '2px solid #1e293b', margin: '8px 0' }} />}
            <PnlRow label={line.label} amount={line.amount} bold={line.bold} margin={line.margin_pct} />
          </div>
        ))}

        <div style={{ borderTop: '2px solid #1e293b', margin: '8px 0' }} />
        <div style={{ color: '#8899aa', fontSize: 12, fontWeight: 600, padding: '8px 0 4px', textTransform: 'uppercase' }}>
          Операционные расходы
        </div>
        {expLines.map((line: any, i: number) => (
          <PnlRow key={i} label={`  ${line.label}`} amount={-line.amount} indent />
        ))}
        <PnlRow label="Итого опер. расходы" amount={opex.total} bold />

        <div style={{ borderTop: '1px solid #1e293b', margin: '4px 0' }} />
        <PnlRow label={r.bonus_accrual.label} amount={r.bonus_accrual.amount} />

        <div style={{ borderTop: '3px solid #FFE600', margin: '8px 0' }} />
        <PnlRow label={r.net_profit.label} amount={r.net_profit.amount} bold big margin={r.net_profit.margin_pct} />
      </div>
    </div>
  );
}

function PnlRow({ label, amount, bold, big, indent, margin }: {
  label: string; amount: number; bold?: boolean; big?: boolean; indent?: boolean; margin?: number;
}) {
  const isNeg = amount < 0;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: indent ? '3px 0' : '6px 0',
    }}>
      <span style={{
        color: bold ? '#e2eaf6' : '#8899aa',
        fontSize: big ? 16 : indent ? 12 : 13,
        fontWeight: bold ? 700 : 400,
      }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          color: isNeg ? '#ef4444' : bold ? '#22c55e' : '#e2eaf6',
          fontSize: big ? 18 : 13,
          fontWeight: bold ? 700 : 500,
        }}>
          {isNeg ? '-' : ''}{fmtMoney(Math.abs(amount))}
        </span>
        {margin !== undefined && margin !== 0 && (
          <span style={{
            background: '#22c55e20', color: '#22c55e', fontSize: 11,
            padding: '1px 6px', borderRadius: 4, fontWeight: 600,
          }}>{margin}%</span>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════

function ExpensesSection({ data, byCategory, month, onReload }: {
  data: any; byCategory: any; month: string; onReload: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: 'rent', amount: '', description: '', is_recurring: false });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return;
    setSaving(true);
    try {
      await financialsAPI.createExpense({
        category: form.category,
        amount: parseFloat(form.amount),
        month: month,
        description: form.description || undefined,
        is_recurring: form.is_recurring,
      });
      setForm({ category: 'rent', amount: '', description: '', is_recurring: false });
      setShowForm(false);
      onReload();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить расход?')) return;
    await financialsAPI.deleteExpense(id);
    onReload();
  };

  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const catData = (byCategory?.categories || []).map((c: any) => ({
    name: c.label, value: c.amount, fill: CATEGORY_COLORS[c.category] || '#64748b',
  }));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ color: '#8899aa', fontSize: 13 }}>
          Всего расходов: {fmtMoney(byCategory?.total || 0)}
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: showForm ? '#ef444420' : '#22c55e20',
          border: `1px solid ${showForm ? '#ef444440' : '#22c55e40'}`,
          borderRadius: 8, color: showForm ? '#ef4444' : '#22c55e', cursor: 'pointer', fontSize: 13,
        }}>
          {showForm ? <><X size={14} /> Отмена</> : <><Plus size={14} /> Добавить расход</>}
        </button>
      </div>

      {/* Add Expense Form */}
      {showForm && (
        <div style={{
          background: '#0d1526', border: '1px solid #22c55e30', borderRadius: 14,
          padding: 20, marginBottom: 16,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ color: '#8899aa', fontSize: 11, display: 'block', marginBottom: 4 }}>Категория</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{
                width: '100%', padding: '9px 12px', background: '#0a101e', border: '1px solid #1e293b',
                borderRadius: 8, color: '#e2eaf6', fontSize: 13,
              }}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#8899aa', fontSize: 11, display: 'block', marginBottom: 4 }}>Сумма (сом)</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="50000" style={{
                  width: '100%', padding: '9px 12px', background: '#0a101e', border: '1px solid #1e293b',
                  borderRadius: 8, color: '#e2eaf6', fontSize: 13,
                }} />
            </div>
            <div>
              <label style={{ color: '#8899aa', fontSize: 11, display: 'block', marginBottom: 4 }}>Описание</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Аренда за май" style={{
                  width: '100%', padding: '9px 12px', background: '#0a101e', border: '1px solid #1e293b',
                  borderRadius: 8, color: '#e2eaf6', fontSize: 13,
                }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_recurring} onChange={e => setForm({ ...form, is_recurring: e.target.checked })}
                style={{ accentColor: '#FFE600' }} />
              <span style={{ color: '#8899aa', fontSize: 12 }}>Ежемесячный расход</span>
            </label>
            <button onClick={handleSave} disabled={saving || !form.amount} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 20px', background: '#22c55e', border: 'none',
              borderRadius: 8, color: '#0a101e', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              opacity: saving || !form.amount ? 0.5 : 1,
            }}>
              <Save size={14} /> {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {/* Charts + Table */}
      <div style={{ display: 'grid', gridTemplateColumns: catData.length > 0 ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
        {catData.length > 0 && (
          <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
            <h3 style={{ color: '#e2eaf6', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>По категориям</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {catData.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'transparent' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Expenses Table */}
      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0a101e', borderBottom: '1px solid #1e293b' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Категория</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Описание</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Сумма</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', color: '#8899aa', fontWeight: 500 }}>Источник</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', color: '#8899aa', fontWeight: 500, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {(data.expenses || []).map((e: any) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #1e293b15' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLORS[e.category] || '#64748b' }} />
                    <span style={{ color: '#e2eaf6', fontWeight: 500 }}>{e.category_label}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 16px', color: '#8899aa' }}>{e.description || '—'}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{fmtMoney(e.amount)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                  <span style={{
                    background: e.source === '1c' ? '#3b82f620' : '#22c55e20',
                    color: e.source === '1c' ? '#3b82f6' : '#22c55e',
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  }}>{e.source === '1c' ? '1С' : 'Ручной'}</span>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                  {e.source === 'manual' && (
                    <button onClick={() => handleDelete(e.id)} style={{
                      background: 'none', border: 'none', color: '#5e6e82', cursor: 'pointer', padding: 4,
                    }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(data.expenses || []).length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#5e6e82' }}>
                  Нет расходов за этот месяц. Нажмите &quot;Добавить расход&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// CASHIERS
// ═══════════════════════════════════════════

function CashiersSection({ data }: { data: any }) {
  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const cashiers = data.cashiers || [];

  return (
    <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#0a101e', borderBottom: '1px solid #1e293b' }}>
            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>#</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Кассир</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Транзакций</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Выручка</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Начислено бонусов</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Списано бонусов</th>
          </tr>
        </thead>
        <tbody>
          {cashiers.map((c: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid #1e293b15' }}>
              <td style={{ padding: '10px 16px', color: '#FFE600', fontWeight: 700 }}>{i + 1}</td>
              <td style={{ padding: '10px 16px', color: '#e2eaf6', fontWeight: 500 }}>{c.cashier_name}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{fmt(c.transactions)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtMoney(c.revenue)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: '#3b82f6' }}>{fmtMoney(c.bonuses_earned)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: '#f59e0b' }}>{fmtMoney(c.bonuses_spent)}</td>
            </tr>
          ))}
          {cashiers.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#5e6e82' }}>Нет данных по кассирам</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


// ═══════════════════════════════════════════
// TRENDS
// ═══════════════════════════════════════════

function TrendsSection({ data }: { data: any }) {
  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const months = data.months || [];
  const chartData = months.map((m: any) => ({
    name: m.month_label,
    revenue: Math.round(m.revenue),
    grossProfit: Math.round(m.gross_profit),
    netProfit: Math.round(m.net_profit),
    expenses: Math.round(m.total_expenses),
    avgReceipt: Math.round(m.avg_receipt),
    receipts: m.receipts,
  }));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <KpiCard icon={TrendingUp} label="Тренд выручки" value={`${data.trend_pct > 0 ? '+' : ''}${data.trend_pct}%`}
          sub={`За ${months.length} месяцев`} color={data.trend_pct >= 0 ? '#22c55e' : '#ef4444'} />
        <KpiCard icon={DollarSign} label="Общая чистая прибыль" value={fmtMoney(data.total_net_profit)}
          sub={`Выручка: ${fmtMoney(data.total_revenue)}`}
          color={data.total_net_profit >= 0 ? '#22c55e' : '#ef4444'} />
      </div>

      {/* Revenue + Profit Line */}
      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <h3 style={{ color: '#e2eaf6', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Выручка и прибыль</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" stroke="#5e6e82" tick={{ fontSize: 11 }} />
            <YAxis stroke="#5e6e82" tickFormatter={fmtShort} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'transparent' }} />
            <Area type="monotone" dataKey="revenue" stroke="#22c55e" fillOpacity={1} fill="url(#gRevenue)" name="Выручка" strokeWidth={2} />
            <Area type="monotone" dataKey="netProfit" stroke="#3b82f6" fillOpacity={1} fill="url(#gProfit)" name="Чистая прибыль" strokeWidth={2} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Average Receipt */}
      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
        <h3 style={{ color: '#e2eaf6', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Средний чек и количество</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" stroke="#5e6e82" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" stroke="#FFE600" tickFormatter={fmtShort} />
            <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => name === 'Ср. чек' ? fmtMoney(v) : fmt(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar yAxisId="left" dataKey="avgReceipt" fill="#FFE600" radius={[4, 4, 0, 0]} name="Ср. чек" />
            <Bar yAxisId="right" dataKey="receipts" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Чеков" />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
