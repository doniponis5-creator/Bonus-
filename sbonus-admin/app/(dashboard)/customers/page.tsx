'use client';
import { Users, XCircle, PlusCircle, MinusCircle, Pencil, Lock, Unlock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { customersAPI } from '@/lib/api';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'edit' | 'earn' | 'spend' | 'view'>('view');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  // Form states
  const [formData, setFormData] = useState({ full_name: '', phone: '', birth_date: '', amount: '', note: '' });

  const loadCustomers = async (p = page, q = search) => {
    setLoading(true); setError('');
    try {
      const { data } = await customersAPI.list(q, p, limit);
      setCustomers(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setError('Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (p: number) => { setPage(p); loadCustomers(p); };

  useEffect(() => { loadCustomers(1); setPage(1); }, []);

  const totalPages = Math.ceil(total / limit);

  const openModal = (type: any, customer: any) => {
    setModalType(type);
    setSelectedCustomer(customer);
    setFormData({
      full_name: customer.full_name || '',
      phone: customer.phone || '',
      birth_date: customer.birth_date || '',
      amount: '',
      note: ''
    });
    setModalOpen(true);
  };

  const handleAction = async () => {
    try {
      if (modalType === 'edit') {
        await customersAPI.update(selectedCustomer.id, {
          full_name: formData.full_name,
          phone: formData.phone,
          birth_date: formData.birth_date || null
        });
      } else if (modalType === 'earn') {
        await customersAPI.adminEarn(selectedCustomer.id, Number(formData.amount), formData.note);
      } else if (modalType === 'spend') {
        await customersAPI.adminSpend(selectedCustomer.id, Number(formData.amount), formData.note);
      }
      setModalOpen(false);
      loadCustomers(page);
    } catch (err: any) {
      alert(err?.response?.data?.detail?.message || 'Ошибка выполнения операции');
    }
  };

  const toggleActive = async (c: any) => {
    const action = c.is_active ? 'заблокировать' : 'разблокировать';
    if (!confirm(`Вы уверены что хотите ${action} клиента «${c.full_name}»?`)) return;
    try {
      await customersAPI.update(c.id, { is_active: !c.is_active });
      loadCustomers(page);
    } catch (err: any) {
      alert(err?.response?.data?.detail?.message || 'Ошибка');
    }
  };

  const TIER_COLORS: Record<string,string> = { 
    Bronze:'#cd7f32', 
    Silver:'#b0b0b0', 
    Gold:'#ffd700', 
    Platinum:'#00e5a0' 
  };

  return (
    <div>
      <h1 style={{display: 'flex', alignItems: 'center', gap: 8, fontSize:24,fontWeight:800,marginBottom:24}}><Users size={24} /> Клиенты</h1>
      
      <div style={{display:'flex',gap:12,marginBottom:24}}>
        <input 
          className="input" 
          style={{maxWidth:300}} 
          value={search} 
          onChange={e=>setSearch(e.target.value)} 
          placeholder="Поиск по имени или телефону..." 
          onKeyDown={e => e.key === 'Enter' && goToPage(1)}
        />
        <button className="btn btn-primary" onClick={() => goToPage(1)} disabled={loading}>
          {loading ? 'Загрузка...' : 'Найти'}
        </button>
      </div>

      {error && <div style={{color:'var(--danger)',marginBottom:16}}><XCircle size={14} style={{display:'inline',marginRight:4}} /> {error}</div>}

      <div style={{overflowX:'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '16px'}}>
        <table style={{width:'100%', borderCollapse: 'collapse', textAlign: 'left'}}>
          <thead>
            <tr>
              <th style={{padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13}}>#</th>
              <th style={{padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13}}>Имя</th>
              <th style={{padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13}}>Телефон</th>
              <th style={{padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13}}>Уровень</th>
              <th style={{padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13}}>Баланс</th>
              <th style={{padding: '16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 13, textAlign: 'right'}}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, idx) => (
              <tr key={c.id}>
                <td style={{padding: '16px', color: '#e2eaf6', borderBottom: '1px solid #1c2a3a', fontSize: 14}}>{idx + 1}</td>
                <td style={{padding: '16px', color: '#e2eaf6', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 600}}>{c.full_name}</td>
                <td style={{padding: '16px', color: '#e2eaf6', borderBottom: '1px solid #1c2a3a', fontSize: 14}}>{c.phone}</td>
                <td style={{padding: '16px', color: '#e2eaf6', borderBottom: '1px solid #1c2a3a', fontSize: 14}}>
                  <span style={{
                    backgroundColor: `${TIER_COLORS[c.tier_name] || '#00e5a0'}20`, 
                    color: TIER_COLORS[c.tier_name] || '#00e5a0',
                    padding: '4px 10px',
                    borderRadius: '100px',
                    fontSize: 12,
                    fontWeight: 700
                  }}>
                    {c.tier_name}
                  </span>
                </td>
                <td style={{padding: '16px', color: '#00e5a0', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 700}}>
                  {Number(c.balance).toLocaleString('ru-RU')} KGS
                  {c.is_active === false && (
                    <span style={{ display: 'block', fontSize: 10, color: '#ff4d4d', fontWeight: 600, marginTop: 2 }}>Заблокирован</span>
                  )}
                </td>
                <td style={{padding: '16px', borderBottom: '1px solid #1c2a3a', textAlign: 'right'}}>
                  <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap'}}>
                    <button onClick={() => openModal('edit', c)} style={{background: 'none', border: '1px solid #1c2a3a', color: '#8899aa', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4}}><Pencil size={12} /> Изм.</button>
                    <button onClick={() => openModal('earn', c)} style={{background: 'none', border: '1px solid #00e5a0', color: '#00e5a0', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4}}><PlusCircle size={12} /> Бонус</button>
                    <button onClick={() => openModal('spend', c)} style={{background: 'none', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4}}><MinusCircle size={12} /> Списать</button>
                    <button onClick={() => toggleActive(c)} style={{background: 'none', border: '1px solid ' + (c.is_active === false ? '#00e5a0' : '#f59e0b'), color: c.is_active === false ? '#00e5a0' : '#f59e0b', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4}}>
                      {c.is_active === false ? <><Unlock size={12} /> Разблок.</> : <><Lock size={12} /> Блокир.</>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{padding: '32px', textAlign: 'center', color: '#8899aa'}}>Клиенты не найдены</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
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

      {/* MODAL */}
      {modalOpen && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000}}>
          <div style={{background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px'}}>
            <h2 style={{fontSize: 20, fontWeight: 700, marginBottom: 24, color: '#e2eaf6', display: 'flex', alignItems: 'center', gap: 8}}>
              {modalType === 'edit' ? <><Pencil size={18} /> Редактирование клиента</> :
               modalType === 'earn' ? <><PlusCircle size={18} /> Начисление бонуса</> :
               <><MinusCircle size={18} /> Списание бонуса</>}
            </h2>
            
            <div style={{display:'flex', flexDirection:'column', gap: 16}}>
              {modalType === 'edit' ? (
                <>
                  <div>
                    <label style={{display:'block', fontSize: 12, color: '#8899aa', marginBottom: 8}}>ФИО</label>
                    <input className="input" style={{width:'100%'}} value={formData.full_name} onChange={e=>setFormData({...formData, full_name: e.target.value})} />
                  </div>
                  <div>
                    <label style={{display:'block', fontSize: 12, color: '#8899aa', marginBottom: 8}}>Телефон</label>
                    <input className="input" style={{width:'100%'}} value={formData.phone} onChange={e=>setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div>
                    <label style={{display:'block', fontSize: 12, color: '#8899aa', marginBottom: 8}}>Дата рождения</label>
                    <input className="input" style={{width:'100%'}} type="date" value={formData.birth_date} onChange={e=>setFormData({...formData, birth_date: e.target.value})} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{background: '#1c2a3a', padding: 12, borderRadius: 12, marginBottom: 8}}>
                    <div style={{fontSize: 12, color: '#8899aa'}}>Клиент:</div>
                    <div style={{fontWeight: 700, color: '#e2eaf6'}}>{selectedCustomer.full_name}</div>
                  </div>
                  <div>
                    <label style={{display:'block', fontSize: 12, color: '#8899aa', marginBottom: 8}}>Сумма бонусов (KGS)</label>
                    <input className="input" style={{width:'100%', fontSize: 20, color: '#00e5a0', fontWeight: 700}} type="number" value={formData.amount} onChange={e=>setFormData({...formData, amount: e.target.value})} placeholder="0" />
                  </div>
                  <div>
                    <label style={{display:'block', fontSize: 12, color: '#8899aa', marginBottom: 8}}>Причина (обязательно)</label>
                    <textarea className="input" style={{width:'100%', minHeight: 80}} value={formData.note} onChange={e=>setFormData({...formData, note: e.target.value})} placeholder="Напр: Корректировка баланса" />
                  </div>
                </>
              )}
              
              <div style={{display:'flex', gap: 12, marginTop: 12}}>
                <button className="btn" style={{flex:1, background: '#1c2a3a', color: '#e2eaf6'}} onClick={() => setModalOpen(false)}>Отмена</button>
                <button className="btn btn-primary" style={{flex:1}} onClick={handleAction} disabled={ (modalType !== 'edit' && (!formData.amount || !formData.note)) }>Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
