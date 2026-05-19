'use client';
import { Users, XCircle, PlusCircle, MinusCircle, Pencil, Lock, Unlock, Filter, CheckSquare, Square, Coins } from 'lucide-react';
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800 }}>
          <Users size={24} /> Клиенты
          <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text2)', marginLeft: 8 }}>{total} всего</span>
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
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
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 300 }}
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
                    <button onClick={() => openModal('earn', c)} style={{ background: 'none', border: '1px solid #FFE600', color: '#FFE600', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><PlusCircle size={12} /> Бонус</button>
                    <button onClick={() => openModal('spend', c)} style={{ background: 'none', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><MinusCircle size={12} /> Списать</button>
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px' }}>
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px' }}>
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
    </div>
  );
}
