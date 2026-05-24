'use client';
import { Users, XCircle, PlusCircle, MinusCircle, Pencil, Lock, Unlock, Filter, CheckSquare, Square, Coins, Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2, Disc } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { customersAPI, adminAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';

const TIER_COLORS: Record<string, string> = {
  Bronze: '#cd7f32', Silver: '#b0b0b0', Gold: '#ffd700', Platinum: '#FFE600',
};
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];

export default function CustomersPage() {
  const { toast, confirm } = useToast();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Segment filters
  const [tierFilter, setTierFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkType, setBulkType] = useState<'earn' | 'spend'>('earn');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkNote, setBulkNote] = useState('');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'edit' | 'earn' | 'spend' | 'view'>('view');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({ full_name: '', phone: '', birth_date: '', amount: '', note: '' });

  const [tiers, setTiers] = useState<any[]>([]);

  // Import states
  const [importModal, setImportModal] = useState(false);
  const [debtModal, setDebtModal] = useState(false);
  const [debtData, setDebtData] = useState<any>(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    adminAPI.tiers().then(r => setTiers(r.data)).catch(() => {});
  }, []);

  const loadCustomers = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await customersAPI.list({
        search, page: p, limit,
        tier_name: tierFilter || undefined,
        is_active: activeFilter,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setCustomers(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setError('Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  }, [search, tierFilter, activeFilter, sortBy, sortDir, page]);

  const goToPage = (p: number) => { setPage(p); };

  useEffect(() => { loadCustomers(page); }, [page, tierFilter, activeFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(total / limit);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === customers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(customers.map(c => c.id)));
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const { data } = await customersAPI.importExcel(importFile);
      setImportResult(data);
      if (data.created > 0) loadCustomers(1);
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || err.response?.data?.detail || 'Import xatolik';
      setImportResult({ error: msg });
    } finally {
      setImportLoading(false);
    }
  };

  const openDebtModal = async (customer: any) => {
    setSelectedCustomer(customer);
    setDebtModal(true);
    setDebtLoading(true);
    try {
      const res = await customersAPI.getDebts(customer.id);
      setDebtData(res.data);
    } catch { setDebtData(null); }
    setDebtLoading(false);
  };

  const exportDebtsExcel = () => {
    if (!debtData || !debtData.debts.length) return;
    const rows = debtData.debts.map((d: any, i: number) => [
      i + 1, d.reference, d.total_amount, d.paid_amount, d.amount,
      d.overdue_days, d.status === 'paid' ? 'Погашена' : d.status === 'overdue' ? 'Просрочена' : 'Активная',
      d.percent_paid + '%', d.created_at ? new Date(d.created_at).toLocaleDateString('ru-RU') : '',
    ]);
    const header = ['#', 'Документ', 'Сумма', 'Оплачено', 'Остаток', 'Просрочка дн.', 'Статус', '% оплаты', 'Дата'];
    const csv = [header, ...rows].map(r => r.join('\t')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `debts_${selectedCustomer?.full_name || 'export'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const openModal = (type: any, customer: any) => {
    setModalType(type);
    setSelectedCustomer(customer);
    setFormData({ full_name: customer.full_name || '', phone: customer.phone || '', birth_date: customer.birth_date || '', amount: '', note: '' });
    setModalOpen(true);
  };

  const handleAction = async () => {
    if (modalType === 'earn' || modalType === 'spend') {
      const amt = Number(formData.amount);
      if (!amt || amt <= 0) { toast('warning', 'Введите сумму больше 0'); return; }
      if (!formData.note || formData.note.trim().length < 2) { toast('warning', 'Причина обязательна'); return; }
    }
    try {
      if (modalType === 'edit') {
        await customersAPI.update(selectedCustomer.id, {
          full_name: formData.full_name, phone: formData.phone,
          birth_date: formData.birth_date || null,
        });
      } else if (modalType === 'earn') {
        await customersAPI.adminEarn(selectedCustomer.id, Number(formData.amount), formData.note.trim());
      } else if (modalType === 'spend') {
        await customersAPI.adminSpend(selectedCustomer.id, Number(formData.amount), formData.note.trim());
      }
      toast('success', 'Операция выполнена');
      setModalOpen(false);
      loadCustomers(page);
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      const msg = typeof d === 'string' ? d : (d?.message || 'Ошибка');
      toast('error', msg);
    }
  };

  const handleBulkBonus = async () => {
    const amt = Number(bulkAmount);
    if (!amt || amt <= 0) { toast('warning', 'Введите сумму'); return; }
    if (!bulkNote || bulkNote.trim().length < 2) { toast('warning', 'Причина обязательна'); return; }
    if (selected.size === 0) { toast('warning', 'Выберите клиентов'); return; }
    if (!await confirm(`${bulkType === 'earn' ? 'Начислить' : 'Списать'} ${amt} KGS для ${selected.size} клиентов?`)) return;
    try {
      const { data } = await customersAPI.bulkBonus(Array.from(selected), bulkType, amt, bulkNote.trim());
      toast('success', data.message);
      setBulkModal(false);
      setBulkAmount('');
      setBulkNote('');
      setSelected(new Set());
      setBulkMode(false);
      loadCustomers(page);
    } catch (err: any) {
      toast('error', err?.response?.data?.detail?.message || 'Ошибка');
    }
  };

  const toggleActive = async (c: any) => {
    const action = c.is_active ? 'заблокировать' : 'разблокировать';
    if (!await confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} клиента «${c.full_name}»?`)) return;
    try {
      await customersAPI.update(c.id, { is_active: !c.is_active });
      loadCustomers(page);
    } catch (err: any) {
      toast('error', err?.response?.data?.detail?.message || 'Ошибка');
    }
  };

  const handleGiftSpin = async (c: any) => {
    if (!await confirm(`Подарить бесплатный спин колеса удачи клиенту «${c.full_name}»?`)) return;
    try {
      const { data } = await customersAPI.giftSpin(c.id);
      toast('success', data.message || 'Спин подарен');
    } catch (err: any) {
      toast('error', err?.response?.data?.detail?.message || 'Ошибка');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800 }}>
          <Users size={24} /> Клиенты
          <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text2)', marginLeft: 8 }}>{total} всего</span>
        </h1>
        <div className="btn-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => { setImportModal(true); setImportFile(null); setImportResult(null); }}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Upload size={14} /> Excel Import
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setBulkMode(!bulkMode); setSelected(new Set()); }}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <CheckSquare size={14} /> {bulkMode ? 'Отмена выбора' : 'Массовые действия'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowFilters(!showFilters)}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Filter size={14} /> Фильтры
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="filter-row" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 300, flex: 1, minWidth: 200 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по имени или телефону..."
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); loadCustomers(1); } }}
        />
        <button className="btn btn-primary" onClick={() => { setPage(1); loadCustomers(1); }} disabled={loading}>
          {loading ? 'Загрузка...' : 'Найти'}
        </button>
      </div>

      {/* Segment Filters */}
      {showFilters && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', padding: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Уровень</label>
            <select
              className="input"
              value={tierFilter}
              onChange={e => { setTierFilter(e.target.value); setPage(1); }}
              style={{ minWidth: 120 }}
            >
              <option value="">Все</option>
              {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Статус</label>
            <select
              className="input"
              value={activeFilter === null ? '' : String(activeFilter)}
              onChange={e => { setActiveFilter(e.target.value === '' ? null : e.target.value === 'true'); setPage(1); }}
              style={{ minWidth: 120 }}
            >
              <option value="">Все</option>
              <option value="true">Активные</option>
              <option value="false">Заблокированные</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Сортировка</label>
            <select
              className="input"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="created_at">По дате</option>
              <option value="balance">По балансу</option>
              <option value="full_name">По имени</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Направление</label>
            <select className="input" value={sortDir} onChange={e => setSortDir(e.target.value)} style={{ minWidth: 100 }}>
              <option value="desc">Убывание</option>
              <option value="asc">Возрастание</option>
            </select>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => { setTierFilter(''); setActiveFilter(null); setSortBy('created_at'); setSortDir('desc'); setPage(1); }}
            style={{ fontSize: 12, marginTop: 16 }}
          >
            Сбросить
          </button>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {bulkMode && selected.size > 0 && (
        <div style={{
          background: 'rgba(255,230,0,0.08)', border: '1px solid rgba(255,230,0,0.3)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
            Выбрано: {selected.size} клиентов
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              style={{ background: 'var(--accent)', color: '#000', fontSize: 12, padding: '6px 16px' }}
              onClick={() => { setBulkType('earn'); setBulkModal(true); }}
            >
              <PlusCircle size={14} style={{ marginRight: 4, display: 'inline' }} /> Начислить
            </button>
            <button
              className="btn"
              style={{ background: 'var(--danger)', color: '#fff', fontSize: 12, padding: '6px 16px' }}
              onClick={() => { setBulkType('spend'); setBulkModal(true); }}
            >
              <MinusCircle size={14} style={{ marginRight: 4, display: 'inline' }} /> Списать
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}><XCircle size={14} style={{ display: 'inline', marginRight: 4 }} /> {error}</div>}

      {/* Table */}
      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {bulkMode && (
                <th style={{ padding: '16px 8px 16px 16px', borderBottom: '1px solid #1c2a3a' }}>
                  <button onClick={toggleSelectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8899aa', padding: 0 }}>
                    {selected.size === customers.length && customers.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
              )}
              <th style={{ padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13 }}>#</th>
              <th style={{ padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13 }}>Имя</th>
              <th style={{ padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13 }}>Телефон</th>
              <th style={{ padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13 }}>Уровень</th>
              <th style={{ padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13 }}>Баланс</th>
              <th style={{ padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13, textAlign: 'right' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, idx) => (
              <tr key={c.id} style={{ background: selected.has(c.id) ? 'rgba(255,230,0,0.04)' : 'transparent' }}>
                {bulkMode && (
                  <td style={{ padding: '16px 8px 16px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <button onClick={() => toggleSelect(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: selected.has(c.id) ? 'var(--accent)' : '#8899aa', padding: 0 }}>
                      {selected.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </td>
                )}
                <td style={{ padding: '16px', color: '#e2eaf6', borderBottom: '1px solid #1c2a3a', fontSize: 14 }}>{(page - 1) * limit + idx + 1}</td>
                <td style={{ padding: '16px', color: '#e2eaf6', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 600 }}>{c.full_name}</td>
                <td style={{ padding: '16px', color: '#e2eaf6', borderBottom: '1px solid #1c2a3a', fontSize: 14 }}>{c.phone}</td>
                <td style={{ padding: '16px', borderBottom: '1px solid #1c2a3a', fontSize: 14 }}>
                  <span style={{
                    backgroundColor: `${TIER_COLORS[c.tier_name] || '#FFE600'}20`,
                    color: TIER_COLORS[c.tier_name] || '#FFE600',
                    padding: '4px 10px', borderRadius: '100px', fontSize: 12, fontWeight: 700,
                  }}>
                    {c.tier_name}
                  </span>
                </td>
                <td style={{ padding: '16px', color: '#FFE600', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 700 }}>
                  {Number(c.balance).toLocaleString('ru-RU')} KGS
                  {c.is_active === false && (
                    <span style={{ display: 'block', fontSize: 10, color: '#ff4d4d', fontWeight: 600, marginTop: 2 }}>Заблокирован</span>
                  )}
                </td>
                <td style={{ padding: '16px', borderBottom: '1px solid #1c2a3a', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button onClick={() => openModal('edit', c)} style={{ background: 'none', border: '1px solid #1c2a3a', color: '#8899aa', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Pencil size={12} /> Изм.</button>
                    <button onClick={() => openDebtModal(c)} style={{ background: 'none', border: '1px solid #f59e0b', color: '#f59e0b', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={12} /> Долги</button>
                    <button onClick={() => openModal('earn', c)} style={{ background: 'none', border: '1px solid #FFE600', color: '#FFE600', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><PlusCircle size={12} /> Бонус</button>
                    <button onClick={() => openModal('spend', c)} style={{ background: 'none', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><MinusCircle size={12} /> Списать</button>
                    <button onClick={() => handleGiftSpin(c)} style={{ background: 'none', border: '1px solid #c084fc', color: '#c084fc', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Disc size={12} /> Спин</button>
                    <button onClick={() => toggleActive(c)} style={{ background: 'none', border: '1px solid ' + (c.is_active === false ? '#22c55e' : '#f59e0b'), color: c.is_active === false ? '#22c55e' : '#f59e0b', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {c.is_active === false ? <><Unlock size={12} /> Разблок.</> : <><Lock size={12} /> Блокир.</>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && !loading && (
              <tr>
                <td colSpan={bulkMode ? 7 : 6} style={{ padding: '32px', textAlign: 'center', color: '#8899aa' }}>Клиенты не найдены</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 13, color: '#8899aa' }}>
            Показано {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Назад</button>
            <span style={{ padding: '10px 16px', color: 'var(--text2)', fontSize: 13 }}>{page} / {totalPages}</span>
            <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>Далее →</button>
          </div>
        </div>
      )}

      {/* Individual Modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} className="modal-overlay">
          <div className="modal-content" style={{ background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: '#e2eaf6', display: 'flex', alignItems: 'center', gap: 8 }}>
              {modalType === 'edit' ? <><Pencil size={18} /> Редактирование</> :
               modalType === 'earn' ? <><PlusCircle size={18} /> Начисление бонуса</> :
               <><MinusCircle size={18} /> Списание бонуса</>}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {modalType === 'edit' ? (
                <>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 8 }}>ФИО</label><input className="input" style={{ width: '100%' }} value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 8 }}>Телефон</label><input className="input" style={{ width: '100%' }} value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 8 }}>Дата рождения</label><input className="input" style={{ width: '100%' }} type="date" value={formData.birth_date} onChange={e => setFormData({ ...formData, birth_date: e.target.value })} /></div>
                </>
              ) : (
                <>
                  <div style={{ background: '#1c2a3a', padding: 12, borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: '#8899aa' }}>Клиент:</div>
                    <div style={{ fontWeight: 700, color: '#e2eaf6' }}>{selectedCustomer.full_name}</div>
                  </div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 8 }}>Сумма (KGS)</label><input className="input" style={{ width: '100%', fontSize: 20, color: '#FFE600', fontWeight: 700 }} type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0" /></div>
                  <div><label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 8 }}>Причина *</label><textarea className="input" style={{ width: '100%', minHeight: 80 }} value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} placeholder="Причина корректировки" /></div>
                </>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <button className="btn" style={{ flex: 1, background: '#1c2a3a', color: '#e2eaf6' }} onClick={() => setModalOpen(false)}>Отмена</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAction}>Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Bonus Modal */}
      {bulkModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} className="modal-overlay">
          <div className="modal-content" style={{ background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: '#e2eaf6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Coins size={18} /> Массовое {bulkType === 'earn' ? 'начисление' : 'списание'}
            </h2>
            <div style={{ background: '#1c2a3a', padding: 12, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#8899aa' }}>Выбрано клиентов:</div>
              <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 20 }}>{selected.size}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div><label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 8 }}>Сумма (KGS) каждому</label><input className="input" style={{ width: '100%', fontSize: 20, color: '#FFE600', fontWeight: 700 }} type="number" value={bulkAmount} onChange={e => setBulkAmount(e.target.value)} placeholder="0" /></div>
              <div><label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 8 }}>Причина *</label><textarea className="input" style={{ width: '100%', minHeight: 80 }} value={bulkNote} onChange={e => setBulkNote(e.target.value)} placeholder="Причина массовой операции" /></div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <button className="btn" style={{ flex: 1, background: '#1c2a3a', color: '#e2eaf6' }} onClick={() => setBulkModal(false)}>Отмена</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleBulkBonus}>
                  {bulkType === 'earn' ? 'Начислить' : 'Списать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Debt Modal */}
      {debtModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2eaf6', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <FileText size={18} /> Долги / Рассрочки
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {debtData?.debts?.length > 0 && (
                  <button onClick={exportDebtsExcel} style={{ background: 'none', border: '1px solid #22c55e', color: '#22c55e', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: 12 }}>
                    Excel
                  </button>
                )}
                <button onClick={() => setDebtModal(false)} style={{ background: 'none', border: '1px solid #1c2a3a', color: '#8899aa', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: 12 }}>
                  Закрыть
                </button>
              </div>
            </div>

            {/* Customer info */}
            <div style={{ background: '#1c2a3a', padding: 12, borderRadius: 12, marginBottom: 16 }}>
              <span style={{ fontWeight: 700, color: '#e2eaf6' }}>{selectedCustomer?.full_name}</span>
              <span style={{ color: '#8899aa', marginLeft: 12 }}>{selectedCustomer?.phone}</span>
            </div>

            {debtLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8899aa' }}>Загрузка...</div>
            ) : !debtData || debtData.count === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8899aa' }}>Нет долгов / рассрочек</div>
            ) : (
              <>
                {/* Summary stats */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <div style={{ flex: 1, background: '#1c2a3a', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase' }}>Общий долг</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#ff4d4d' }}>{debtData.total_debt.toLocaleString('ru-RU')}</div>
                  </div>
                  <div style={{ flex: 1, background: '#1c2a3a', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase' }}>Оплачено</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>{debtData.total_paid.toLocaleString('ru-RU')}</div>
                  </div>
                  <div style={{ flex: 1, background: '#1c2a3a', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase' }}>Рассрочек</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#e2eaf6' }}>{debtData.count}</div>
                  </div>
                  {debtData.overdue_count > 0 && (
                    <div style={{ flex: 1, background: 'rgba(255,77,77,0.1)', borderRadius: 12, padding: '10px 12px', textAlign: 'center', border: '1px solid rgba(255,77,77,0.3)' }}>
                      <div style={{ fontSize: 10, color: '#ff4d4d', textTransform: 'uppercase' }}>Просрочено</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#ff4d4d' }}>{debtData.overdue_count}</div>
                    </div>
                  )}
                </div>

                {/* Debts table */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1c2a3a' }}>
                      <th style={{ padding: '8px', textAlign: 'left', fontSize: 11, color: '#8899aa', textTransform: 'uppercase' }}>Документ</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: 11, color: '#8899aa' }}>Сумма</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: 11, color: '#8899aa' }}>Оплачено</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: 11, color: '#8899aa' }}>Остаток</th>
                      <th style={{ padding: '8px', textAlign: 'center', fontSize: 11, color: '#8899aa' }}>Прогресс</th>
                      <th style={{ padding: '8px', textAlign: 'center', fontSize: 11, color: '#8899aa' }}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtData.debts.map((d: any) => {
                      const refShort = d.reference.includes('00ЦБ-')
                        ? d.reference.match(/00ЦБ-\d+/)?.[0] || d.reference.slice(0, 20)
                        : d.reference.slice(0, 25);
                      return (
                        <tr key={d.id} style={{ borderBottom: '1px solid #1c2a3a' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2eaf6' }}>{refShort}</div>
                            <div style={{ fontSize: 10, color: '#8899aa' }}>
                              {d.created_at ? new Date(d.created_at).toLocaleDateString('ru-RU') : ''}
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13, color: '#e2eaf6' }}>
                            {d.total_amount.toLocaleString('ru-RU')}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
                            {d.paid_amount.toLocaleString('ru-RU')}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13, color: d.overdue_days > 0 ? '#ff4d4d' : '#e2eaf6', fontWeight: 700 }}>
                            {d.amount.toLocaleString('ru-RU')}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                              <div style={{ width: 60, height: 6, background: '#1c2a3a', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: d.percent_paid + '%', background: d.status === 'paid' ? '#22c55e' : '#FFE600', borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, color: '#8899aa' }}>{d.percent_paid}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            {d.status === 'paid' ? (
                              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 600 }}>Погашена</span>
                            ) : d.overdue_days > 0 ? (
                              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: 'rgba(255,77,77,0.15)', color: '#ff4d4d', fontWeight: 600 }}>
                                <AlertTriangle size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{d.overdue_days} дн.
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: 'rgba(255,230,0,0.1)', color: '#FFE600', fontWeight: 600 }}>Активная</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Sync info */}
                {debtData.debts[0]?.synced_at && (
                  <div style={{ marginTop: 12, fontSize: 11, color: '#8899aa', textAlign: 'right' }}>
                    Последняя синхр.: {new Date(debtData.debts[0].synced_at).toLocaleString('ru-RU')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} className="modal-overlay">
          <div className="modal-content" style={{ background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '500px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={() => setImportModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#e2eaf6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={20} /> Excel dan import
            </h2>
            <p style={{ fontSize: 13, color: '#8899aa', marginBottom: 24 }}>
              Клиенты из Excel файла будут автоматически зарегистрированы. QR-код и реферальный код создаются автоматически.
            </p>

            {!importResult ? (
              <>
                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setImportFile(f); }}
                  onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls'; inp.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }; inp.click(); }}
                  style={{
                    border: `2px dashed ${dragOver ? 'var(--accent)' : '#1e293b'}`,
                    borderRadius: 16, padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
                    background: dragOver ? 'rgba(255,230,0,0.05)' : 'transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  {importFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <FileSpreadsheet size={24} color="#22c55e" />
                      <div>
                        <div style={{ fontWeight: 700, color: '#e2eaf6' }}>{importFile.name}</div>
                        <div style={{ fontSize: 12, color: '#8899aa' }}>{(importFile.size / 1024).toFixed(1)} KB</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload size={32} color="#64748b" style={{ marginBottom: 12 }} />
                      <div style={{ color: '#8899aa', fontSize: 14 }}>Перетащите файл сюда или нажмите</div>
                      <div style={{ color: '#556677', fontSize: 12, marginTop: 6 }}>.xlsx format</div>
                    </>
                  )}
                </div>

                {/* Format hint */}
                <div style={{ background: '#141c2b', borderRadius: 12, padding: '12px 16px', marginTop: 16, fontSize: 12, color: '#8899aa' }}>
                  <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Ожидаемый формат:</div>
                  <div>1-й столбец: ФИО (имя и фамилия)</div>
                  <div>2-й столбец: Номер телефона (0555123456 или +996555123456)</div>
                  <div style={{ marginTop: 4, color: '#556677' }}>Строка заголовка пропускается автоматически. Столбец с порядковым номером также поддерживается.</div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button className="btn" style={{ flex: 1, background: '#1c2a3a', color: '#e2eaf6' }} onClick={() => setImportModal(false)}>Отмена</button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, opacity: !importFile || importLoading ? 0.5 : 1 }}
                    disabled={!importFile || importLoading}
                    onClick={handleImport}
                  >
                    {importLoading ? 'Загрузка...' : 'Импортировать'}
                  </button>
                </div>
              </>
            ) : importResult.error ? (
              /* Error result */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
                  <AlertTriangle size={20} color="#ef4444" />
                  <div style={{ color: '#ef4444', fontWeight: 600 }}>{importResult.error}</div>
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setImportResult(null); setImportFile(null); }}>Попробовать снова</button>
              </div>
            ) : (
              /* Success result */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(34,197,94,0.1)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
                  <CheckCircle2 size={20} color="#22c55e" />
                  <div style={{ color: '#22c55e', fontWeight: 700 }}>{importResult.message}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div style={{ background: '#141c2b', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{importResult.created}</div>
                    <div style={{ fontSize: 11, color: '#8899aa' }}>Добавлено</div>
                  </div>
                  <div style={{ background: '#141c2b', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{importResult.skipped}</div>
                    <div style={{ fontSize: 11, color: '#8899aa' }}>Дубликат</div>
                  </div>
                  <div style={{ background: '#141c2b', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444' }}>{importResult.errors_count}</div>
                    <div style={{ fontSize: 11, color: '#8899aa' }}>Ошибки</div>
                  </div>
                </div>
                {importResult.errors?.length > 0 && (
                  <div style={{ maxHeight: 150, overflowY: 'auto', background: '#141c2b', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                    {importResult.errors.map((err: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: '#ef4444', padding: '4px 0', borderBottom: '1px solid #1c2a3a' }}>
                        Строка {err.row}: {err.reason} — {err.data}
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setImportModal(false)}>Закрыть</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
