'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { financialsAPI, productAPI } from '@/lib/api';
import {
  Wallet, Loader2, TrendingUp, TrendingDown, DollarSign, Truck, Package, AlertTriangle, ChevronDown, ChevronRight,
  Plus, Trash2, Edit3, RefreshCw, BarChart3, PieChart as PieIcon,
  Users, Calendar, ArrowUpRight, ArrowDownRight, Save, X, Lock, Shield, Delete, Gift, Banknote,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, Area, AreaChart,
} from 'recharts';

const tooltipStyle = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
  color: 'var(--text)', fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
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
  marketing: '#ec4899', equipment: '#06b6d4', supplies: '#f59e0b', taxes: '#3b82f6',
  insurance: '#06b6d4', communication: '#84cc16', maintenance: '#8b5cf6', other: '#8899aa',
  'Аренда': '#ef4444', 'Зарплата': '#f59e0b', 'Коммунальные': '#3b82f6', 'Транспорт': '#8b5cf6',
  'Маркетинг': '#ec4899', 'Оборудование': '#06b6d4', 'Расходные материалы': '#f59e0b', 'Налоги': '#3b82f6',
  'Страхование': '#06b6d4', 'Связь/Интернет': '#84cc16', 'Ремонт': '#8b5cf6', 'Прочие': '#8899aa',
};

// Dynamic color palette for free-text categories
const DYNAMIC_PALETTE = [
  '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f59e0b', '#3b82f6', '#06b6d4', '#84cc16',
  '#8b5cf6', '#ef4444', '#3b82f6', '#ec4899', '#22c55e',
  '#f59e0b', '#3b82f6', '#8b5cf6', '#FFE600', '#06b6d4',
];
const getCategoryColor = (cat: string, index: number) =>
  CATEGORY_COLORS[cat] || DYNAMIC_PALETTE[index % DYNAMIC_PALETTE.length];

// Group small categories: top N + "Прочее"
const MAX_PIE_SLICES = 50;
const groupExpenseCategories = (cats: any[]) => {
  if (!cats || cats.length <= MAX_PIE_SLICES) return cats;
  const sorted = [...cats].sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, MAX_PIE_SLICES - 1);
  const rest = sorted.slice(MAX_PIE_SLICES - 1);
  const otherAmount = rest.reduce((s: number, c: any) => s + c.amount, 0);
  return [...top, { category: 'Прочие', label: `Прочие (${rest.length})`, amount: otherAmount }];
};

const CATEGORIES = [
  { value: 'rent', label: 'Аренда' }, { value: 'salary', label: 'Зарплата' },
  { value: 'utilities', label: 'Коммунальные' }, { value: 'transport', label: 'Транспорт' },
  { value: 'marketing', label: 'Маркетинг' }, { value: 'equipment', label: 'Оборудование' },
  { value: 'supplies', label: 'Расходные материалы' }, { value: 'taxes', label: 'Налоги' },
  { value: 'insurance', label: 'Страхование' }, { value: 'communication', label: 'Связь/Интернет' },
  { value: 'maintenance', label: 'Ремонт' }, { value: 'other', label: 'Прочие' },
];

type Tab = 'overview' | 'daily' | 'pnl' | 'cash' | 'suppliers' | 'expenses' | 'cashiers' | 'trends';


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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); handleDigit(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); handleDelete(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (showSetup) submitSetup(); else if (pin.length >= 4) submitPin(pin); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSetup, setupStep, pin, newPin, confirmPin, loading]);

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
        <Loader2 size={32} color="#FFE600" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const currentPin = showSetup ? (setupStep === 'new' ? newPin : confirmPin) : pin;
  const maxLen = 6;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)', padding: '20px',
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
        .pin-digit:active { transform: scale(0.9); background: var(--border) !important; }
        @media (max-width: 480px) {
          .pin-container { padding: 16px !important; }
          .pin-digit { width: 64px !important; height: 64px !important; font-size: 24px !important; }
        }
      `}</style>

      <div className="pin-container" style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '40px 32px', maxWidth: 380, width: '100%',
        animation: 'fadeInUp 0.4s ease-out',
      }}>
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(255,230,0,0.2)',
          }}>
            {showSetup ? <Shield size={36} color="#0a0f1a" /> : <Lock size={36} color="#0a0f1a" />}
          </div>
        </div>

        {/* Title */}
        <h2 style={{
          color: 'var(--text)', textAlign: 'center', fontSize: 20, fontWeight: 700,
          margin: '0 0 6px', letterSpacing: 0.3,
        }}>
          {showSetup
            ? (setupStep === 'new' ? 'Установите PIN-код' : 'Подтвердите PIN-код')
            : 'P&L Финансы'}
        </h2>
        <p style={{ color: 'var(--text3)', textAlign: 'center', fontSize: 13, margin: '0 0 28px' }}>
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
              background: i < currentPin.length ? 'var(--accent)' : 'transparent',
              border: `2px solid ${i < currentPin.length ? 'var(--accent)' : 'var(--border-strong)'}`,
              transition: 'all 0.15s ease',
              animation: i < currentPin.length ? 'pulse 0.2s ease' : 'none',
            }} />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            color: 'var(--danger)', textAlign: 'center', fontSize: 13, marginBottom: 16,
            background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 10,
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
              width: 76, height: 76, borderRadius: '50%', border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--text)', fontSize: 26, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {d}
            </button>
          ))}
          {/* Bottom row */}
          <div />
          <button className="pin-digit" onClick={() => handleDigit('0')} style={{
            width: 76, height: 76, borderRadius: '50%', border: '1px solid var(--border)',
            background: 'var(--card)', color: 'var(--text)', fontSize: 26, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            0
          </button>
          <button onClick={handleDelete} style={{
            width: 76, height: 76, borderRadius: '50%', border: 'none',
            background: 'transparent', color: 'var(--text2)', fontSize: 14,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Delete size={24} />
          </button>
        </div>

        {/* Setup confirm button */}
        {showSetup && currentPin.length >= 4 && (
          <button onClick={submitSetup} disabled={loading} style={{
            width: '100%', marginTop: 20, padding: '14px',
            background: 'var(--accent)',
            border: 'none', borderRadius: 10, color: 'var(--on-accent)',
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
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 10, color: 'var(--text2)', fontSize: 13, cursor: 'pointer',
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
  trend?: { value: number | null; label: string };
}) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
      padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'center',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
      {trend && typeof trend.value === 'number' && trend.value !== 0 && (
        <div style={{ textAlign: 'right' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            color: trend.value > 0 ? 'var(--success)' : 'var(--danger)', fontSize: 13, fontWeight: 600,
          }}>
            {trend.value > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend.value)}%
          </div>
          <div style={{ color: 'var(--text3)', fontSize: 10 }}>{trend.label}</div>
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
  const [showPinModal, setShowPinModal] = useState(false);

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
    { key: 'daily' as const, label: 'По дням', icon: Calendar },
    { key: 'pnl' as const, label: 'P&L отчёт', icon: DollarSign },
    { key: 'cash' as const, label: 'Касса', icon: Banknote },
    { key: 'suppliers' as const, label: 'Поставщики', icon: Truck },
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
        <Loader2 size={32} className="animate-spin" style={{ marginRight: 12 }} />
        Загрузка финансов...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--danger)' }}>
        <div>{error}</div>
        <button onClick={loadData} style={{
          marginTop: 16, padding: '8px 20px', background: 'var(--border)', border: 'none',
          borderRadius: 10, color: 'var(--text)', cursor: 'pointer',
        }}>Повторить</button>
      </div>
    );
  }

  return (
    <div className="page-root" style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Wallet size={28} color="#FFE600" />
          <h1 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700, margin: 0 }}>P&L Финансы</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SyncBadge />
          <input type="month" value={month} onChange={e => handleMonthChange(e.target.value)} style={{
            padding: '8px 14px', background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, color: 'var(--text)', fontSize: 13, cursor: 'pointer',
          }} />
          <button onClick={() => setShowPinModal(true)} title="Сменить PIN" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, color: 'var(--text2)', cursor: 'pointer', fontSize: 13,
          }}>
            <Lock size={14} /> PIN
          </button>
          <button onClick={loadData} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: 'var(--border)', border: '1px solid var(--bg3)',
            borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 13,
          }}>
            <RefreshCw size={14} /> Обновить
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mobile-tab-bar" style={{
        display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg2)',
        borderRadius: 10, padding: 4, border: '1px solid var(--border)',
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            border: 'none', borderRadius: 10,
            background: tab === t.key ? 'var(--border)' : 'transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--text2)',
            cursor: 'pointer', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
            whiteSpace: 'nowrap',
          }}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewSection summary={summary} monthly={monthly} />}
      {tab === 'daily' && <DailySection month={month} />}
      {tab === 'pnl' && <PnlSection data={pnl} />}
      {tab === 'cash' && <CashSection month={month} />}
      {tab === 'expenses' && <ExpensesSection data={expenses} byCategory={byCategory} month={month}
        onReload={async () => {
          const [e, c] = await Promise.all([financialsAPI.expenses(month), financialsAPI.byCategory(month)]);
          setExpenses(e.data); setByCategory(c.data);
          loadData();
        }} />}
      {tab === 'cashiers' && <CashiersSection data={cashiers} />}
      {tab === 'suppliers' && <SuppliersSection />}
      {tab === 'trends' && <TrendsSection data={monthly} />}

      {showPinModal && <ChangePinModal onClose={() => setShowPinModal(false)} />}
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
    opnet: Math.round(m.operating_net_profit),
  }));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon={TrendingUp} label="Выручка" value={fmtMoney(summary.revenue)}
          sub={`${summary.receipts} чеков · ср. ${fmtMoney(summary.avg_receipt)}${summary.revenue_source === 'transactions' ? ' · из транзакций (нет строк 1С)' : ''}`}
          color="#22c55e" trend={{ value: vs.revenue_change_pct, label: 'vs прошлый мес' }} />
        <KpiCard icon={DollarSign} label="Валовая прибыль" value={fmtMoney(summary.gross_profit)}
          sub={`Маржа ${summary.gross_margin_pct}%${summary.revenue_source === 'items' && summary.cost_coverage_pct < 100 ? ` · себест. известна ${summary.cost_coverage_pct}%` : ''}`}
          color="#3b82f6" />
        <KpiCard icon={Wallet} label="Расходы" value={fmtMoney(summary.total_expenses)}
          sub={`Постоянные: ${fmtMoney(summary.recurring_expenses)} · Разовые: ${fmtMoney(summary.one_off_expenses)}`}
          color="#f59e0b" />
        <KpiCard icon={Gift} label="Бонусы клиентам" value={fmtMoney(summary.bonus_redeemed)}
          sub={`Списано: ${fmtMoney(summary.bonus_redeemed)} · Начислено: ${fmtMoney(summary.bonus_issued)}`}
          color="#ec4899" />
        <KpiCard icon={BarChart3} label="Чистая прибыль" value={fmtMoney(summary.net_profit)}
          sub={`Маржа ${summary.net_margin_pct}% · до бонусов: ${fmtMoney(summary.net_before_bonus)}${summary.one_off_expenses > 0 ? ` · без разовых: ${fmtMoney(summary.operating_net_profit)}` : ''}`}
          color={summary.net_profit >= 0 ? '#22c55e' : '#ef4444'}
          trend={{ value: vs.profit_change_pct, label: 'vs прошлый мес' }} />
      </div>

      {/* Revenue vs Expenses Chart */}
      {chartData.length > 1 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Динамика доходов и расходов</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#8899aa" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8899aa" tickFormatter={fmtShort} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="Выручка" />
              <Bar dataKey="expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Расходы" />
              <Bar dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Чистая" />
              <Bar dataKey="opnet" fill="#a855f7" radius={[4, 4, 0, 0]} name="Без разовых" />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Expense Categories Pie */}
      {(summary.expense_categories || []).length > 0 && (() => {
        const grouped = groupExpenseCategories(summary.expense_categories);
        const total = grouped.reduce((s: number, c: any) => s + c.amount, 0);
        return (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>Структура расходов</h3>
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>{summary.expense_categories.length} категорий • {fmtMoney(total)}</span>
          </div>
          <div className="mobile-stack" style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <ResponsiveContainer width="45%" height={260}>
              <PieChart>
                <Pie data={grouped.map((c: any, i: number) => ({
                  name: c.label, value: c.amount, fill: getCategoryColor(c.category, i),
                }))} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={2} strokeWidth={0}>
                  {grouped.map((c: any, i: number) => (
                    <Cell key={i} fill={getCategoryColor(c.category, i)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'transparent' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, maxHeight: 280, overflowY: 'auto' }}>
              {grouped.map((c: any, i: number) => {
                const pct = total > 0 ? ((c.amount / total) * 100).toFixed(1) : '0';
                return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(30,41,59,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 999, background: getCategoryColor(c.category, i), flexShrink: 0 }} />
                    <span style={{ color: 'var(--text)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ color: 'var(--text3)', fontSize: 11, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                    <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'right' }}>{fmtMoney(c.amount)}</span>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
        );
      })()}
    </>
  );
}


// ═══════════════════════════════════════════
// P&L REPORT
// ═══════════════════════════════════════════

function PnlSection({ data }: { data: any }) {
  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка P&L...</div>;
  const r = data.report;
  if (!r) return null;

  const lines = [
    { ...r.revenue, bold: false, positive: true },
    { ...r.cost_of_goods, bold: false, positive: false },
    { ...r.gross_profit, bold: true, positive: true, separator: true, showMargin: true },
  ];

  const opex = r.operating_expenses;
  const expLines = opex?.lines || [];

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, maxWidth: 700 }}>
      <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
        P&L — {data.month}
      </h3>
      {data.revenue_source === 'transactions' && (
        <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: -12, marginBottom: 16, lineHeight: 1.5 }}>
          Выручка взята из транзакций — строки чеков 1С за этот месяц отсутствуют, себестоимость не учтена.
        </div>
      )}
      <div style={{ display: 'grid', gap: 0 }}>
        {lines.map((line, i) => (
          <div key={i}>
            {line.separator && <div style={{ borderTop: '2px solid var(--border)', margin: '8px 0' }} />}
            <PnlRow label={line.label} amount={line.amount} bold={line.bold} margin={line.margin_pct} />
          </div>
        ))}

        <div style={{ borderTop: '2px solid var(--border)', margin: '8px 0' }} />
        <div style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600, padding: '8px 0 4px', textTransform: 'uppercase' }}>
          Операционные расходы
        </div>
        {expLines.map((line: any, i: number) => (
          <PnlRow key={i} label={`  ${line.label}`} amount={-line.amount} indent />
        ))}
        <PnlRow label="Итого опер. расходы" amount={opex.total} bold />
        {r.one_off_expenses > 0 && (
          <PnlRow label="  в т.ч. разовые (одноразовые)" amount={-r.one_off_expenses} indent />
        )}

        {r.operating_net_profit && r.one_off_expenses > 0 && (
          <>
            <div style={{ borderTop: '2px solid var(--border)', margin: '8px 0' }} />
            <PnlRow label={r.operating_net_profit.label} amount={r.operating_net_profit.amount} bold margin={r.operating_net_profit.margin_pct} />
          </>
        )}

        {r.net_before_bonus && (
          <>
            <div style={{ borderTop: '2px solid var(--border)', margin: '8px 0' }} />
            <PnlRow label={r.net_before_bonus.label} amount={r.net_before_bonus.amount} bold margin={r.net_before_bonus.margin_pct} />
          </>
        )}
        {r.bonus && r.bonus.amount !== 0 && (
          <PnlRow label={`  ${r.bonus.label}`} amount={r.bonus.amount} indent />
        )}

        <div style={{ borderTop: '3px solid var(--accent)', margin: '8px 0' }} />
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
        color: bold ? 'var(--text)' : 'var(--text2)',
        fontSize: big ? 16 : indent ? 12 : 13,
        fontWeight: bold ? 700 : 400,
      }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          color: isNeg ? 'var(--danger)' : bold ? 'var(--success)' : 'var(--text)',
          fontSize: big ? 18 : 13,
          fontWeight: bold ? 700 : 500,
        }}>
          {isNeg ? '-' : ''}{fmtMoney(Math.abs(amount))}
        </span>
        {margin !== undefined && margin !== 0 && (
          <span style={{
            background: 'rgba(34,197,94,0.13)', color: 'var(--success)', fontSize: 11,
            padding: '1px 6px', borderRadius: 999, fontWeight: 600,
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
  const [form, setForm] = useState({ category: '', amount: '', description: '', is_recurring: false });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.category.trim() || !form.amount || parseFloat(form.amount) <= 0) return;
    setSaving(true);
    try {
      await financialsAPI.createExpense({
        category: form.category,
        amount: parseFloat(form.amount),
        month: month,
        description: form.description || undefined,
        is_recurring: form.is_recurring,
      });
      setForm({ category: '', amount: '', description: '', is_recurring: false });
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

  const handleToggleRecurring = async (e: any) => {
    try {
      await financialsAPI.updateExpense(e.id, { is_recurring: !e.is_recurring });
      onReload();
    } catch {}
  };

  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const rawCats = byCategory?.categories || [];
  const catGrouped = groupExpenseCategories(rawCats);
  const catData = catGrouped.map((c: any, i: number) => ({
    name: c.label, value: c.amount, fill: getCategoryColor(c.category, i),
  }));
  // Build color map: every category gets a stable color from its sorted position
  const allCatsSorted = [...rawCats].sort((a: any, b: any) => b.amount - a.amount);
  const catColorMap: Record<string, string> = {};
  allCatsSorted.forEach((c: any, i: number) => { catColorMap[c.category] = getCategoryColor(c.category, i); });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>
          Всего расходов: {fmtMoney(byCategory?.total || 0)}
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: showForm ? 'rgba(239,68,68,0.13)' : 'rgba(34,197,94,0.13)',
          border: `1px solid ${showForm ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
          borderRadius: 10, color: showForm ? 'var(--danger)' : 'var(--success)', cursor: 'pointer', fontSize: 13,
        }}>
          {showForm ? <><X size={14} /> Отмена</> : <><Plus size={14} /> Добавить расход</>}
        </button>
      </div>

      {/* Add Expense Form */}
      {showForm && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 16,
          padding: 20, marginBottom: 16,
        }}>
          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ color: 'var(--text2)', fontSize: 11, display: 'block', marginBottom: 4 }}>Категория</label>
              <input list="cat-list" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="Введите или выберите" style={{
                  width: '100%', padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 10, color: 'var(--text)', fontSize: 13,
                }} />
              <datalist id="cat-list">
                {CATEGORIES.map(c => <option key={c.value} value={c.label} />)}
              </datalist>
            </div>
            <div>
              <label style={{ color: 'var(--text2)', fontSize: 11, display: 'block', marginBottom: 4 }}>Сумма (сом)</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="50000" style={{
                  width: '100%', padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 10, color: 'var(--text)', fontSize: 13,
                }} />
            </div>
            <div>
              <label style={{ color: 'var(--text2)', fontSize: 11, display: 'block', marginBottom: 4 }}>Описание</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Аренда за май" style={{
                  width: '100%', padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 10, color: 'var(--text)', fontSize: 13,
                }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_recurring} onChange={e => setForm({ ...form, is_recurring: e.target.checked })}
                style={{ accentColor: 'var(--accent)' }} />
              <span style={{ color: 'var(--text2)', fontSize: 12 }}>Ежемесячный расход</span>
            </label>
            <button onClick={handleSave} disabled={saving || !form.amount} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 20px', background: 'var(--success)', border: 'none',
              borderRadius: 10, color: 'var(--bg2)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
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
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>По категориям</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {catData.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'transparent' }} />

              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Expenses Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Категория</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Описание</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Сумма</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text2)', fontWeight: 500 }}>Источник</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text2)', fontWeight: 500, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {(data.expenses || []).map((e: any) => (
              <tr key={e.id} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 999, background: catColorMap[e.category] || getCategoryColor(e.category, 0) }} />
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{e.category_label}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 16px', color: 'var(--text2)' }}>
                  <span>{e.description || '—'}</span>
                  {e.source === 'manual' ? (
                    <button onClick={() => handleToggleRecurring(e)} title="Переключить: постоянный / разовый"
                      style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                        background: e.is_recurring ? 'rgba(139,92,246,0.15)' : 'rgba(245,158,11,0.15)',
                        color: e.is_recurring ? '#8b5cf6' : 'var(--warn)', border: '1px solid transparent' }}>
                      {e.is_recurring ? 'Постоянный' : 'Разовый'}
                    </button>
                  ) : (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      background: e.is_recurring ? 'rgba(139,92,246,0.15)' : 'rgba(245,158,11,0.15)',
                      color: e.is_recurring ? '#8b5cf6' : 'var(--warn)' }}>
                      {e.is_recurring ? 'Постоянный' : 'Разовый'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{fmtMoney(e.amount)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                  <span style={{
                    background: e.source === '1c' ? 'rgba(59,130,246,0.13)' : 'rgba(34,197,94,0.13)',
                    color: e.source === '1c' ? 'var(--info)' : 'var(--success)',
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                  }}>{e.source === '1c' ? '1С' : 'Ручной'}</span>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                  {e.source === 'manual' && (
                    <button onClick={() => handleDelete(e.id)} style={{
                      background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4,
                    }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(data.expenses || []).length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
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
  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const cashiers = data.cashiers || [];

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>#</th>
            <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Кассир</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Транзакций</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Выручка</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Начислено бонусов</th>
            <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Списано бонусов</th>
          </tr>
        </thead>
        <tbody>
          {cashiers.map((c: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
              <td style={{ padding: '10px 16px', color: 'var(--accent)', fontWeight: 700 }}>{i + 1}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text)', fontWeight: 500 }}>{c.cashier_name}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{fmt(c.transactions)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{fmtMoney(c.revenue)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--info)' }}>{fmtMoney(c.bonuses_earned)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--warn)' }}>{fmtMoney(c.bonuses_spent)}</td>
            </tr>
          ))}
          {cashiers.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Нет данных по кассирам</td></tr>
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
  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

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
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Выручка и прибыль</h3>
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
            <XAxis dataKey="name" stroke="#8899aa" tick={{ fontSize: 11 }} />
            <YAxis stroke="#8899aa" tickFormatter={fmtShort} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'transparent' }} />
            <Area type="monotone" dataKey="revenue" stroke="#22c55e" fillOpacity={1} fill="url(#gRevenue)" name="Выручка" strokeWidth={2} />
            <Area type="monotone" dataKey="netProfit" stroke="#3b82f6" fillOpacity={1} fill="url(#gProfit)" name="Чистая прибыль" strokeWidth={2} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Average Receipt */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
        <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Средний чек и количество</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" stroke="#8899aa" tick={{ fontSize: 11 }} />
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


// ═══════════════════════════════════════════
// DAILY — подневная динамика + диапазон дат
// ═══════════════════════════════════════════

const _dateInput: any = { padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, cursor: 'pointer' };
const _thS: any = { padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' };
const _tdS: any = { padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' };

function DailySection({ month }: { month: string }) {
  const lastDay = (m: string) => {
    const [y, mm] = m.split('-').map(Number);
    return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}`;
  };
  const [from, setFrom] = useState(`${month}-01`);
  const [to, setTo] = useState(lastDay(month));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setFrom(`${month}-01`); setTo(lastDay(month)); }, [month]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    financialsAPI.daily({ date_from: from, date_to: to })
      .then((r: any) => { if (!cancel) setData(r.data); })
      .catch(() => { if (!cancel) setData(null); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [from, to]);

  const t = data?.totals;
  const activeDays = (data?.days || []).filter((d: any) => d.revenue > 0 || d.receipts > 0);
  const chartData = activeDays.map((d: any) => ({
    name: d.label,
    'Выручка': Math.round(d.revenue),
    'Чистая': Math.round(d.net_profit),
  }));

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Период:</span>
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={_dateInput} />
        <span style={{ color: 'var(--text3)' }}>—</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} style={_dateInput} />
        {t && <span style={{ color: 'var(--text3)', fontSize: 12 }}>{t.days_count} дн. · активных {t.active_days}</span>}
      </div>

      {loading && (
        <div style={{ color: 'var(--text2)', padding: 40, textAlign: 'center' }}>
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {!loading && t && t.revenue > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
            <KpiCard icon={TrendingUp} label="Выручка за период" value={fmtMoney(t.revenue)} sub={`${t.receipts} чеков · ср/день ${fmtMoney(t.avg_daily_revenue)}`} color="#22c55e" />
            <KpiCard icon={DollarSign} label="Валовая прибыль" value={fmtMoney(t.gross_profit)} color="#3b82f6" />
            <KpiCard icon={Gift} label="Бонусы (списано)" value={fmtMoney(t.bonus_redeemed)} sub={`Начислено: ${fmtMoney(t.bonus_issued)}`} color="#ec4899" />
            <KpiCard icon={BarChart3} label="Чистая прибыль" value={fmtMoney(t.net_profit)} sub={t.best_day ? `Лучший день: ${t.best_day}` : undefined} color={t.net_profit >= 0 ? '#22c55e' : '#ef4444'} />
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 18 }}>
            <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Выручка и прибыль по дням</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#8899aa" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis stroke="#8899aa" tickFormatter={fmtShort} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Выручка" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Чистая" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text2)', textAlign: 'right', background: 'var(--bg3)' }}>
                    <th style={{ ..._thS, textAlign: 'left' }}>Дата</th>
                    <th style={_thS}>Выручка</th>
                    <th style={_thS}>Себест.</th>
                    <th style={_thS}>Валовая</th>
                    <th style={_thS}>Бонусы</th>
                    <th style={_thS}>Чистая</th>
                    <th style={_thS}>Чеков</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map((d: any, i: number) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                      <td style={{ ..._tdS, textAlign: 'left', color: d.weekday >= 5 ? '#f59e0b' : 'var(--text)' }}>{d.date}</td>
                      <td style={_tdS}>{fmtMoney(d.revenue)}</td>
                      <td style={{ ..._tdS, color: 'var(--text3)' }}>{fmtMoney(d.cost_of_goods)}</td>
                      <td style={_tdS}>{fmtMoney(d.gross_profit)}</td>
                      <td style={{ ..._tdS, color: '#ec4899' }}>{fmtMoney(d.bonus_redeemed)}</td>
                      <td style={{ ..._tdS, color: d.net_profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{fmtMoney(d.net_profit)}</td>
                      <td style={{ ..._tdS, color: 'var(--text3)' }}>{d.receipts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && (!t || t.revenue === 0) && (
        <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Нет данных за выбранный период</div>
      )}
    </>
  );
}


// ═══════════════════════════════════════════
// SYNC BADGE — последняя синхронизация из 1С
// ═══════════════════════════════════════════

function SyncBadge() {
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    let stop = false;
    const load = () => financialsAPI.syncStatus().then((r: any) => { if (!stop) setS(r.data); }).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  if (!s) return null;
  const m: number | null = s.minutes_ago;
  const label = m == null ? 'нет данных'
    : m < 1 ? 'только что'
    : m < 60 ? `${m} мин назад`
    : m < 1440 ? `${Math.floor(m / 60)} ч назад`
    : `${Math.floor(m / 1440)} дн назад`;
  const color = m == null ? '#8899aa' : m <= 30 ? '#22c55e' : m <= 1440 ? '#f59e0b' : '#ef4444';
  const at = s.last_sync ? new Date(s.last_sync).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div title={`Последние данные из 1С: ${at}`} style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px',
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
      fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
      <span>1С: {label}</span>
    </div>
  );
}


// ═══════════════════════════════════════════
// CHANGE PIN — смена PIN-кода (только супер-админ)
// ═══════════════════════════════════════════

function ChangePinModal({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [cf, setCf] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  const save = async () => {
    setMsg(null);
    if (np.length < 4) { setMsg({ ok: false, text: 'Новый PIN — минимум 4 цифры' }); return; }
    if (np !== cf) { setMsg({ ok: false, text: 'PIN-коды не совпадают' }); return; }
    setSaving(true);
    try {
      await financialsAPI.setPin(np, cur || undefined);
      setMsg({ ok: true, text: 'PIN изменён' });
      setTimeout(onClose, 900);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || 'Ошибка смены PIN' });
    } finally {
      setSaving(false);
    }
  };

  const inp: any = {
    width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text)', fontSize: 16, letterSpacing: 4, textAlign: 'center',
    marginBottom: 12, boxSizing: 'border-box',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 24, width: '100%', maxWidth: 360,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 17, fontWeight: 700, margin: 0 }}>Сменить PIN</h3>
          <button onClick={onClose} aria-label="Закрыть" style={{ background: 'transparent', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        <input type="password" inputMode="numeric" autoFocus placeholder="Текущий PIN"
          value={cur} onChange={e => setCur(onlyDigits(e.target.value))} style={inp} />
        <input type="password" inputMode="numeric" placeholder="Новый PIN (4–6 цифр)"
          value={np} onChange={e => setNp(onlyDigits(e.target.value))} style={inp} />
        <input type="password" inputMode="numeric" placeholder="Повторите новый PIN"
          value={cf} onChange={e => setCf(onlyDigits(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') save(); }} style={inp} />
        {msg && (
          <div style={{ fontSize: 13, textAlign: 'center', margin: '4px 0 12px', color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>
            {msg.text}
          </div>
        )}
        <button onClick={save} disabled={saving} style={{
          width: '100%', padding: 13, background: 'var(--accent)', border: 'none', borderRadius: 10,
          color: 'var(--on-accent)', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <p style={{ color: 'var(--text3)', fontSize: 11.5, textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
          Менять PIN может только супер-админ. Если PIN ещё не задан — оставьте «Текущий PIN» пустым.
        </p>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════
// CASH — касса: остаток + движения наличных (1С)
// ═══════════════════════════════════════════

function CashSection({ month }: { month: string }) {
  const lastDay = (m: string) => {
    const [y, mm] = m.split('-').map(Number);
    return `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}`;
  };
  const [from, setFrom] = useState(`${month}-01`);
  const [to, setTo] = useState(lastDay(month));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setFrom(`${month}-01`); setTo(lastDay(month)); }, [month]);
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    financialsAPI.cash({ date_from: from, date_to: to })
      .then((r: any) => { if (!cancel) setData(r.data); })
      .catch(() => { if (!cancel) setData(null); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [from, to]);

  if (loading) return <div style={{ color: 'var(--text2)', padding: 40, textAlign: 'center' }}><Loader2 size={24} className="animate-spin" /></div>;
  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Ошибка загрузки</div>;
  if (!data.initialized) return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
      <Banknote size={32} color="#8899aa" style={{ marginBottom: 12 }} />
      <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>Касса ещё не настроена</div>
      <div style={{ color: 'var(--text2)', fontSize: 13 }}>Создайте таблицу cash_operations и включите выгрузку кассы из 1С.</div>
    </div>
  );

  const balance = data.balance?.amount ?? data.computed_balance;
  const balLabel = data.balance?.amount != null ? 'остаток из 1С' : 'расчётный остаток';
  const chartData = (data.daily || []).map((d: any) => ({ name: d.label, 'Приход': Math.round(d.cash_in), 'Расход': Math.round(d.cash_out) }));

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Период:</span>
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={_dateInput} />
        <span style={{ color: 'var(--text3)' }}>—</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} style={_dateInput} />
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 22px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(34,197,94,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Banknote size={26} color="#22c55e" />
        </div>
        <div>
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>Остаток наличных в кассе</div>
          <div style={{ color: 'var(--text)', fontSize: 28, fontWeight: 700 }}>{fmtMoney(balance || 0)}</div>
          <div style={{ color: 'var(--text3)', fontSize: 11 }}>{balLabel}{data.balance?.at ? ` · ${new Date(data.balance.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        <KpiCard icon={ArrowDownRight} label="Приход за период" value={fmtMoney(data.cash_in)} color="#22c55e" />
        <KpiCard icon={ArrowUpRight} label="Расход за период" value={fmtMoney(data.cash_out)} color="#f59e0b" />
        <KpiCard icon={TrendingUp} label="Чистый поток" value={fmtMoney(data.net_flow)} sub={`${data.operations_count} операций`} color={data.net_flow >= 0 ? '#22c55e' : '#ef4444'} />
      </div>

      {chartData.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 18 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Движение наличных по дням</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#8899aa" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke="#8899aa" tickFormatter={fmtShort} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Приход" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Расход" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text2)', textAlign: 'right', background: 'var(--bg3)' }}>
                <th style={{ ..._thS, textAlign: 'left' }}>Дата</th>
                <th style={{ ..._thS, textAlign: 'left' }}>Тип</th>
                <th style={{ ..._thS, textAlign: 'left' }}>Категория</th>
                <th style={_thS}>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {(data.operations || []).map((o: any, i: number) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                  <td style={{ ..._tdS, textAlign: 'left', color: 'var(--text2)' }}>{o.date}</td>
                  <td style={{ ..._tdS, textAlign: 'left', color: o.direction === 'in' ? 'var(--success)' : 'var(--danger)' }}>{o.direction === 'in' ? 'Приход' : 'Расход'}</td>
                  <td style={{ ..._tdS, textAlign: 'left' }}>{o.category || o.description || '—'}</td>
                  <td style={{ ..._tdS, color: o.direction === 'in' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{o.direction === 'in' ? '+' : '−'}{fmtMoney(o.amount)}</td>
                </tr>
              ))}
              {(!data.operations || data.operations.length === 0) && (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Нет операций за период</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// SUPPLIERS SECTION — Аналитика поставщиков
// ═══════════════════════════════════════════

const SUPPLIER_COLORS = [
  '#FFE600', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899',
  '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16', '#f97316',
];

function SuppliersSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(90);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await productAPI.suppliers(days);
      setData(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text2)' }}>
      <Loader2 size={28} className="animate-spin" style={{ marginRight: 10 }} /> Загрузка поставщиков...
    </div>
  );
  if (error) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--danger)' }}>
      {error}
      <button onClick={load} style={{ marginTop: 12, padding: '8px 20px', background: 'var(--border)', border: 'none', borderRadius: 10, color: 'var(--text)', cursor: 'pointer', display: 'block', margin: '12px auto 0' }}>
        Повторить
      </button>
    </div>
  );
  if (!data) return null;

  const { summary, suppliers: allSuppliers } = data;

  const filtered = (allSuppliers || []).filter((s: any) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  // Chart data — top 8 by sold_amount
  const chartData = [...(allSuppliers || [])]
    .filter((s: any) => s.sold_amount > 0)
    .slice(0, 8)
    .map((s: any) => ({
      name: s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name,
      fullName: s.name,
      sold: Math.round(s.sold_amount),
      stock: Math.round(s.stock_value),
      margin: s.margin_pct,
    }));

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon={Truck} label="Поставщиков" value={summary.total_suppliers} color="#FFE600" />
        <KpiCard icon={Package} label="Товаров" value={summary.total_products} color="#3b82f6" />
        <KpiCard icon={TrendingUp} label={`Продажи (${days}д)`} value={fmtMoney(summary.total_sold_amount)} color="#22c55e" />
        <KpiCard icon={Wallet} label="Остатки (сом)" value={fmtMoney(summary.total_stock_value)} color="#f59e0b" />
        {summary.avg_margin_pct !== null && (
          <KpiCard icon={DollarSign} label="Средняя маржа" value={`${summary.avg_margin_pct}%`}
            color={summary.avg_margin_pct >= 20 ? '#22c55e' : summary.avg_margin_pct >= 10 ? '#f59e0b' : '#ef4444'} />
        )}
        {summary.total_low_stock > 0 && (
          <KpiCard icon={AlertTriangle} label="Мало остатков" value={summary.total_low_stock} color="#ef4444" />
        )}
      </div>

      {/* Bar Chart — top suppliers by sales */}
      {chartData.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, margin: 0 }}>
              Топ поставщиков по продажам (топ 8)
            </h3>
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>За {days} дней</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#8899aa" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
              <YAxis stroke="#8899aa" tickFormatter={fmtShort} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name: string) => [fmtMoney(v), name]}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Bar dataKey="sold" fill="#22c55e" radius={[4, 4, 0, 0]} name="Продажи" />
              <Bar dataKey="stock" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Остаток" />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="🔍 Поиск поставщика..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, padding: '9px 14px',
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, color: 'var(--text)', fontSize: 13,
          }}
        />
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{
          padding: '9px 14px', background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 10, color: 'var(--text)', fontSize: 13, cursor: 'pointer',
        }}>
          <option value={30}>30 дней</option>
          <option value={60}>60 дней</option>
          <option value={90}>90 дней</option>
          <option value={180}>180 дней</option>
          <option value={365}>365 дней</option>
        </select>
        <button onClick={load} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          background: 'var(--border)', border: '1px solid var(--bg3)',
          borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 13,
        }}>
          <RefreshCw size={13} /> Обновить
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 70px 140px 140px 80px 90px 70px',
          gap: 0, padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg3)',
        }}>
          {['Поставщик', 'Товаров', 'Остаток', `Продажи (${days}д)`, 'Маржа', 'Остатки', 'ABC'].map((h, i) => (
            <div key={i} style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i > 0 ? 'right' : 'left' }}>
              {h}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>Нет поставщиков</div>
        )}

        {filtered.map((sup: any, idx: number) => {
          const isExpanded = expanded === sup.name;
          const accentColor = SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length];
          const stockAlert = sup.out_of_stock_count > 0 ? 'critical' : sup.low_stock_count > 0 ? 'warn' : 'ok';

          return (
            <div key={sup.name} style={{ borderBottom: '1px solid var(--border)' }}>
              {/* Row */}
              <div
                onClick={() => setExpanded(isExpanded ? null : sup.name)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 70px 140px 140px 80px 90px 70px',
                  gap: 0, padding: '14px 16px',
                  cursor: 'pointer', alignItems: 'center',
                  transition: 'background 0.15s',
                  background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent')}
              >
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isExpanded ? <ChevronDown size={14} color="var(--text2)" /> : <ChevronRight size={14} color="var(--text2)" />}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0,
                  }} />
                  <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{sup.name}</span>
                  {sup.top_categories?.[0] && (
                    <span style={{ color: 'var(--text2)', fontSize: 11, background: 'var(--bg3)', padding: '2px 6px', borderRadius: 6 }}>
                      {sup.top_categories[0].name}
                    </span>
                  )}
                </div>
                {/* Product count */}
                <div style={{ textAlign: 'right', color: 'var(--text)', fontSize: 13 }}>{sup.product_count}</div>
                {/* Stock value */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{fmtMoney(sup.stock_value)}</div>
                  {sup.cost_value > 0 && (
                    <div style={{ color: 'var(--text2)', fontSize: 11 }}>с/с: {fmtMoney(sup.cost_value)}</div>
                  )}
                </div>
                {/* Sold amount */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: sup.sold_amount > 0 ? '#22c55e' : 'var(--text2)', fontSize: 13, fontWeight: 500 }}>
                    {sup.sold_amount > 0 ? fmtMoney(sup.sold_amount) : '—'}
                  </div>
                  {sup.sold_qty > 0 && (
                    <div style={{ color: 'var(--text2)', fontSize: 11 }}>{fmt(Math.round(sup.sold_qty))} шт</div>
                  )}
                </div>
                {/* Margin */}
                <div style={{ textAlign: 'right' }}>
                  {sup.margin_pct !== null ? (
                    <span style={{
                      color: sup.margin_pct >= 20 ? '#22c55e' : sup.margin_pct >= 10 ? '#f59e0b' : '#ef4444',
                      fontSize: 13, fontWeight: 600,
                    }}>
                      {sup.margin_pct}%
                    </span>
                  ) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                </div>
                {/* Stock status */}
                <div style={{ textAlign: 'right' }}>
                  {stockAlert === 'critical' && (
                    <span style={{ color: '#ef4444', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <AlertTriangle size={12} /> {sup.out_of_stock_count} нет
                    </span>
                  )}
                  {stockAlert === 'warn' && (
                    <span style={{ color: '#f59e0b', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <AlertTriangle size={12} /> {sup.low_stock_count} мало
                    </span>
                  )}
                  {stockAlert === 'ok' && <span style={{ color: '#22c55e', fontSize: 12 }}>✓ ОК</span>}
                </div>
                {/* ABC */}
                <div style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {sup.abc.A > 0 && <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 11, padding: '2px 5px', borderRadius: 5, fontWeight: 700 }}>A:{sup.abc.A}</span>}
                  {sup.abc.B > 0 && <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontSize: 11, padding: '2px 5px', borderRadius: 5, fontWeight: 700 }}>B:{sup.abc.B}</span>}
                  {sup.abc.C > 0 && <span style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', fontSize: 11, padding: '2px 5px', borderRadius: 5, fontWeight: 700 }}>C:{sup.abc.C}</span>}
                </div>
              </div>

              {/* Expanded — top products */}
              {isExpanded && sup.top_products?.length > 0 && (
                <div style={{ padding: '0 16px 16px 40px', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Топ товаров
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {sup.top_products.map((p: any, pi: number) => (
                      <div key={pi} style={{
                        display: 'grid', gridTemplateColumns: '2fr 90px 100px 110px 70px',
                        padding: '8px 12px', background: 'var(--bg2)', borderRadius: 10,
                        border: '1px solid var(--border)', alignItems: 'center', gap: 8,
                      }}>
                        <div>
                          <div style={{ color: 'var(--text)', fontSize: 13 }}>{p.name}</div>
                          <div style={{ color: 'var(--text2)', fontSize: 11 }}>{p.sku}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--text2)', fontSize: 11 }}>Цена</div>
                          <div style={{ color: 'var(--text)', fontSize: 13 }}>{fmtMoney(p.price)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--text2)', fontSize: 11 }}>На складе</div>
                          <div style={{
                            color: p.current_stock === 0 ? '#ef4444' : 'var(--text)', fontSize: 13,
                          }}>{fmt(p.current_stock)} шт</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--text2)', fontSize: 11 }}>Продажи</div>
                          <div style={{ color: p.sold_amount > 0 ? '#22c55e' : 'var(--text2)', fontSize: 13 }}>
                            {p.sold_amount > 0 ? fmtMoney(p.sold_amount) : '—'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {p.abc_class && (
                            <span style={{
                              background: p.abc_class === 'A' ? 'rgba(34,197,94,0.15)' : p.abc_class === 'B' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)',
                              color: p.abc_class === 'A' ? '#22c55e' : p.abc_class === 'B' ? '#3b82f6' : '#8b5cf6',
                              padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                            }}>{p.abc_class}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      {filtered.length > 0 && (
        <div style={{ marginTop: 12, color: 'var(--text2)', fontSize: 12, textAlign: 'right' }}>
          Показано {filtered.length} из {allSuppliers?.length || 0} поставщиков · Период: {days} дней
        </div>
      )}
    </div>
  );
}
