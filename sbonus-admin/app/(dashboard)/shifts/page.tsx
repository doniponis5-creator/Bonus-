'use client';
import { Wallet, Loader2, FileText, BarChart2, Pencil, X, Save, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { shiftsAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';
import ShiftPanel from '@/components/ShiftPanel';

const DENOMS = [5000, 2000, 1000, 500, 200, 100, 50, 20];
const money = (v: any) => (v === null || v === undefined || v === '') ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const dt = (s?: string) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function diffColor(d: any): string {
  const n = Number(d);
  if (!d && d !== 0) return 'var(--text2)';
  if (n === 0) return '#22c55e';
  return n > 0 ? '#f59e0b' : '#ef4444';
}

export default function ShiftsPage() {
  const { toast, confirm } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const [status, setStatus] = useState('');
  const [onlyDisc, setOnlyDisc] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [rate, setRate] = useState('');
  const [threshold, setThreshold] = useState('');
  const [savingCfg, setSavingCfg] = useState(false);

  const [edit, setEdit] = useState<any>(null);
  const [editDenoms, setEditDenoms] = useState<Record<string, number>>({});
  const [editNote, setEditNote] = useState('');
  const [editOpening, setEditOpening] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const perPage = 50;

  const params = () => ({
    status: status || undefined,
    only_discrepancy: onlyDisc || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });

  const load = async (p = page) => {
    setLoading(true);
    try {
      const { data } = await shiftsAPI.list({ ...params(), page: p, per_page: perPage });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { setItems([]); } finally { setLoading(false); }
  };

  const loadStats = async () => {
    try {
      const { data } = await shiftsAPI.stats({ date_from: dateFrom || undefined, date_to: dateTo || undefined });
      setStats(data);
    } catch { setStats(null); }
  };

  const loadConfig = async () => {
    try {
      const { data } = await shiftsAPI.config();
      setRate(data.usd_rate); setThreshold(data.alert_threshold);
    } catch {}
  };

  useEffect(() => { loadConfig(); }, []);
  useEffect(() => { setPage(1); load(1); loadStats(); }, [status, onlyDisc, dateFrom, dateTo]);
  useEffect(() => { if (page > 1) load(page); }, [page]);

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      await shiftsAPI.saveConfig(parseFloat(rate), parseFloat(threshold));
      toast('success', 'Настройки сохранены');
    } catch (e: any) {
      toast('error', e?.response?.data?.detail?.message || 'Ошибка сохранения');
    } finally { setSavingCfg(false); }
  };

  const exportFile = async (fmt: 'csv' | 'xlsx') => {
    try {
      const { data } = await shiftsAPI.export(fmt, params());
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a'); a.href = url; a.download = `shifts.${fmt}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast('error', 'Ошибка экспорта'); }
  };

  const openEdit = (s: any) => {
    setEdit(s);
    const d: Record<string, number> = {};
    DENOMS.forEach((x) => { d[String(x)] = s.denominations?.[String(x)] || 0; });
    setEditDenoms(d);
    setEditNote(s.note || '');
    setEditOpening(s.opening_balance || '');
  };

  const editTotal = DENOMS.reduce((acc, d) => acc + d * (editDenoms[String(d)] || 0), 0);

  const saveEdit = async () => {
    if (!await confirm('Сохранить изменения смены? Действие будет записано в журнал аудита.')) return;
    setSavingEdit(true);
    try {
      await shiftsAPI.edit(edit.id, {
        denominations: editDenoms,
        opening_balance: editOpening !== '' ? parseFloat(editOpening) : undefined,
        note: editNote,
      });
      toast('success', 'Смена обновлена');
      setEdit(null);
      load(page); loadStats();
    } catch (e: any) {
      toast('error', e?.response?.data?.detail?.message || 'Ошибка');
    } finally { setSavingEdit(false); }
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700 }}><Wallet size={24} /> Смены / Инкассация</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Всего смен: {total.toLocaleString('ru-RU')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => exportFile('csv')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={16} /> CSV</button>
          <button className="btn btn-secondary" onClick={() => exportFile('xlsx')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart2 size={16} /> Excel</button>
        </div>
      </div>

      <ShiftPanel onChanged={() => { load(page); loadStats(); }} />

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-label">Закрыто смен</div><div className="stat-value">{stats.closed_shifts}</div></div>
          <div className="stat-card"><div className="stat-label">С расхождением</div><div className="stat-value" style={{ color: stats.discrepancy_count > 0 ? '#f59e0b' : undefined }}>{stats.discrepancy_count}</div></div>
          <div className="stat-card"><div className="stat-label">Недостача, сом</div><div className="stat-value" style={{ color: '#ef4444' }}>{money(stats.total_shortage)}</div></div>
          <div className="stat-card"><div className="stat-label">Излишек, сом</div><div className="stat-value" style={{ color: '#f59e0b' }}>+{money(stats.total_surplus)}</div></div>
        </div>
      )}

      {/* Config */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Settings2 size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Настройки</span>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Курс USD (сом за $1)</label>
            <input className="input" style={{ width: 160 }} type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Порог алерта, сом</label>
            <input className="input" style={{ width: 160 }} type="number" step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={saveConfig} disabled={savingCfg} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {savingCfg ? <Loader2 size={16} className="spinner" /> : <Save size={16} />} Сохранить
          </button>
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 12, marginTop: 10 }}>При расхождении ≥ порога админам уходит WhatsApp-уведомление.</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select className="input" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="open">Открытые</option>
          <option value="closed">Закрытые</option>
        </select>
        <input className="input" type="date" style={{ width: 160 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="input" type="date" style={{ width: 160 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyDisc} onChange={(e) => setOnlyDisc(e.target.checked)} /> Только расхождения
        </label>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spinner" /></div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Нет данных</div>
        ) : (
          <table className="table" style={{ width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th>Открыта</th><th>Кассир</th><th>Филиал</th><th>Статус</th>
                <th style={{ textAlign: 'right' }}>Ожидалось</th>
                <th style={{ textAlign: 'right' }}>Факт</th>
                <th style={{ textAlign: 'right' }}>Расхождение</th>
                <th style={{ textAlign: 'right' }}>USD</th>
                <th>Причина</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dt(s.opened_at)}</td>
                  <td>{s.cashier_name || '—'}</td>
                  <td>{s.branch_name || '—'}</td>
                  <td>
                    <span className="badge" style={{ background: s.status === 'open' ? 'rgba(255,230,0,0.12)' : 'rgba(34,197,94,0.12)', color: s.status === 'open' ? '#FFE600' : '#22c55e' }}>
                      {s.status === 'open' ? 'Открыта' : 'Закрыта'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{money(s.total_expected)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(s.total_counted)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: diffColor(s.difference) }}>
                    {s.difference && Number(s.difference) > 0 ? '+' : ''}{money(s.difference)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{s.usd_equivalent ? '$' + money(s.usd_equivalent) : '—'}</td>
                  <td style={{ maxWidth: 200, color: 'var(--text2)', fontSize: 12 }}>{s.note || '—'}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => openEdit(s)} title="Править"><Pencil size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          <span style={{ alignSelf: 'center', color: 'var(--text2)', fontSize: 13 }}>{page} / {totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}

      {/* Edit modal */}
      {edit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={() => setEdit(null)}>
          <div className="card" style={{ width: 460, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Правка смены</h2>
              <button className="btn btn-secondary" style={{ padding: 6 }} onClick={() => setEdit(null)}><X size={16} /></button>
            </div>
            <p style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 16 }}>{edit.cashier_name} • {dt(edit.opened_at)}</p>

            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Начальный остаток</label>
            <input className="input" style={{ width: '100%', marginBottom: 16 }} type="number" value={editOpening} onChange={(e) => setEditOpening(e.target.value)} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {DENOMS.map((d) => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 56, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.toLocaleString('ru-RU')}</span>
                  <input className="input" style={{ flex: 1 }} type="number" min={0} value={editDenoms[String(d)] || 0}
                    onChange={(e) => setEditDenoms((p) => ({ ...p, [String(d)]: Math.max(0, parseInt(e.target.value) || 0) }))} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)', marginBottom: 12 }}>
              <span style={{ color: 'var(--text2)' }}>Итог (факт)</span>
              <span style={{ fontWeight: 800 }}>{editTotal.toLocaleString('ru-RU')} сом</span>
            </div>

            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Причина / комментарий</label>
            <textarea className="input" style={{ width: '100%', minHeight: 64, marginBottom: 16 }} value={editNote} onChange={(e) => setEditNote(e.target.value)} />

            <button className="btn btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }} onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2 size={16} className="spinner" /> : <Save size={16} />} Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
