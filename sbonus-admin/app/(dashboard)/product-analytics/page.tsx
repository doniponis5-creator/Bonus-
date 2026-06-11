'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { productAPI } from '@/lib/api';
import {
  Package, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  ShoppingCart, BarChart3, RefreshCw, Settings2, ArrowUpDown,
  Search, ChevronDown, DollarSign, Layers, Zap, ShoppingBag,
  Download, Filter, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Treemap,
} from 'recharts';

// ─── Стили ───
const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  fontSize: 13,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  padding: '10px 14px',
};

const fmt = (v: number) => Number(v).toLocaleString('ru-RU');
const fmtMoney = (v: number) => fmt(v) + ' сом';

const ABC_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#f59e0b',
  C: '#ef4444',
};

const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const URGENCY_LABELS: Record<string, string> = {
  critical: 'Критично',
  warning: 'Внимание',
  info: 'Инфо',
};

type Tab = 'overview' | 'low-stock' | 'top-sellers' | 'abc' | 'dead-stock' | 'margins' | 'cross-sell' | 'smart-ai' | 'all-products' | 'settings';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Обзор', icon: BarChart3 },
  { key: 'low-stock', label: 'Остатки', icon: AlertTriangle },
  { key: 'top-sellers', label: 'Топ продаж', icon: TrendingUp },
  { key: 'abc', label: 'ABC анализ', icon: Layers },
  { key: 'dead-stock', label: 'Dead Stock', icon: TrendingDown },
  { key: 'margins', label: 'Маржа', icon: DollarSign },
  { key: 'cross-sell', label: 'Кросс-сейл', icon: ShoppingBag },
  { key: 'smart-ai', label: 'Smart AI', icon: Zap },
  { key: 'all-products', label: 'Товары', icon: Package },
  { key: 'settings', label: 'Настройки', icon: Settings2 },
];

// ─── KPI Card ───
function KpiCard({ icon: Icon, label, value, sub, color = '#FFE600' }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
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
      <div>
        <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Badge ───
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      background: color + '20', color, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 10,
    }}>
      {text}
    </span>
  );
}

// ─── Search Bar ───
function SearchBar({ value, onChange, placeholder = 'Поиск по названию или SKU...' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 12px 9px 36px',
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
          color: 'var(--text)', fontSize: 13, outline: 'none',
        }}
      />
      {value && (
        <button onClick={() => onChange('')} style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2,
        }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Category Select ───
function CategorySelect({ value, onChange, categories }: {
  value: string; onChange: (v: string) => void; categories: string[];
}) {
  if (!categories || categories.length === 0) return null;
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 10, color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none',
      minWidth: 140,
    }}>
      <option value="">Все категории</option>
      {categories.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

// ─── Show More Button ───
function ShowMoreBtn({ shown, total, onClick }: { shown: number; total: number; onClick: () => void }) {
  if (shown >= total) return null;
  return (
    <div style={{ textAlign: 'center', padding: 16 }}>
      <button onClick={onClick} style={{
        padding: '8px 24px', background: 'var(--border)', border: '1px solid var(--bg3)',
        borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 13,
      }}>
        Показать ещё ({total - shown} осталось)
      </button>
    </div>
  );
}

// ─── Export CSV ───
function exportCSV(headers: string[], rows: string[][], filename: string) {
  const bom = '﻿';
  const csv = bom + [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 50;

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function ProductAnalyticsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Data states
  const [summary, setSummary] = useState<any>(null);
  const [lowStock, setLowStock] = useState<any>(null);
  const [topSellers, setTopSellers] = useState<any>(null);
  const [abc, setAbc] = useState<any>(null);
  const [deadStock, setDeadStock] = useState<any>(null);
  const [margins, setMargins] = useState<any>(null);
  const [crossSell, setCrossSell] = useState<any>(null);
  const [allProducts, setAllProducts] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [smartAI, setSmartAI] = useState<any>(null);

  const [period, setPeriod] = useState(30);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sumRes, lsRes] = await Promise.all([
        productAPI.summary(),
        productAPI.lowStock(),
      ]);
      setSummary(sumRes.data);
      setLowStock(lsRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Lazy load tab data
  useEffect(() => {
    const loadTab = async () => {
      try {
        if (tab === 'top-sellers' && !topSellers) {
          const r = await productAPI.topSellers(period);
          setTopSellers(r.data);
        }
        if (tab === 'abc' && !abc) {
          const r = await productAPI.abc(90);
          setAbc(r.data);
        }
        if (tab === 'dead-stock' && !deadStock) {
          const r = await productAPI.deadStock(30);
          setDeadStock(r.data);
        }
        if (tab === 'margins' && !margins) {
          const r = await productAPI.margins(period);
          setMargins(r.data);
        }
        if (tab === 'cross-sell' && !crossSell) {
          const r = await productAPI.frequentlyBought(90);
          setCrossSell(r.data);
        }
        if (tab === 'smart-ai' && !smartAI) {
          const r = await productAPI.smartRecommendations(90);
          setSmartAI(r.data);
        }
        if (tab === 'all-products' && !allProducts) {
          const r = await productAPI.products({ limit: 10000 });
          setAllProducts(r.data);
        }
        if (tab === 'settings' && !settings) {
          const r = await productAPI.settings();
          setSettings(r.data);
        }
      } catch {}
    };
    loadTab();
  }, [tab, period, topSellers, abc, deadStock, margins, crossSell, smartAI, allProducts, settings]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
        <Loader2 size={32} className="animate-spin" style={{ marginRight: 12 }} />
        Загрузка товарной аналитики...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--danger)' }}>
        <AlertTriangle size={40} style={{ marginBottom: 12 }} />
        <div>{error}</div>
        <button onClick={loadData} style={{
          marginTop: 16, padding: '8px 20px', background: 'var(--border)', border: 'none',
          borderRadius: 10, color: 'var(--text)', cursor: 'pointer',
        }}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="page-root" style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Package size={28} color="#FFE600" />
          <h1 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 700, margin: 0 }}>
            Товарная аналитика
          </h1>
        </div>
        <button onClick={loadData} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: 'var(--border)', border: '1px solid var(--bg3)',
          borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 13,
        }}>
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      {/* Tabs */}
      <div className="mobile-tab-bar" style={{
        display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto',
        background: 'var(--bg2)', borderRadius: 10, padding: 4,
        border: '1px solid var(--border)',
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', border: 'none', borderRadius: 10,
              background: tab === t.key ? 'var(--border)' : 'transparent',
              color: tab === t.key ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab summary={summary} lowStock={lowStock} />}
      {tab === 'low-stock' && <LowStockTab data={lowStock} />}
      {tab === 'top-sellers' && <TopSellersTab data={topSellers} period={period} setPeriod={setPeriod} reload={async (d: number) => {
        const r = await productAPI.topSellers(d); setTopSellers(r.data);
      }} />}
      {tab === 'abc' && <AbcTab data={abc} onRecalculate={async () => {
        await productAPI.recalculateAbc(90);
        const r = await productAPI.abc(90); setAbc(r.data);
      }} />}
      {tab === 'dead-stock' && <DeadStockTab data={deadStock} />}
      {tab === 'margins' && <MarginsTab data={margins} />}
      {tab === 'cross-sell' && <CrossSellTab data={crossSell} />}
      {tab === 'smart-ai' && <SmartAITab data={smartAI} reload={async () => {
        const r = await productAPI.smartRecommendations(90); setSmartAI(r.data);
      }} />}
      {tab === 'all-products' && <AllProductsTab data={allProducts} />}
      {tab === 'settings' && <SettingsTab data={settings} onSave={async (params: any) => {
        await productAPI.updateSettings(params);
        const r = await productAPI.settings(); setSettings(r.data);
      }} />}
    </div>
  );
}


// ═══════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════

function OverviewTab({ summary, lowStock }: { summary: any; lowStock: any }) {
  if (!summary) return null;

  const abcData = [
    { name: 'A — Лидеры', value: summary.abc_a_count, fill: ABC_COLORS.A },
    { name: 'B — Средние', value: summary.abc_b_count, fill: ABC_COLORS.B },
    { name: 'C — Аутсайдеры', value: summary.abc_c_count, fill: ABC_COLORS.C },
  ].filter(d => d.value > 0);

  // Круговая диаграмма: только реальные товары (исключая старые из 1С)
  const realTotal = summary.real_products || summary.active_products;
  const inStockCount = Math.max(0, realTotal - summary.low_stock_count - summary.out_of_stock_count);
  const stockData = [
    { name: 'В наличии', value: inStockCount, fill: '#22c55e' },
    { name: 'Мало', value: summary.low_stock_count, fill: '#f59e0b' },
    { name: 'Нет в наличии', value: summary.out_of_stock_count, fill: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon={Package} label="Всего товаров" value={fmt(summary.active_products)} sub={`Продавались: ${summary.real_products || 0} · Только 1С: ${summary.from_1c_only || 0}`} />
        <KpiCard icon={AlertTriangle} label="Мало на складе" value={summary.low_stock_count} sub={`Закончились: ${summary.out_of_stock_count}`} color="#f59e0b" />
        <KpiCard icon={TrendingDown} label="Dead Stock" value={summary.dead_stock_count} sub="Нет продаж 30+ дней" color="#ef4444" />
        <KpiCard icon={DollarSign} label="Стоимость склада" value={fmtMoney(summary.total_inventory_value)} sub={summary.total_cost_value ? `Себестоимость: ${fmtMoney(summary.total_cost_value)}` : undefined} color="#22c55e" />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Stock Status Pie */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Статус остатков</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={stockData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3} strokeWidth={0}>
                {stockData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'transparent' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text2)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* ABC Pie */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>ABC классификация</h3>
          {abcData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={abcData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {abcData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'transparent' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text2)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
              Нажмите "Пересчитать ABC" в разделе ABC анализ
            </div>
          )}
        </div>
      </div>

      {/* Critical Alerts Preview */}
      {lowStock && lowStock.critical > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 16, padding: 20 }}>
          <h3 style={{ color: 'var(--danger)', fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} /> Критические алерты ({lowStock.critical})
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {lowStock.alerts.filter((a: any) => a.urgency === 'critical').slice(0, 5).map((a: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: '10px 14px',
              }}>
                <div>
                  <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{a.name}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 8 }}>{a.sku}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>
                    Остаток: {a.current_stock} {a.current_stock <= 0 ? '(нет!)' : ''}
                  </span>
                  <span style={{ color: 'var(--text2)', fontSize: 11 }}>
                    Заказать: {a.recommended_order}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}


// ═══════════════════════════════════════════
// LOW STOCK TAB
// ═══════════════════════════════════════════

function LowStockTab({ data }: { data: any }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [urgFilter, setUrgFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    let items = data?.alerts || [];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
    }
    if (catFilter) items = items.filter((a: any) => a.category === catFilter);
    if (urgFilter) items = items.filter((a: any) => a.urgency === urgFilter);
    return items;
  }, [data?.alerts, search, catFilter, urgFilter]);

  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const visible = filtered.slice(0, visibleCount);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard icon={AlertTriangle} label="Всего алертов" value={data.total_alerts} color="#f59e0b" />
        <KpiCard icon={Zap} label="Критичные" value={data.critical} color="#ef4444" />
        <KpiCard icon={AlertTriangle} label="Предупреждения" value={data.warning} color="#f59e0b" />
      </div>

      {/* Search + Filters + Export */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setVisibleCount(PAGE_SIZE); }} />
        <CategorySelect value={catFilter} onChange={v => { setCatFilter(v); setVisibleCount(PAGE_SIZE); }} categories={data.categories || []} />
        <select value={urgFilter} onChange={e => { setUrgFilter(e.target.value); setVisibleCount(PAGE_SIZE); }} style={{
          padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 10, color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none',
        }}>
          <option value="">Все статусы</option>
          <option value="critical">Критичные</option>
          <option value="warning">Предупреждения</option>
        </select>
        <button onClick={() => exportCSV(
          ['Статус', 'Товар', 'SKU', 'Категория', 'Остаток', 'Минимум', 'Продажи/день', 'Дней до 0', 'Заказать'],
          filtered.map((a: any) => [URGENCY_LABELS[a.urgency], a.name, a.sku, a.category || '', a.current_stock, a.min_stock_level, a.avg_daily_sales, a.days_until_stockout ?? '—', a.recommended_order]),
          'low-stock-alerts.csv'
        )} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px',
          background: 'var(--border)', border: '1px solid var(--bg3)', borderRadius: 10,
          color: 'var(--text)', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel
        </button>
        {(search || catFilter || urgFilter) && (
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Найдено: {filtered.length}</span>
        )}
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Статус</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Остаток</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Минимум</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Продажи/день</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Дней до 0</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Заказать</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <Badge text={URGENCY_LABELS[a.urgency]} color={URGENCY_COLORS[a.urgency]} />
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>{a.name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>{a.sku} {a.category ? `• ${a.category}` : ''}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: a.current_stock <= 0 ? 'var(--danger)' : 'var(--warn)', fontWeight: 600 }}>
                  {a.current_stock}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text2)' }}>{a.min_stock_level}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{a.avg_daily_sales}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: a.days_until_stockout !== null && a.days_until_stockout <= 3 ? 'var(--danger)' : 'var(--text)', fontWeight: 600 }}>
                  {a.days_until_stockout !== null ? `${a.days_until_stockout} дн` : '—'}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{a.recommended_order}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--success)' }}>
            {search || catFilter || urgFilter ? 'Ничего не найдено' : 'Все товары в норме!'}
          </div>
        )}
        <ShowMoreBtn shown={visible.length} total={filtered.length} onClick={() => setVisibleCount(v => v + PAGE_SIZE)} />
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// TOP SELLERS TAB
// ═══════════════════════════════════════════

function TopSellersTab({ data, period, setPeriod, reload }: { data: any; period: number; setPeriod: (d: number) => void; reload: (d: number) => void }) {
  const [search, setSearch] = useState('');

  const allSellers = data?.top_sellers || [];
  const filtered = useMemo(() => {
    if (!search) return allSellers;
    const s = search.toLowerCase();
    return allSellers.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
  }, [allSellers, search]);

  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const chartData = allSellers.slice(0, 10).map((s: any) => ({
    name: s.name.length > 30 ? s.name.slice(0, 28) + '…' : s.name,
    revenue: Math.round(s.total_revenue),
    sold: Math.round(s.total_sold),
  })) || [];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => { setPeriod(d); reload(d); }} style={{
            padding: '6px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: period === d ? 'var(--accent)' : 'var(--border)',
            color: period === d ? 'var(--bg2)' : 'var(--text2)', fontSize: 13, fontWeight: 500,
          }}>
            {d} дней
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {chartData.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Топ-10 по выручке</h3>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#8899aa" tickFormatter={(v: number) => fmt(v)} />
              <YAxis type="category" dataKey="name" stroke="#8899aa" width={160} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="revenue" radius={[0, 6, 6, 0]} name="Выручка" label={{ position: 'right', fill: '#FFE600', fontSize: 11, formatter: (v: number) => fmt(v) }}>
                {chartData.map((_: any, i: number) => <Cell key={i} fill={`hsl(${50 - i * 3}, 100%, ${55 - i * 2}%)`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>#</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Продано</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Выручка</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>В день</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Остаток</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Дней до 0</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                <td style={{ padding: '10px 16px', color: 'var(--accent)', fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>{s.name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>{s.sku} {s.category ? `• ${s.category}` : ''}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{fmt(s.total_sold)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{fmtMoney(s.total_revenue)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{s.avg_daily_sales}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: s.current_stock <= 5 ? 'var(--danger)' : 'var(--text)' }}>{s.current_stock}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: s.days_until_stockout !== null && s.days_until_stockout <= 7 ? 'var(--danger)' : 'var(--text)', fontWeight: 600 }}>
                  {s.days_until_stockout !== null ? `${s.days_until_stockout} дн` : '∞'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// ABC TAB
// ═══════════════════════════════════════════

function AbcTab({ data, onRecalculate }: { data: any; onRecalculate: () => void }) {
  const [recalculating, setRecalculating] = useState(false);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const allItems = data?.items || [];
  const filtered = useMemo(() => {
    let items = allItems;
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
    }
    if (classFilter) items = items.filter((a: any) => a.abc_class === classFilter);
    return items;
  }, [allItems, search, classFilter]);

  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const visible = filtered.slice(0, visibleCount);

  const summaryData = data.summary ? [
    { name: 'A — 80% выручки', count: data.summary.A?.count || 0, revenue: data.summary.A?.revenue || 0, fill: ABC_COLORS.A },
    { name: 'B — 15% выручки', count: data.summary.B?.count || 0, revenue: data.summary.B?.revenue || 0, fill: ABC_COLORS.B },
    { name: 'C — 5% выручки', count: data.summary.C?.count || 0, revenue: data.summary.C?.revenue || 0, fill: ABC_COLORS.C },
  ] : [];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>
          Период: {data.period_days} дней | Общая выручка: {fmtMoney(data.total_revenue)}
        </div>
        <button onClick={async () => {
          setRecalculating(true);
          await onRecalculate();
          setRecalculating(false);
        }} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: 'rgba(34,197,94,0.13)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 10, color: 'var(--success)', cursor: 'pointer', fontSize: 13,
        }}>
          {recalculating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Пересчитать ABC
        </button>
      </div>

      {/* Summary Cards */}
      {summaryData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {summaryData.map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg2)', border: `1px solid ${s.fill}30`, borderRadius: 16, padding: 18,
              borderLeft: `4px solid ${s.fill}`,
            }}>
              <div style={{ color: s.fill, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{s.name}</div>
              <div style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700 }}>{s.count} товаров</div>
              <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>Выручка: {fmtMoney(s.revenue)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setVisibleCount(PAGE_SIZE); }} />
        <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setVisibleCount(PAGE_SIZE); }} style={{
          padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 10, color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none',
        }}>
          <option value="">Все классы</option>
          <option value="A">A — Лидеры</option>
          <option value="B">B — Средние</option>
          <option value="C">C — Аутсайдеры</option>
        </select>
        <button onClick={() => exportCSV(
          ['Класс', 'Товар', 'SKU', 'Выручка', '% от общей', 'Накопительный %'],
          filtered.map((a: any) => [a.abc_class, a.name, a.sku, a.revenue, a.revenue_percent, a.cumulative_percent]),
          'abc-analysis.csv'
        )} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px',
          background: 'var(--border)', border: '1px solid var(--bg3)', borderRadius: 10,
          color: 'var(--text)', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel
        </button>
        {(search || classFilter) && (
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Найдено: {filtered.length}</span>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Класс</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Выручка</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>% от общей</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Накопительный %</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <Badge text={item.abc_class} color={ABC_COLORS[item.abc_class] || '#8899aa'} />
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>{item.name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>{item.sku}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{fmtMoney(item.revenue)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{item.revenue_percent}%</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text2)' }}>{item.cumulative_percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            {search || classFilter ? 'Ничего не найдено' : 'Нет данных для ABC-анализа'}
          </div>
        )}
        <ShowMoreBtn shown={visible.length} total={filtered.length} onClick={() => setVisibleCount(v => v + PAGE_SIZE)} />
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// DEAD STOCK TAB
// ═══════════════════════════════════════════

function DeadStockTab({ data }: { data: any }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    let items = data?.items || [];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
    }
    if (catFilter) items = items.filter((a: any) => a.category === catFilter);
    return items;
  }, [data?.items, search, catFilter]);

  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const visible = filtered.slice(0, visibleCount);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard icon={TrendingDown} label="Dead Stock товаров" value={data.total_dead_stock} color="#ef4444" />
        <KpiCard icon={DollarSign} label="Замороженный капитал" value={fmtMoney(data.total_frozen_capital)} sub="Деньги, которые лежат без дела" color="#f59e0b" />
      </div>

      {/* Search + Filters + Export */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setVisibleCount(PAGE_SIZE); }} />
        <CategorySelect value={catFilter} onChange={v => { setCatFilter(v); setVisibleCount(PAGE_SIZE); }} categories={data.categories || []} />
        <button onClick={() => exportCSV(
          ['Товар', 'SKU', 'Категория', 'Остаток', 'Цена', 'Заморожено', 'Без продаж (дн)', 'Посл. продажа'],
          filtered.map((a: any) => [a.name, a.sku, a.category || '', a.current_stock, a.price, a.frozen_capital, a.days_without_sale, a.last_sold_at || '—']),
          'dead-stock.csv'
        )} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px',
          background: 'var(--border)', border: '1px solid var(--bg3)', borderRadius: 10,
          color: 'var(--text)', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel
        </button>
        {(search || catFilter) && (
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>Найдено: {filtered.length}</span>
        )}
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Остаток</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Цена</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Заморожено</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Без продаж</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>{item.name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>{item.sku} {item.category ? `• ${item.category}` : ''}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{item.current_stock}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text2)' }}>{fmtMoney(item.price)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--warn)', fontWeight: 600 }}>{fmtMoney(item.frozen_capital)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{item.days_without_sale} дн</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--success)' }}>
            {search || catFilter ? 'Ничего не найдено' : 'Dead Stock нет — отлично!'}
          </div>
        )}
        <ShowMoreBtn shown={visible.length} total={filtered.length} onClick={() => setVisibleCount(v => v + PAGE_SIZE)} />
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// MARGINS TAB
// ═══════════════════════════════════════════

function MarginsTab({ data }: { data: any }) {
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const allItems = data?.items || [];
  const filtered = useMemo(() => {
    if (!search) return allItems;
    const s = search.toLowerCase();
    return allItems.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
  }, [allItems, search]);

  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const visible = filtered.slice(0, visibleCount);

  const chartData = (data.items || []).slice(0, 10).map((m: any) => ({
    name: m.name.length > 30 ? m.name.slice(0, 28) + '…' : m.name,
    margin: m.margin_percent,
    profit: Math.round(m.total_profit),
  }));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard icon={DollarSign} label="Общая выручка" value={fmtMoney(data.total_revenue)} color="#22c55e" />
        <KpiCard icon={TrendingUp} label="Общая прибыль" value={fmtMoney(data.total_profit)} color="#FFE600" />
        <KpiCard icon={BarChart3} label="Средняя маржа" value={`${data.avg_margin_percent}%`} color="#3b82f6" />
      </div>

      {chartData.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Маржа по товарам, %</h3>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#8899aa" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <YAxis type="category" dataKey="name" stroke="#8899aa" width={160} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => name === 'margin' ? `${v}%` : fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="margin" radius={[0, 6, 6, 0]} name="Маржа %" label={{ position: 'right', fill: '#22c55e', fontSize: 11, formatter: (v: number) => `${v}%` }}>
                {chartData.map((_: any, i: number) => <Cell key={i} fill={`hsl(${150 - i * 4}, ${70 - i * 2}%, ${50 - i * 2}%)`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Search + Export */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setVisibleCount(PAGE_SIZE); }} />
        <button onClick={() => exportCSV(
          ['Товар', 'SKU', 'Цена', 'Себестоимость', 'Продано', 'Выручка', 'Прибыль', 'Маржа %'],
          filtered.map((m: any) => [m.name, m.sku, m.price, m.cost_price, m.total_sold, m.total_revenue, m.total_profit, m.margin_percent]),
          'margins.csv'
        )} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px',
          background: 'var(--border)', border: '1px solid var(--bg3)', borderRadius: 10,
          color: 'var(--text)', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel
        </button>
        {search && <span style={{ color: 'var(--text2)', fontSize: 12 }}>Найдено: {filtered.length}</span>}
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Цена</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Себестоимость</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Продано</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Выручка</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Прибыль</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Маржа</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>{m.name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>{m.sku}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{fmtMoney(m.price)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text2)' }}>{fmtMoney(m.cost_price)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{fmt(m.total_sold)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{fmtMoney(m.total_revenue)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{fmtMoney(m.total_profit)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <Badge text={`${m.margin_percent}%`} color={m.margin_percent >= 30 ? '#22c55e' : m.margin_percent >= 15 ? '#f59e0b' : '#ef4444'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            {search ? 'Ничего не найдено' : 'Нет данных о маржинальности'}
          </div>
        )}
        <ShowMoreBtn shown={visible.length} total={filtered.length} onClick={() => setVisibleCount(v => v + PAGE_SIZE)} />
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// CROSS-SELL TAB
// ═══════════════════════════════════════════

function CrossSellTab({ data }: { data: any }) {
  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  return (
    <>
      <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
        Период: {data.period_days} дней | Всего чеков: {fmt(data.total_receipts)}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {(data.pairs || []).map((p: any, i: number) => (
          <div key={i} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
            padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 700 }}>#{i + 1}</div>
              <div>
                <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>
                  {p.product_a_name} <span style={{ color: 'var(--text3)', margin: '0 6px' }}>+</span> {p.product_b_name}
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>
                  {p.product_a_sku} + {p.product_b_sku}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--success)', fontSize: 18, fontWeight: 700 }}>{p.times_bought_together}</div>
                <div style={{ color: 'var(--text3)', fontSize: 10 }}>раз вместе</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--info)', fontSize: 14, fontWeight: 600 }}>{(p.confidence * 100).toFixed(1)}%</div>
                <div style={{ color: 'var(--text3)', fontSize: 10 }}>от всех чеков</div>
              </div>
            </div>
          </div>
        ))}
        {(data.pairs || []).length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 16 }}>
            Недостаточно данных. Нужно больше чеков с несколькими товарами.
          </div>
        )}
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// ALL PRODUCTS TAB
// ═══════════════════════════════════════════

function AllProductsTab({ data }: { data: any }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price' | 'cost'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const categories = useMemo(() => {
    if (!data?.categories) return [];
    return data.categories.map((c: any) => c.name);
  }, [data?.categories]);

  // Smart search: multi-word, searches name + SKU + category + supplier
  const filtered = useMemo(() => {
    if (!data?.products) return [];
    let items = [...data.products];

    if (search) {
      const q = search.trim().toLowerCase();

      // Exact match: if name or SKU matches exactly → return only that one
      const exact = items.filter((p: any) =>
        p.name?.toLowerCase() === q || p.sku?.toLowerCase() === q
      );
      if (exact.length > 0) {
        items = exact;
      } else {
        // Smart multi-word search
        const words = q.split(/\s+/).filter(Boolean);
        items = items.filter((p: any) => {
          const haystack = [p.name, p.sku, p.category, p.supplier, p.abc_class]
            .filter(Boolean).join(' ').toLowerCase();
          return words.every(w => haystack.includes(w));
        });
        // Rank: exact name/SKU start → name contains → rest
        items.sort((a: any, b: any) => {
          const aName = (a.name || '').toLowerCase();
          const bName = (b.name || '').toLowerCase();
          const aSku = (a.sku || '').toLowerCase();
          const bSku = (b.sku || '').toLowerCase();
          const aExact = aName === q || aSku === q ? 0 : aName.startsWith(q) || aSku.endsWith(q) ? 1 : 2;
          const bExact = bName === q || bSku === q ? 0 : bName.startsWith(q) || bSku.endsWith(q) ? 1 : 2;
          return aExact - bExact;
        });
      }
    }
    if (category) {
      items = items.filter((p: any) => p.category === category);
    }

    items.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '', 'ru');
      else if (sortBy === 'stock') cmp = (a.current_stock || 0) - (b.current_stock || 0);
      else if (sortBy === 'price') cmp = (a.price || 0) - (b.price || 0);
      else if (sortBy === 'cost') cmp = (a.cost_price || 0) - (b.cost_price || 0);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return items;
  }, [data?.products, search, category, sortBy, sortDir]);

  // Totals
  const totals = useMemo(() => {
    if (!filtered.length) return { count: 0, stock: 0, value: 0, costValue: 0 };
    let stock = 0, value = 0, costValue = 0;
    for (const p of filtered) {
      stock += (p.current_stock || 0);
      value += (p.price || 0) * (p.current_stock || 0);
      costValue += (p.cost_price || 0) * (p.current_stock || 0);
    }
    return { count: filtered.length, stock, value, costValue };
  }, [filtered]);

  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const visible = filtered.slice(0, visibleCount);

  const toggleSort = (col: 'name' | 'stock' | 'price' | 'cost') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const handleExport = () => {
    const headers = ['№', 'Название', 'SKU', 'Категория', 'Остаток (шт)', 'Цена (сом)', 'Себестоимость (сом)', 'ABC'];
    const rows = filtered.map((p: any, i: number) => [
      String(i + 1),
      p.name || '',
      p.sku || '',
      p.category || '',
      String(p.current_stock ?? 0),
      String(p.price ?? 0),
      String(p.cost_price ?? ''),
      p.abc_class || '',
    ]);
    exportCSV(headers, rows, 'products_export.csv');
  };

  const sortIcon = (col: string) => {
    if (sortBy !== col) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  return (
    <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard icon={Package} label="Товаров" value={fmt(totals.count)} sub={`из ${data.total}`} color="#3b82f6" />
        <KpiCard icon={Layers} label="Общий остаток" value={fmt(totals.stock) + ' шт'} color="#22c55e" />
        <KpiCard icon={DollarSign} label="Стоимость склада" value={fmtMoney(Math.round(totals.value))} color="#FFE600" />
        <KpiCard icon={TrendingDown} label="Себестоимость склада" value={fmtMoney(Math.round(totals.costValue))} sub={totals.value > 0 ? `маржа ${Math.round(((totals.value - totals.costValue) / totals.value) * 100)}%` : ''} color="#f59e0b" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setVisibleCount(PAGE_SIZE); }} placeholder="Умный поиск: название, SKU, категория..." />
        <CategorySelect value={category} onChange={v => { setCategory(v); setVisibleCount(PAGE_SIZE); }} categories={categories} />
        <button onClick={handleExport} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', background: 'var(--success)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel ({filtered.length})
        </button>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...thStyle, width: 48 }}>№</th>
                <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                  Название {sortIcon('name')}
                </th>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Категория</th>
                <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('stock')}>
                  Остаток (шт) {sortIcon('stock')}
                </th>
                <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('price')}>
                  Цена (сом) {sortIcon('price')}
                </th>
                <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('cost')}>
                  Себестоимость {sortIcon('cost')}
                </th>
                <th style={{ ...thStyle, textAlign: 'center', width: 56 }}>ABC</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
                    {search || category ? 'Ничего не найдено' : 'Нет товаров'}
                  </td>
                </tr>
              )}
              {visible.map((p: any, i: number) => {
                const stockColor = p.current_stock <= 0 ? 'var(--danger)' :
                  (p.min_stock_level > 0 && p.current_stock <= p.min_stock_level) ? 'var(--warn)' : 'var(--text)';
                return (
                  <tr key={p.id} style={{
                    borderBottom: '1px solid rgba(30,41,59,0.5)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(10,15,26,0.35)',
                  }}>
                    <td style={{ ...tdStyle, color: 'var(--text3)' }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 300 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text2)', fontFamily: 'monospace', fontSize: 12 }}>
                      {p.sku || '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text2)' }}>{p.category || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: stockColor, fontWeight: 600 }}>
                      {fmt(p.current_stock)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmtMoney(p.price)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: p.cost_price ? 'var(--text)' : 'var(--text3)' }}>
                      {p.cost_price ? fmtMoney(p.cost_price) : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {p.abc_class ? <Badge text={p.abc_class} color={ABC_COLORS[p.abc_class] || '#8899aa'} /> : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)' }}>
                  <td colSpan={4} style={{ ...tdStyle, fontWeight: 700, color: 'var(--accent)', fontSize: 12, textTransform: 'uppercase' }}>
                    Итого: {fmt(totals.count)} товаров
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                    {fmt(totals.stock)} шт
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                    {fmtMoney(Math.round(totals.value))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--warn)' }}>
                    {fmtMoney(Math.round(totals.costValue))}
                  </td>
                  <td style={tdStyle} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <ShowMoreBtn shown={visibleCount} total={filtered.length} onClick={() => setVisibleCount(c => c + PAGE_SIZE)} />
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 14px', textAlign: 'left', color: 'var(--text2)',
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
  whiteSpace: 'nowrap', userSelect: 'none',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px', color: 'var(--text)', whiteSpace: 'nowrap',
};



// ═══════════════════════════════════════════
// SMART AI TAB
// ═══════════════════════════════════════════

function SmartAITab({ data, reload }: { data: any; reload: () => void }) {
  const [activeSection, setActiveSection] = useState<'overview' | 'combos' | 'slow' | 'rising' | 'margins'>('overview');
  const [reloading, setReloading] = useState(false);

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text2)' }}>
      <Loader2 size={24} className="animate-spin" style={{ marginRight: 10 }} />
      Анализ товаров...
    </div>
  );

  const s = data.summary || {};
  const frozen = data.frozen_capital || {};

  const sections = [
    { key: 'overview' as const, label: 'Обзор', count: data.total_recommendations },
    { key: 'combos' as const, label: 'Комбо', count: s.combo_count },
    { key: 'slow' as const, label: 'Замедлились', count: s.slow_mover_count },
    { key: 'rising' as const, label: 'Растут', count: s.rising_star_count },
    { key: 'margins' as const, label: 'Маржа', count: s.margin_alert_count },
  ];

  const handleReload = async () => {
    setReloading(true);
    await reload();
    setReloading(false);
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: 'var(--accent)',
            borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Zap size={18} color="#0a0f1a" />
            <span style={{ color: 'var(--on-accent)', fontWeight: 700, fontSize: 14 }}>SMART AI</span>
          </div>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>
            {data.total_recommendations} рекомендаций
            {data.critical_count > 0 && (
              <span style={{ color: 'var(--danger)', marginLeft: 8, fontWeight: 600 }}>
                ({data.critical_count} критичных)
              </span>
            )}
          </span>
        </div>
        <button onClick={handleReload} disabled={reloading} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: 'var(--border)', border: '1px solid var(--bg3)',
          borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 13,
          opacity: reloading ? 0.6 : 1,
        }}>
          <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} />
          Пересчитать
        </button>
      </div>

      {/* Section Chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {sections.map(sec => (
          <button key={sec.key} onClick={() => setActiveSection(sec.key)} style={{
            padding: '8px 16px', borderRadius: 16, cursor: 'pointer',
            background: activeSection === sec.key ? 'var(--accent-dim)' : 'var(--bg2)',
            color: activeSection === sec.key ? 'var(--accent)' : 'var(--text2)',
            fontSize: 13, fontWeight: activeSection === sec.key ? 600 : 400,
            border: activeSection === sec.key ? '1px solid var(--accent-border)' : '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {sec.label}
            <span style={{
              background: sec.count > 0 ? (activeSection === sec.key ? 'rgba(255,230,0,0.2)' : 'var(--border)') : 'var(--border)',
              padding: '1px 7px', borderRadius: 10, fontSize: 11,
              color: sec.count > 0 ? 'var(--accent)' : 'var(--text3)',
            }}>
              {sec.count || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <>
          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            <KpiCard icon={ShoppingBag} label="Комбо-пары" value={s.combo_count || 0}
              sub="Товары для комплектов" color="#3b82f6" />
            <KpiCard icon={TrendingDown} label="Замедлились" value={s.slow_mover_count || 0}
              sub="Нужна промо-акция" color="#f59e0b" />
            <KpiCard icon={TrendingUp} label="Растут" value={s.rising_star_count || 0}
              sub="Увеличить запас" color="#22c55e" />
            <KpiCard icon={DollarSign} label="Заморожено" value={fmtMoney(frozen.frozen_30_days || 0)}
              sub={`${frozen.frozen_percent || 0}% от склада`} color="#ef4444" />
          </div>

          {/* Frozen Capital Card */}
          {frozen.frozen_30_days > 0 && (
            <div style={{
              background: 'var(--bg2)',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: 20, marginBottom: 20,
            }}>
              <h3 style={{ color: 'var(--danger)', fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={18} /> Замороженный капитал
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>Весь склад</div>
                  <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>{fmtMoney(frozen.total_inventory_value || 0)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>Заморожено 30+ дн</div>
                  <div style={{ color: 'var(--warn)', fontSize: 18, fontWeight: 700 }}>{fmtMoney(frozen.frozen_30_days || 0)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>Заморожено 60+ дн</div>
                  <div style={{ color: 'var(--danger)', fontSize: 18, fontWeight: 700 }}>{fmtMoney(frozen.frozen_60_days || 0)}</div>
                </div>
              </div>
              {(frozen.recovery_plan || []).map((plan: any, i: number) => (
                <div key={i} style={{
                  background: 'var(--bg2)', borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ color: 'var(--text)', fontSize: 13 }}>{plan.action}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 11 }}>{plan.products_count} товаров</div>
                  </div>
                  <div style={{ color: 'var(--success)', fontSize: 14, fontWeight: 600 }}>
                    +{fmtMoney(plan.potential_recovery || 0)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          {data.total_recommendations === 0 && (
            <div style={{
              background: 'var(--bg2)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 16,
              padding: 40, textAlign: 'center',
            }}>
              <div style={{ fontSize: 26, marginBottom: 12 }}>&#10003;</div>
              <div style={{ color: 'var(--success)', fontSize: 16, fontWeight: 600 }}>Всё в порядке!</div>
              <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6 }}>
                Нет критичных рекомендаций. Система проанализирует данные после поступления продаж.
              </div>
            </div>
          )}

          {/* Top-3 urgent from each category */}
          {(data.slow_movers || []).slice(0, 3).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ color: 'var(--warn)', fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} /> Срочные действия
              </h3>
              {(data.slow_movers || []).slice(0, 3).map((item: any, i: number) => (
                <ActionCard key={i} item={item} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Combos Section */}
      {activeSection === 'combos' && (
        <>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            Товары которые часто покупают вместе. Создайте комплект со скидкой для увеличения среднего чека.
          </div>
          {(data.combos || []).length === 0 ? (
            <EmptyState text="Пока нет данных о совместных покупках. Появятся после накопления чеков." />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {(data.combos || []).map((combo: any, i: number) => (
                <div key={i} style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18,
                  borderLeft: `4px solid ${combo.priority === 'high' ? 'var(--success)' : 'var(--info)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Badge text={`#${i + 1}`} color="#FFE600" />
                        <Badge text={`${combo.times_together}x вместе`} color="#22c55e" />
                      </div>
                      <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
                        {combo.product_a.name}
                      </div>
                      <div style={{ color: 'var(--text3)', fontSize: 12, margin: '4px 0' }}>+</div>
                      <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
                        {combo.product_b.name}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 140 }}>
                      <div style={{ color: 'var(--text3)', fontSize: 11 }}>По отдельности</div>
                      <div style={{ color: 'var(--text2)', fontSize: 14, textDecoration: 'line-through' }}>{fmtMoney(combo.total_price)}</div>
                      <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 6 }}>Комплект (-5%)</div>
                      <div style={{ color: 'var(--success)', fontSize: 18, fontWeight: 700 }}>{fmtMoney(combo.combo_price_5pct)}</div>
                      <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>или -10%: {fmtMoney(combo.combo_price_10pct)}</div>
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg2)', borderRadius: 10, padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}>
                      {combo.action}
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: 11 }}>
                      Потенциал: +{fmtMoney(combo.potential_revenue)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Slow Movers Section */}
      {activeSection === 'slow' && (
        <>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            Товары с падающими или остановившимися продажами. Рекомендуем акции и скидки.
          </div>
          {(data.slow_movers || []).length === 0 ? (
            <EmptyState text="Нет товаров с замедлением продаж. Отлично!" />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <KpiCard icon={AlertTriangle} label="Критичные (90+ дн)"
                  value={(data.slow_movers || []).filter((m: any) => m.priority === 'critical').length}
                  color="#ef4444" />
                <KpiCard icon={TrendingDown} label="Высокие (60+ дн)"
                  value={(data.slow_movers || []).filter((m: any) => m.priority === 'high').length}
                  color="#f59e0b" />
                <KpiCard icon={DollarSign} label="Можно вернуть"
                  value={fmtMoney(s.recovery_potential || 0)} color="#22c55e" />
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {(data.slow_movers || []).map((item: any, i: number) => (
                  <ActionCard key={i} item={item} showPrice />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Rising Stars Section */}
      {activeSection === 'rising' && (
        <>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            Товары с растущим спросом. Увеличьте запасы, чтобы не упустить продажи!
          </div>
          {(data.rising_stars || []).length === 0 ? (
            <EmptyState text="Пока нет товаров с ярким ростом. Появятся после накопления данных." />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {(data.rising_stars || []).map((star: any, i: number) => (
                <div key={i} style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 16,
                  borderLeft: `4px solid ${star.priority === 'high' ? 'var(--danger)' : 'var(--success)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Badge text={`+${star.growth_percent}%`} color="#22c55e" />
                        {star.days_until_stockout && star.days_until_stockout <= 7 && (
                          <Badge text={`${star.days_until_stockout} дн до 0!`} color="#ef4444" />
                        )}
                      </div>
                      <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>{star.name}</div>
                      <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>{star.sku} {star.category ? '• ' + star.category : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--text3)', fontSize: 11 }}>Продажи/день</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{star.avg_daily_full}</span>
                        <TrendingUp size={14} color="#22c55e" />
                        <span style={{ color: 'var(--success)', fontSize: 15, fontWeight: 700 }}>{star.avg_daily_recent}</span>
                      </div>
                      <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>
                        Остаток: {star.current_stock} шт
                        {star.days_until_stockout && <span> ({star.days_until_stockout} дн)</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg2)', borderRadius: 10, padding: '8px 12px', marginTop: 10,
                    color: 'var(--accent)', fontSize: 12, fontWeight: 500,
                  }}>
                    {star.action}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Margin Alerts Section */}
      {activeSection === 'margins' && (
        <>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            Товары с подозрительно низкой маржой. Возможно, нужно скорректировать цены.
          </div>
          {(data.margin_alerts || []).length === 0 ? (
            <EmptyState text="Все товары с нормальной маржой." />
          ) : (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500 }}>Товар</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Цена</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Себест.</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Маржа</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Рекоменд. цена</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text2)', fontWeight: 500 }}>Упущено</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.margin_alerts || []).map((m: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>{m.name}</div>
                        <div style={{ color: 'var(--text3)', fontSize: 11 }}>{m.sku}</div>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text)' }}>{fmtMoney(m.price)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text2)' }}>{fmtMoney(m.cost_price)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <Badge text={`${m.margin_percent}%`} color={m.margin_percent < 5 ? '#ef4444' : '#f59e0b'} />
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{fmtMoney(m.suggested_price)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{fmtMoney(m.lost_profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── Helper: Action Card ───
function ActionCard({ item, showPrice }: { item: any; showPrice?: boolean }) {
  const priorityColors: Record<string, string> = {
    critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6',
  };
  const priorityLabels: Record<string, string> = {
    critical: 'Критично', high: 'Важно', medium: 'Рекомендация',
  };
  const color = priorityColors[item.priority] || '#8899aa';

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 16,
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Badge text={priorityLabels[item.priority] || item.priority} color={color} />
            {item.days_without_sale && (
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>
                {item.days_without_sale} дн без продаж
              </span>
            )}
          </div>
          <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>{item.name}</div>
          <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>
            {item.sku} {item.category ? '• ' + item.category : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 130 }}>
          <div style={{ color: 'var(--text3)', fontSize: 11 }}>Заморожено</div>
          <div style={{ color: 'var(--warn)', fontSize: 16, fontWeight: 700 }}>{fmtMoney(item.frozen_capital || 0)}</div>
          {showPrice && item.suggested_price && (
            <>
              <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 6 }}>Скидка → цена</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <span style={{ color: 'var(--text2)', fontSize: 12, textDecoration: 'line-through' }}>{fmtMoney(item.current_price)}</span>
                <span style={{ color: 'var(--success)', fontSize: 14, fontWeight: 600 }}>{fmtMoney(item.suggested_price)}</span>
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{
        background: 'var(--bg2)', borderRadius: 10, padding: '8px 12px', marginTop: 10,
        color: 'var(--accent)', fontSize: 12, fontWeight: 500,
      }}>
        {item.action}
      </div>
    </div>
  );
}

// ─── Helper: Empty State ───
function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
      padding: 40, textAlign: 'center',
    }}>
      <Package size={32} color="#8899aa" style={{ marginBottom: 12 }} />
      <div style={{ color: 'var(--text2)', fontSize: 14 }}>{text}</div>
    </div>
  );
}


// ═══════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════

function SettingsTab({ data, onSave }: { data: any; onSave: (params: any) => void }) {
  const [form, setForm] = useState(data || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (!data) return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      low_stock_alert_enabled: form.low_stock_alert_enabled,
      reorder_days: form.reorder_days,
      dead_stock_days: form.dead_stock_days,
      alert_phone: form.alert_phone,
      alert_channel: form.alert_channel,
      daily_digest_enabled: form.daily_digest_enabled,
    });
    setSaving(false);
  };

  const inputStyle = {
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', color: 'var(--text)', fontSize: 14, width: '100%',
    outline: 'none',
  };

  const labelStyle = { color: 'var(--text2)', fontSize: 12, marginBottom: 6, display: 'block' as const };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
        <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Настройки товарной аналитики</h3>

        <div style={{ display: 'grid', gap: 20 }}>
          {/* Alert enabled */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.low_stock_alert_enabled || false}
              onChange={e => setForm({ ...form, low_stock_alert_enabled: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
            <div>
              <div style={{ color: 'var(--text)', fontSize: 14 }}>Алерты при низком остатке</div>
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>Автоматические уведомления когда товар заканчивается</div>
            </div>
          </label>

          {/* Daily digest */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.daily_digest_enabled || false}
              onChange={e => setForm({ ...form, daily_digest_enabled: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
            <div>
              <div style={{ color: 'var(--text)', fontSize: 14 }}>Ежедневный дайджест</div>
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>Утренний отчёт по товарам в WhatsApp/Telegram</div>
            </div>
          </label>

          {/* Reorder days */}
          <div>
            <label style={labelStyle}>Дней запаса при заказе</label>
            <input type="number" value={form.reorder_days || 14} min={1} max={90}
              onChange={e => setForm({ ...form, reorder_days: parseInt(e.target.value) || 14 })}
              style={inputStyle} />
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>
              Рекомендация заказа = средние продажи/день x кол-во дней
            </div>
          </div>

          {/* Dead stock days */}
          <div>
            <label style={labelStyle}>Dead Stock порог (дней без продаж)</label>
            <input type="number" value={form.dead_stock_days || 30} min={7} max={365}
              onChange={e => setForm({ ...form, dead_stock_days: parseInt(e.target.value) || 30 })}
              style={inputStyle} />
          </div>

          {/* Alert phone */}
          <div>
            <label style={labelStyle}>Телефон для алертов</label>
            <input type="text" value={form.alert_phone || ''} placeholder="+996XXXXXXXXX"
              onChange={e => setForm({ ...form, alert_phone: e.target.value })}
              style={inputStyle} />
          </div>

          {/* Alert channel */}
          <div>
            <label style={labelStyle}>Канал уведомлений</label>
            <select value={form.alert_channel || 'whatsapp'}
              onChange={e => setForm({ ...form, alert_channel: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} style={{
          marginTop: 24, width: '100%', padding: '12px 0',
          background: 'var(--accent)', color: 'var(--bg2)', border: 'none',
          borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  );
}
