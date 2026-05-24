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
  background: '#141c2b',
  border: '1px solid #1e293b',
  borderRadius: 10,
  color: '#e2eaf6',
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

type Tab = 'overview' | 'low-stock' | 'top-sellers' | 'abc' | 'dead-stock' | 'margins' | 'cross-sell' | 'settings';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Обзор', icon: BarChart3 },
  { key: 'low-stock', label: 'Остатки', icon: AlertTriangle },
  { key: 'top-sellers', label: 'Топ продаж', icon: TrendingUp },
  { key: 'abc', label: 'ABC анализ', icon: Layers },
  { key: 'dead-stock', label: 'Dead Stock', icon: TrendingDown },
  { key: 'margins', label: 'Маржа', icon: DollarSign },
  { key: 'cross-sell', label: 'Кросс-сейл', icon: ShoppingBag },
  { key: 'settings', label: 'Настройки', icon: Settings2 },
];

// ─── KPI Card ───
function KpiCard({ icon: Icon, label, value, sub, color = '#FFE600' }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
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
      <div>
        <div style={{ color: '#8899aa', fontSize: 12, marginBottom: 2 }}>{label}</div>
        <div style={{ color: '#e2eaf6', fontSize: 20, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ color: '#5e6e82', fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Badge ───
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      background: color + '20', color, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 6,
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
      <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#5e6e82' }} />
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 12px 9px 36px',
          background: '#0a101e', border: '1px solid #1e293b', borderRadius: 8,
          color: '#e2eaf6', fontSize: 13, outline: 'none',
        }}
      />
      {value && (
        <button onClick={() => onChange('')} style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: '#5e6e82', cursor: 'pointer', padding: 2,
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
      padding: '9px 12px', background: '#0a101e', border: '1px solid #1e293b',
      borderRadius: 8, color: '#e2eaf6', fontSize: 13, cursor: 'pointer', outline: 'none',
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
        padding: '8px 24px', background: '#1e293b', border: '1px solid #334155',
        borderRadius: 8, color: '#e2eaf6', cursor: 'pointer', fontSize: 13,
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
  const [settings, setSettings] = useState<any>(null);

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
        if (tab === 'settings' && !settings) {
          const r = await productAPI.settings();
          setSettings(r.data);
        }
      } catch {}
    };
    loadTab();
  }, [tab, period, topSellers, abc, deadStock, margins, crossSell, settings]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#8899aa' }}>
        <Loader2 size={32} className="animate-spin" style={{ marginRight: 12 }} />
        Загрузка товарной аналитики...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#ef4444' }}>
        <AlertTriangle size={40} style={{ marginBottom: 12 }} />
        <div>{error}</div>
        <button onClick={loadData} style={{
          marginTop: 16, padding: '8px 20px', background: '#1e293b', border: 'none',
          borderRadius: 8, color: '#e2eaf6', cursor: 'pointer',
        }}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Package size={28} color="#FFE600" />
          <h1 style={{ color: '#e2eaf6', fontSize: 24, fontWeight: 700, margin: 0 }}>
            Товарная аналитика
          </h1>
        </div>
        <button onClick={loadData} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: '#1e293b', border: '1px solid #334155',
          borderRadius: 8, color: '#e2eaf6', cursor: 'pointer', fontSize: 13,
        }}>
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto',
        background: '#0a101e', borderRadius: 12, padding: 4,
        border: '1px solid #1e293b',
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', border: 'none', borderRadius: 8,
              background: tab === t.key ? '#1e293b' : 'transparent',
              color: tab === t.key ? '#FFE600' : '#8899aa',
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

  const stockData = [
    { name: 'В наличии', value: summary.active_products - summary.low_stock_count - summary.out_of_stock_count, fill: '#22c55e' },
    { name: 'Мало', value: summary.low_stock_count, fill: '#f59e0b' },
    { name: 'Нет в наличии', value: summary.out_of_stock_count, fill: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon={Package} label="Всего товаров" value={fmt(summary.total_products)} sub={`Активных: ${summary.active_products}`} />
        <KpiCard icon={AlertTriangle} label="Мало на складе" value={summary.low_stock_count} sub={`Нет в наличии: ${summary.out_of_stock_count}`} color="#f59e0b" />
        <KpiCard icon={TrendingDown} label="Dead Stock" value={summary.dead_stock_count} sub="Нет продаж 30+ дней" color="#ef4444" />
        <KpiCard icon={DollarSign} label="Стоимость склада" value={fmtMoney(summary.total_inventory_value)} sub={summary.total_cost_value ? `Себестоимость: ${fmtMoney(summary.total_cost_value)}` : undefined} color="#22c55e" />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Stock Status Pie */}
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
          <h3 style={{ color: '#e2eaf6', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Статус остатков</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={stockData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3} strokeWidth={0}>
                {stockData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#8899aa' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* ABC Pie */}
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
          <h3 style={{ color: '#e2eaf6', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>ABC классификация</h3>
          {abcData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={abcData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {abcData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#8899aa' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5e6e82' }}>
              Нажмите "Пересчитать ABC" в разделе ABC анализ
            </div>
          )}
        </div>
      </div>

      {/* Critical Alerts Preview */}
      {lowStock && lowStock.critical > 0 && (
        <div style={{ background: '#0d1526', border: '1px solid #ef444440', borderRadius: 14, padding: 20 }}>
          <h3 style={{ color: '#ef4444', fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} /> Критические алерты ({lowStock.critical})
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {lowStock.alerts.filter((a: any) => a.urgency === 'critical').slice(0, 5).map((a: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#1a0a0a', borderRadius: 8, padding: '10px 14px',
              }}>
                <div>
                  <span style={{ color: '#e2eaf6', fontSize: 13, fontWeight: 500 }}>{a.name}</span>
                  <span style={{ color: '#5e6e82', fontSize: 11, marginLeft: 8 }}>{a.sku}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                    Остаток: {a.current_stock} {a.current_stock <= 0 ? '(нет!)' : ''}
                  </span>
                  <span style={{ color: '#8899aa', fontSize: 11 }}>
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

  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const filtered = useMemo(() => {
    let items = data.alerts || [];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
    }
    if (catFilter) items = items.filter((a: any) => a.category === catFilter);
    if (urgFilter) items = items.filter((a: any) => a.urgency === urgFilter);
    return items;
  }, [data.alerts, search, catFilter, urgFilter]);

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
          padding: '9px 12px', background: '#0a101e', border: '1px solid #1e293b',
          borderRadius: 8, color: '#e2eaf6', fontSize: 13, cursor: 'pointer', outline: 'none',
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
          background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
          color: '#e2eaf6', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel
        </button>
        {(search || catFilter || urgFilter) && (
          <span style={{ color: '#8899aa', fontSize: 12 }}>Найдено: {filtered.length}</span>
        )}
      </div>

      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0a101e', borderBottom: '1px solid #1e293b' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Статус</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Остаток</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Минимум</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Продажи/день</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Дней до 0</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Заказать</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b15' }}>
                <td style={{ padding: '10px 16px' }}>
                  <Badge text={URGENCY_LABELS[a.urgency]} color={URGENCY_COLORS[a.urgency]} />
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: '#e2eaf6', fontWeight: 500 }}>{a.name}</div>
                  <div style={{ color: '#5e6e82', fontSize: 11 }}>{a.sku} {a.category ? `• ${a.category}` : ''}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: a.current_stock <= 0 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                  {a.current_stock}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#8899aa' }}>{a.min_stock_level}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{a.avg_daily_sales}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: a.days_until_stockout !== null && a.days_until_stockout <= 3 ? '#ef4444' : '#e2eaf6', fontWeight: 600 }}>
                  {a.days_until_stockout !== null ? `${a.days_until_stockout} дн` : '—'}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{a.recommended_order}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#22c55e' }}>
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

  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const allSellers = data.top_sellers || [];
  const filtered = useMemo(() => {
    if (!search) return allSellers;
    const s = search.toLowerCase();
    return allSellers.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
  }, [allSellers, search]);

  const chartData = allSellers.slice(0, 10).map((s: any) => ({
    name: s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name,
    revenue: Math.round(s.total_revenue),
    sold: Math.round(s.total_sold),
  })) || [];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => { setPeriod(d); reload(d); }} style={{
            padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: period === d ? '#FFE600' : '#1e293b',
            color: period === d ? '#0a101e' : '#8899aa', fontSize: 13, fontWeight: 500,
          }}>
            {d} дней
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {chartData.length > 0 && (
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: '#e2eaf6', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Топ-10 по выручке</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" stroke="#5e6e82" tickFormatter={(v: number) => fmt(v)} />
              <YAxis type="category" dataKey="name" stroke="#8899aa" width={100} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="revenue" fill="#FFE600" radius={[0, 6, 6, 0]} name="Выручка" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0a101e', borderBottom: '1px solid #1e293b' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>#</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Продано</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Выручка</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>В день</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Остаток</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Дней до 0</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b15' }}>
                <td style={{ padding: '10px 16px', color: '#FFE600', fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: '#e2eaf6', fontWeight: 500 }}>{s.name}</div>
                  <div style={{ color: '#5e6e82', fontSize: 11 }}>{s.sku} {s.category ? `• ${s.category}` : ''}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{fmt(s.total_sold)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtMoney(s.total_revenue)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{s.avg_daily_sales}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: s.current_stock <= 5 ? '#ef4444' : '#e2eaf6' }}>{s.current_stock}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: s.days_until_stockout !== null && s.days_until_stockout <= 7 ? '#ef4444' : '#e2eaf6', fontWeight: 600 }}>
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

  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const allItems = data.items || [];
  const filtered = useMemo(() => {
    let items = allItems;
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
    }
    if (classFilter) items = items.filter((a: any) => a.abc_class === classFilter);
    return items;
  }, [allItems, search, classFilter]);

  const visible = filtered.slice(0, visibleCount);

  const summaryData = data.summary ? [
    { name: 'A — 80% выручки', count: data.summary.A?.count || 0, revenue: data.summary.A?.revenue || 0, fill: ABC_COLORS.A },
    { name: 'B — 15% выручки', count: data.summary.B?.count || 0, revenue: data.summary.B?.revenue || 0, fill: ABC_COLORS.B },
    { name: 'C — 5% выручки', count: data.summary.C?.count || 0, revenue: data.summary.C?.revenue || 0, fill: ABC_COLORS.C },
  ] : [];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ color: '#8899aa', fontSize: 13 }}>
          Период: {data.period_days} дней | Общая выручка: {fmtMoney(data.total_revenue)}
        </div>
        <button onClick={async () => {
          setRecalculating(true);
          await onRecalculate();
          setRecalculating(false);
        }} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: '#22c55e20', border: '1px solid #22c55e40',
          borderRadius: 8, color: '#22c55e', cursor: 'pointer', fontSize: 13,
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
              background: '#0d1526', border: `1px solid ${s.fill}30`, borderRadius: 14, padding: 18,
              borderLeft: `4px solid ${s.fill}`,
            }}>
              <div style={{ color: s.fill, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{s.name}</div>
              <div style={{ color: '#e2eaf6', fontSize: 20, fontWeight: 700 }}>{s.count} товаров</div>
              <div style={{ color: '#8899aa', fontSize: 12, marginTop: 4 }}>Выручка: {fmtMoney(s.revenue)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setVisibleCount(PAGE_SIZE); }} />
        <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setVisibleCount(PAGE_SIZE); }} style={{
          padding: '9px 12px', background: '#0a101e', border: '1px solid #1e293b',
          borderRadius: 8, color: '#e2eaf6', fontSize: 13, cursor: 'pointer', outline: 'none',
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
          background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
          color: '#e2eaf6', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel
        </button>
        {(search || classFilter) && (
          <span style={{ color: '#8899aa', fontSize: 12 }}>Найдено: {filtered.length}</span>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0a101e', borderBottom: '1px solid #1e293b' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Класс</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Выручка</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>% от общей</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Накопительный %</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b15' }}>
                <td style={{ padding: '10px 16px' }}>
                  <Badge text={item.abc_class} color={ABC_COLORS[item.abc_class] || '#8899aa'} />
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: '#e2eaf6', fontWeight: 500 }}>{item.name}</div>
                  <div style={{ color: '#5e6e82', fontSize: 11 }}>{item.sku}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtMoney(item.revenue)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{item.revenue_percent}%</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#8899aa' }}>{item.cumulative_percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#5e6e82' }}>
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

  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const filtered = useMemo(() => {
    let items = data.items || [];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
    }
    if (catFilter) items = items.filter((a: any) => a.category === catFilter);
    return items;
  }, [data.items, search, catFilter]);

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
          background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
          color: '#e2eaf6', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel
        </button>
        {(search || catFilter) && (
          <span style={{ color: '#8899aa', fontSize: 12 }}>Найдено: {filtered.length}</span>
        )}
      </div>

      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0a101e', borderBottom: '1px solid #1e293b' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Остаток</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Цена</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Заморожено</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Без продаж</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b15' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: '#e2eaf6', fontWeight: 500 }}>{item.name}</div>
                  <div style={{ color: '#5e6e82', fontSize: 11 }}>{item.sku} {item.category ? `• ${item.category}` : ''}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{item.current_stock}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#8899aa' }}>{fmtMoney(item.price)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{fmtMoney(item.frozen_capital)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{item.days_without_sale} дн</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#22c55e' }}>
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

  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  const allItems = data.items || [];
  const filtered = useMemo(() => {
    if (!search) return allItems;
    const s = search.toLowerCase();
    return allItems.filter((a: any) => a.name?.toLowerCase().includes(s) || a.sku?.toLowerCase().includes(s));
  }, [allItems, search]);

  const visible = filtered.slice(0, visibleCount);

  const chartData = (data.items || []).slice(0, 15).map((m: any) => ({
    name: m.name.length > 18 ? m.name.slice(0, 18) + '...' : m.name,
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
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: '#e2eaf6', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Маржа по товарам, %</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" stroke="#5e6e82" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <YAxis type="category" dataKey="name" stroke="#8899aa" width={100} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => name === 'margin' ? `${v}%` : fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="margin" fill="#22c55e" radius={[0, 6, 6, 0]} name="Маржа %" />
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
          background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
          color: '#e2eaf6', cursor: 'pointer', fontSize: 13,
        }}>
          <Download size={14} /> Excel
        </button>
        {search && <span style={{ color: '#8899aa', fontSize: 12 }}>Найдено: {filtered.length}</span>}
      </div>

      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0a101e', borderBottom: '1px solid #1e293b' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#8899aa', fontWeight: 500 }}>Товар</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Цена</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Себестоимость</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Продано</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Выручка</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Прибыль</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#8899aa', fontWeight: 500 }}>Маржа</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b15' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ color: '#e2eaf6', fontWeight: 500 }}>{m.name}</div>
                  <div style={{ color: '#5e6e82', fontSize: 11 }}>{m.sku}</div>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{fmtMoney(m.price)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#8899aa' }}>{fmtMoney(m.cost_price)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{fmt(m.total_sold)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e2eaf6' }}>{fmtMoney(m.total_revenue)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmtMoney(m.total_profit)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <Badge text={`${m.margin_percent}%`} color={m.margin_percent >= 30 ? '#22c55e' : m.margin_percent >= 15 ? '#f59e0b' : '#ef4444'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#5e6e82' }}>
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
  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

  return (
    <>
      <div style={{ color: '#8899aa', fontSize: 13, marginBottom: 16 }}>
        Период: {data.period_days} дней | Всего чеков: {fmt(data.total_receipts)}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {(data.pairs || []).map((p: any, i: number) => (
          <div key={i} style={{
            background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14,
            padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ color: '#FFE600', fontSize: 18, fontWeight: 700 }}>#{i + 1}</div>
              <div>
                <div style={{ color: '#e2eaf6', fontSize: 14, fontWeight: 500 }}>
                  {p.product_a_name} <span style={{ color: '#5e6e82', margin: '0 6px' }}>+</span> {p.product_b_name}
                </div>
                <div style={{ color: '#5e6e82', fontSize: 11, marginTop: 4 }}>
                  {p.product_a_sku} + {p.product_b_sku}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#22c55e', fontSize: 18, fontWeight: 700 }}>{p.times_bought_together}</div>
                <div style={{ color: '#5e6e82', fontSize: 10 }}>раз вместе</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#3b82f6', fontSize: 14, fontWeight: 600 }}>{(p.confidence * 100).toFixed(1)}%</div>
                <div style={{ color: '#5e6e82', fontSize: 10 }}>от всех чеков</div>
              </div>
            </div>
          </div>
        ))}
        {(data.pairs || []).length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#5e6e82', background: '#0d1526', borderRadius: 14 }}>
            Недостаточно данных. Нужно больше чеков с несколькими товарами.
          </div>
        )}
      </div>
    </>
  );
}


// ═══════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════

function SettingsTab({ data, onSave }: { data: any; onSave: (params: any) => void }) {
  const [form, setForm] = useState(data || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (!data) return <div style={{ color: '#8899aa', textAlign: 'center', padding: 40 }}>Загрузка...</div>;

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
    background: '#0a101e', border: '1px solid #1e293b', borderRadius: 8,
    padding: '10px 14px', color: '#e2eaf6', fontSize: 14, width: '100%',
    outline: 'none',
  };

  const labelStyle = { color: '#8899aa', fontSize: 12, marginBottom: 6, display: 'block' as const };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 24 }}>
        <h3 style={{ color: '#e2eaf6', fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Настройки товарной аналитики</h3>

        <div style={{ display: 'grid', gap: 20 }}>
          {/* Alert enabled */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.low_stock_alert_enabled || false}
              onChange={e => setForm({ ...form, low_stock_alert_enabled: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: '#FFE600' }} />
            <div>
              <div style={{ color: '#e2eaf6', fontSize: 14 }}>Алерты при низком остатке</div>
              <div style={{ color: '#5e6e82', fontSize: 12 }}>Автоматические уведомления когда товар заканчивается</div>
            </div>
          </label>

          {/* Daily digest */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.daily_digest_enabled || false}
              onChange={e => setForm({ ...form, daily_digest_enabled: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: '#FFE600' }} />
            <div>
              <div style={{ color: '#e2eaf6', fontSize: 14 }}>Ежедневный дайджест</div>
              <div style={{ color: '#5e6e82', fontSize: 12 }}>Утренний отчёт по товарам в WhatsApp/Telegram</div>
            </div>
          </label>

          {/* Reorder days */}
          <div>
            <label style={labelStyle}>Дней запаса при заказе</label>
            <input type="number" value={form.reorder_days || 14} min={1} max={90}
              onChange={e => setForm({ ...form, reorder_days: parseInt(e.target.value) || 14 })}
              style={inputStyle} />
            <div style={{ color: '#5e6e82', fontSize: 11, marginTop: 4 }}>
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
          background: '#FFE600', color: '#0a101e', border: 'none',
          borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  );
}
