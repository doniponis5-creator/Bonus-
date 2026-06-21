'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { financialsAPI } from '@/lib/api';
import {
  Truck, Plus, Trash2, Edit3, X, RefreshCw, Loader2,
  TrendingDown, BarChart3, CheckSquare, Square,
  AlertTriangle, EyeOff, Copy, Check,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

type Currency = 'USD' | 'SOM';

interface Supplier {
  id: string;
  name: string;
  currency: Currency;
  amount: number;
  notes: string;
  excluded: boolean;
  color: string;
}

const LS_KEY = 'supplier_debts_prefs';
const PALETTE = [
  '#FFE600','#22c55e','#3b82f6','#f59e0b','#ec4899',
  '#06b6d4','#8b5cf6','#ef4444','#84cc16','#f97316',
  '#a855f7','#14b8a6','#fb923c','#60a5fa','#34d399',
];
const fmt = (v: number) => Math.round(v).toLocaleString('ru-RU');
const fmtAmt = (v: number, cur: Currency) =>
  cur === 'USD' ? `$${fmt(v)}` : `${fmt(v)} сом`;
const tooltipStyle = {
  background: '#1e293b', border: '1px solid #334155',
  borderRadius: 10, color: '#f1f5f9', fontSize: 13, padding: '10px 14px',
};
function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function loadPrefs() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function savePrefs(p: Record<string, any>) { localStorage.setItem(LS_KEY, JSON.stringify({ ...loadPrefs(), ...p })); }

function KCard({ label, value, sub, color = '#FFE600', icon: Icon }: any) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 4 }}>{label}</div>
        <div style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

function SupplierModal({ initial, currency, onSave, onClose }: { initial?: Supplier; currency: Currency; onSave: (s: Supplier) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [cur, setCur] = useState<Currency>(initial?.currency ?? currency);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = () => {
    if (!name.trim()) { setErr('Введите имя поставщика'); return; }
    const amt = parseFloat(amount.replace(/[^\d.]/g, ''));
    if (isNaN(amt) || amt < 0) { setErr('Введите корректную сумму'); return; }
    onSave({ id: initial?.id ?? uuid(), name: name.trim(), currency: cur, amount: amt, notes: notes.trim(), excluded: initial?.excluded ?? false, color: initial?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)] });
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ color: 'var(--text)', margin: 0, fontSize: 17, fontWeight: 700 }}>{initial ? 'Редактировать' : 'Добавить поставщика'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['USD', 'SOM'] as Currency[]).map(c => (
            <button key={c} onClick={() => setCur(c)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: cur === c ? (c === 'USD' ? '#f59e0b' : '#22c55e') : 'var(--bg3)', color: cur === c ? '#000' : 'var(--text2)' }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Поставщик *', val: name, set: setName, ph: 'Рома ака, Лидер Поставщик...', type: 'text', ref },
            { label: `Долг (${cur}) *`, val: amount, set: setAmount, ph: cur === 'USD' ? '79435' : '6500000', type: 'number' },
            { label: 'Заметка', val: notes, set: setNotes, ph: 'Срок, условия...', type: 'text' },
          ].map(({ label, val, set, ph, type, ref: r }) => (
            <div key={label}>
              <label style={{ color: 'var(--text2)', fontSize: 12, display: 'block', marginBottom: 6 }}>{label}</label>
              <input ref={r as any} value={val} onChange={e => set(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder={ph} type={type}
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
        {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }}>Отмена</button>
          <button onClick={submit} style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: '#FFE600', color: '#000', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>{initial ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </div>
    </div>
  );
}

export default function SupplierDebtsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [modal, setModal] = useState<'add' | Supplier | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'amount' | 'name'>('amount');
  const [view, setView] = useState<'dashboard' | 'table'>('dashboard');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persistent prefs
  useEffect(() => {
    const p = loadPrefs();
    if (p.currency) setCurrency(p.currency);
    if (p.sortBy) setSortBy(p.sortBy);
    if (p.view) setView(p.view);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try { const r = await financialsAPI.getSupplierDebts(); setSuppliers(r.data.suppliers || []); }
    catch { setSuppliers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const persistSave = useCallback((list: Supplier[]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try { await financialsAPI.saveSupplierDebts(list); } finally { setSaving(false); }
    }, 800);
  }, []);

  const updateList = (list: Supplier[]) => { setSuppliers(list); persistSave(list); };

  // Derived
  const byCur = (c: Currency) => suppliers.filter(s => s.currency === c);
  const active = byCur(currency);
  const included = active.filter(s => !s.excluded);
  const excl = active.filter(s => s.excluded);
  const total = included.reduce((s, x) => s + x.amount, 0);
  const totalAll = active.reduce((s, x) => s + x.amount, 0);
  const exclTotal = excl.reduce((s, x) => s + x.amount, 0);

  const filtered = active
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'amount' ? b.amount - a.amount : a.name.localeCompare(b.name, 'ru'));

  const pieData = (() => {
    const s = [...included].sort((a, b) => b.amount - a.amount);
    if (s.length <= 8) return s.map(x => ({ name: x.name, value: x.amount, color: x.color }));
    const top = s.slice(0, 7);
    const rest = s.slice(7).reduce((a, x) => a + x.amount, 0);
    return [...top.map(x => ({ name: x.name, value: x.amount, color: x.color })), { name: `Прочие (${s.length - 7})`, value: rest, color: '#8899aa' }];
  })();

  const barData = [...active].sort((a, b) => b.amount - a.amount).slice(0, 10).map(s => ({
    name: s.name.length > 13 ? s.name.slice(0, 12) + '…' : s.name,
    fullName: s.name, amount: s.amount, color: s.excluded ? '#374151' : s.color, excluded: s.excluded,
  }));

  const handleSave = (s: Supplier) => {
    updateList(modal === 'add' ? [...suppliers, s] : suppliers.map(x => x.id === s.id ? s : x));
    setModal(null);
  };

  const copyTotal = async () => {
    const lines = included.sort((a, b) => b.amount - a.amount).map(s => `${s.name}: ${fmtAmt(s.amount, currency)}`);
    lines.push(`\nИТОГО: ${fmtAmt(total, currency)}`);
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const changeCurrency = (c: Currency) => { setCurrency(c); savePrefs({ currency: c }); };
  const changeSortBy = (s: 'amount' | 'name') => { setSortBy(s); savePrefs({ sortBy: s }); };
  const changeView = (v: 'dashboard' | 'table') => { setView(v); savePrefs({ view: v }); };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
      <Loader2 size={32} className="animate-spin" style={{ marginRight: 12 }} /> Загрузка...
    </div>
  );

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Truck size={28} color="#FFE600" />
          <div>
            <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, margin: 0 }}>Долги поставщикам</h1>
            <div style={{ color: saving ? '#f59e0b' : '#22c55e', fontSize: 12, marginTop: 2 }}>
              {saving ? '💾 Сохранение...' : '✓ Автосохранение'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {(['dashboard', 'table'] as const).map(v => (
              <button key={v} onClick={() => changeView(v)} style={{
                padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13,
                background: view === v ? 'var(--border)' : 'transparent',
                color: view === v ? '#FFE600' : 'var(--text2)', fontWeight: view === v ? 600 : 400,
              }}>{v === 'dashboard' ? '📊 Dashboard' : '📋 Таблица'}</button>
            ))}
          </div>
          <button onClick={copyTotal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
            {copied ? <><Check size={14} color="#22c55e" /> Скопировано</> : <><Copy size={14} /> Копировать</>}
          </button>
          <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
            <RefreshCw size={14} /> Обновить
          </button>
          <button onClick={() => setModal('add')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: '#FFE600', border: 'none', borderRadius: 10, color: '#000', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            <Plus size={14} /> Добавить
          </button>
        </div>
      </div>

      {/* Currency Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['USD', 'SOM'] as Currency[]).map(cur => {
          const cnt = byCur(cur).length;
          const tot = byCur(cur).filter(s => !s.excluded).reduce((s, x) => s + x.amount, 0);
          const isActive = currency === cur;
          const accent = cur === 'USD' ? '#f59e0b' : '#22c55e';
          return (
            <button key={cur} onClick={() => changeCurrency(cur)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px',
              borderRadius: 14, border: 'none', cursor: 'pointer',
              background: isActive ? `${accent}18` : 'var(--bg2)',
              outline: isActive ? `2px solid ${accent}` : '1px solid var(--border)',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: isActive ? accent : 'var(--text2)' }}>{cur}</span>
              <span style={{ background: isActive ? accent : 'var(--border)', color: isActive ? '#000' : 'var(--text2)', borderRadius: 20, padding: '2px 9px', fontSize: 13, fontWeight: 700 }}>{cnt}</span>
              {cnt > 0 && <span style={{ color: isActive ? accent : 'var(--text2)', fontSize: 13, fontWeight: 600 }}>{fmtAmt(tot, cur)}</span>}
            </button>
          );
        })}
      </div>

      {/* Dashboard */}
      {view === 'dashboard' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KCard icon={Truck} label={`Долг · ${currency} (включено)`} value={fmtAmt(total, currency)} sub={`${included.length} поставщиков`} color="#ef4444" />
            <KCard icon={TrendingDown} label="Всего (включая КРОМЕ)" value={fmtAmt(totalAll, currency)} sub={`${active.length} поставщиков`} color="#f59e0b" />
            {exclTotal > 0 && <KCard icon={EyeOff} label="Исключено (КРОМЕ)" value={fmtAmt(exclTotal, currency)} sub={`${excl.length} поставщиков`} color="#8899aa" />}
            {included.length > 1 && <KCard icon={BarChart3} label="Ср. долг на поставщика" value={fmtAmt(total / included.length, currency)} sub="из включённых" color="#3b82f6" />}
          </div>

          {active.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: included.length > 1 ? '1fr 1.5fr' : '1fr', gap: 16, marginBottom: 24 }}>
              {/* Pie */}
              {included.length > 0 && (
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                  <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Распределение долгов</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={88} innerRadius={40} dataKey="value" label={false}>
                        {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _: any, p: any) => [fmtAmt(v, currency), p.payload.name]} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
                    {pieData.map((d, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                          <span style={{ color: 'var(--text2)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtAmt(d.value, currency)}</span>
                          <span style={{ color: 'var(--text2)' }}>{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Bar */}
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Топ поставщиков</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" stroke="#8899aa" tick={{ fontSize: 11 }}
                      tickFormatter={v => currency === 'USD' ? `$${Math.round(v / 1000)}K` : `${Math.round(v / 1000)}K сом`} />
                    <YAxis type="category" dataKey="name" stroke="#8899aa" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: number, _: any, p: any) => [fmtAmt(v, currency), p.payload.excluded ? p.payload.fullName + ' (КРОМЕ)' : p.payload.fullName]}
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                      {barData.map((e, i) => <Cell key={i} fill={e.color} opacity={e.excluded ? 0.25 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* Supplier Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="🔍 Поиск..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
          <select value={sortBy} onChange={e => changeSortBy(e.target.value as any)}
            style={{ padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
            <option value="amount">По сумме ↓</option>
            <option value="name">По имени</option>
          </select>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button onClick={() => updateList(suppliers.map(s => s.currency === currency ? { ...s, excluded: false } : s))}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>
              Включить все
            </button>
            <button onClick={() => updateList(suppliers.map(s => s.currency === currency ? { ...s, excluded: true } : s))}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>
              Исключить все
            </button>
          </div>
        </div>

        {/* Info bar */}
        {active.length > 0 && (
          <div style={{ padding: '9px 16px', background: 'rgba(255,230,0,0.05)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>
            ☑ Отметьте поставщиков, чтобы исключить их из суммы (КРОМЕ).&nbsp;&nbsp;
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
              Итого (вкл.): {fmtAmt(total, currency)}
              {exclTotal > 0 && ` · КРОМЕ: ${fmtAmt(exclTotal, currency)}`}
            </span>
          </div>
        )}

        {/* Table header */}
        {filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 180px 70px', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
            {['', 'Поставщик', 'Долг', ''].map((h, i) => (
              <div key={i} style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i === 2 ? 'right' : i === 3 ? 'center' : 'left' }}>{h}</div>
            ))}
          </div>
        )}

        {/* Empty */}
        {active.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text2)' }}>
            <Truck size={40} style={{ margin: '0 auto 16px', opacity: 0.3, display: 'block' }} />
            <div style={{ fontSize: 15, marginBottom: 12 }}>Нет поставщиков в {currency}</div>
            <button onClick={() => setModal('add')} style={{ padding: '10px 24px', background: '#FFE600', border: 'none', borderRadius: 10, color: '#000', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>+ Добавить</button>
          </div>
        )}

        {/* Rows */}
        {filtered.map((sup, idx) => (
          <div key={sup.id}
            style={{ display: 'grid', gridTemplateColumns: '44px 1fr 180px 70px', padding: '13px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', opacity: sup.excluded ? 0.45 : 1, transition: 'all 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            <div onClick={() => updateList(suppliers.map(s => s.id === sup.id ? { ...s, excluded: !s.excluded } : s))} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              {sup.excluded ? <Square size={18} color="var(--text2)" /> : <CheckSquare size={18} color="#22c55e" />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: sup.color, flexShrink: 0 }} />
              <div>
                <div style={{ color: sup.excluded ? 'var(--text2)' : 'var(--text)', fontSize: 14, fontWeight: 500, textDecoration: sup.excluded ? 'line-through' : 'none' }}>
                  {idx === 0 && !search && sortBy === 'amount' && !sup.excluded && <span style={{ color: '#FFE600', fontSize: 11, marginRight: 5, fontWeight: 700 }}>★</span>}
                  {sup.name}
                </div>
                {sup.notes && <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 2 }}>{sup.notes}</div>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: sup.excluded ? 'var(--text2)' : (currency === 'USD' ? '#f59e0b' : '#22c55e'), fontSize: 15, fontWeight: 700 }}>{fmtAmt(sup.amount, currency)}</div>
              {!sup.excluded && total > 0 && <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 2 }}>{((sup.amount / total) * 100).toFixed(1)}%</div>}
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              <button onClick={() => setModal(sup)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6 }} title="Редактировать"><Edit3 size={14} /></button>
              <button onClick={() => setDeleteId(sup.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef444466', padding: 4, borderRadius: 6 }} title="Удалить"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}

        {/* Footer total */}
        {filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 180px 70px', padding: '14px 16px', background: 'var(--bg3)', borderTop: '2px solid var(--border)' }}>
            <div />
            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>ИТОГО ({included.length} из {active.length} поставщиков)</div>
            <div style={{ textAlign: 'right', color: '#ef4444', fontSize: 18, fontWeight: 800 }}>{fmtAmt(total, currency)}</div>
            <div />
          </div>
        )}
      </div>

      {/* Modals */}
      {modal !== null && (
        <SupplierModal initial={modal === 'add' ? undefined : modal as Supplier} currency={currency} onSave={handleSave} onClose={() => setModal(null)} />
      )}

      {deleteId && (
        <div onClick={() => setDeleteId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <AlertTriangle size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ color: 'var(--text)', margin: '0 0 8px', fontSize: 17 }}>Удалить поставщика?</h3>
            <p style={{ color: 'var(--text2)', fontSize: 13, margin: '0 0 20px' }}>{suppliers.find(s => s.id === deleteId)?.name}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }}>Отмена</button>
              <button onClick={() => { updateList(suppliers.filter(s => s.id !== deleteId)); setDeleteId(null); }} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
