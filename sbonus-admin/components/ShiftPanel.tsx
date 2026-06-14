'use client';
import { Banknote, DollarSign, Minus, Plus, Lock, Unlock, Clock, CheckCircle2, AlertTriangle, Loader2, PlayCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { shiftsAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';

const DENOMS = [5000, 2000, 1000, 500, 200, 100, 50, 20];
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const dt = (s?: string) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export default function ShiftPanel({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<any>(null);
  const [rate, setRate] = useState(87.45);

  const [opening, setOpening] = useState('');
  const [opening_busy, setOpeningBusy] = useState(false);

  const [counts, setCounts] = useState<Record<string, number>>(Object.fromEntries(DENOMS.map((d) => [String(d), 0])));
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const refresh = async () => {
    try {
      const [c, r] = await Promise.all([shiftsAPI.current(), shiftsAPI.rate()]);
      setShift(c.data.shift);
      setRate(parseFloat(r.data.usd_rate) || 87.45);
    } catch { /* noop */ } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const { total, bills } = useMemo(() => {
    let t = 0, b = 0;
    for (const d of DENOMS) { t += d * (counts[String(d)] || 0); b += counts[String(d)] || 0; }
    return { total: t, bills: b };
  }, [counts]);
  const usd = rate > 0 ? total / rate : 0;

  const setQty = (d: number, delta: number) =>
    setCounts((p) => ({ ...p, [String(d)]: Math.max(0, (p[String(d)] || 0) + delta) }));
  const setExact = (d: number, v: string) =>
    setCounts((p) => ({ ...p, [String(d)]: Math.max(0, parseInt(v) || 0) }));

  const doOpen = async () => {
    setOpeningBusy(true);
    try {
      await shiftsAPI.open(parseFloat(opening) || 0);
      setOpening('');
      toast('success', 'Смена открыта');
      await refresh(); onChanged?.();
    } catch (e: any) {
      toast('error', e?.response?.data?.detail?.message || 'Ошибка');
    } finally { setOpeningBusy(false); }
  };

  const doClose = async () => {
    setClosing(true);
    try {
      const { data } = await shiftsAPI.close(counts, note.trim() || undefined);
      setResult(data.shift);
      setCounts(Object.fromEntries(DENOMS.map((d) => [String(d), 0])));
      setNote('');
      toast('success', 'Смена закрыта');
      await refresh(); onChanged?.();
    } catch (e: any) {
      toast('error', e?.response?.data?.detail?.message || 'Укажите причину расхождения');
    } finally { setClosing(false); }
  };

  if (loading) {
    return <div className="card" style={{ marginBottom: 20, textAlign: 'center', padding: 32 }}><Loader2 size={22} className="spinner" /></div>;
  }

  // ─── Результат закрытия ───
  if (result) {
    const diff = parseFloat(result.difference || '0');
    const color = diff === 0 ? '#22c55e' : diff > 0 ? '#f59e0b' : '#ef4444';
    const label = diff === 0 ? 'Касса сошлась' : diff > 0 ? 'Излишек' : 'Недостача';
    const Rrow = (k: string, v: string, c?: string, muted?: boolean) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid var(--border)' }}>
        <span style={{ color: muted ? 'var(--text3)' : 'var(--text2)', fontSize: 14 }}>{k}</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: c || 'var(--text)' }}>{v}</span>
      </div>
    );
    return (
      <div className="card" style={{ marginBottom: 20, borderColor: color + '55' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {diff === 0 ? <CheckCircle2 size={26} color={color} /> : <AlertTriangle size={26} color={color} />}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Смена закрыта</div>
            <span className="badge" style={{ background: color + '1A', color }}>{label}</span>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          {Rrow('Факт (пересчитано)', `${fmt(parseFloat(result.total_counted))} сом`)}
          {Rrow('Ожидалось', `${fmt(parseFloat(result.total_expected))} сом`)}
          {Rrow('Продажи за смену', `${fmt(parseFloat(result.cash_sales))} сом`, undefined, true)}
          {Rrow('Расхождение', `${diff > 0 ? '+' : ''}${fmt(diff)} сом`, color)}
          {Rrow('Эквивалент USD', `$${parseFloat(result.usd_equivalent).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, undefined, true)}
        </div>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => setResult(null)}>Готово</button>
      </div>
    );
  }

  // ─── Нет открытой смены ───
  if (!shift) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Unlock size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 16 }}>Открыть смену</span>
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>Введите наличные в кассе на начало смены</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Начальный остаток (сом)</label>
            <input className="input" style={{ width: 220, fontSize: 20, fontWeight: 700 }} type="number" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={doOpen} disabled={opening_busy} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44 }}>
            {opening_busy ? <Loader2 size={16} className="spinner" /> : <PlayCircle size={16} />} Открыть смену
          </button>
        </div>
      </div>
    );
  }

  // ─── Смена открыта: пересчёт и закрытие ───
  return (
    <div style={{ marginBottom: 20 }}>
      {/* Статус + итог */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div className="card" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', marginBottom: 8 }}>
            <Clock size={16} /> <span style={{ fontWeight: 700, fontSize: 14 }}>Смена открыта</span>
          </div>
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>Открыта: {dt(shift.opened_at)}</div>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Нач. остаток: <b style={{ color: 'var(--text)' }}>{fmt(parseFloat(shift.opening_balance || '0'))} сом</b></div>
        </div>
        <div className="card" style={{ borderColor: 'rgba(255,230,0,0.25)' }}>
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>Всего наличных (факт)</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)', letterSpacing: '-0.02em' }}>{fmt(total)} <span style={{ fontSize: 16, color: 'var(--text2)' }}>сом</span></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
            <span className="badge" style={{ background: 'rgba(124,111,255,0.14)', color: '#a99dff', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <DollarSign size={12} /> ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>{bills} купюр • курс {rate.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Купюры */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Banknote size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Пересчёт купюр</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {DENOMS.map((d) => {
            const qty = counts[String(d)] || 0;
            return (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', borderRadius: 12, padding: '8px 10px', border: '1px solid var(--border)' }}>
                <span style={{ width: 54, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.toLocaleString('ru-RU')}</span>
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>сом</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-secondary" style={{ padding: 0, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setQty(d, -1)}><Minus size={14} /></button>
                <input className="input" style={{ width: 56, textAlign: 'center', padding: '6px 4px' }} type="number" min={0} value={qty} onChange={(e) => setExact(d, e.target.value)} />
                <button className="btn btn-secondary" style={{ padding: 0, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setQty(d, 1)}><Plus size={14} /></button>
                <span style={{ width: 76, textAlign: 'right', color: 'var(--text2)', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(d * qty)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Комментарий + закрытие */}
      <div className="card">
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Комментарий (обязателен при расхождении)</label>
        <textarea className="input" style={{ width: '100%', minHeight: 56, marginBottom: 14 }} placeholder="Причина расхождения, если есть…" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-primary" onClick={doClose} disabled={closing || bills === 0} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', opacity: bills === 0 ? 0.5 : 1 }}>
          {closing ? <Loader2 size={16} className="spinner" /> : <Lock size={16} />} Закрыть смену
        </button>
      </div>
    </div>
  );
}
