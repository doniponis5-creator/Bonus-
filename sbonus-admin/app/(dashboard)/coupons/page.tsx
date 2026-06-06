'use client';
import { Tag, Loader2, XCircle, Plus, CheckCircle2, Trash2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminAPI, customersAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';

export default function CouponsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const { toast, confirm } = useToast();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Customer search for personal coupons
  const [custSearch, setCustSearch] = useState('');
  const [custResults, setCustResults] = useState<any[]>([]);
  const [custSearching, setCustSearching] = useState(false);
  const [selectedCust, setSelectedCust] = useState<{ id: string; name: string; phone: string } | null>(null);

  const limit = 50;

  const load = async (p = page) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.coupons(p, limit);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  const handleDelete = async (id: string) => {
    if (!await confirm('Деактивировать купон?')) return;
    setDeleting(id);
    try {
      await adminAPI.deleteCoupon(id);
      toast('success', 'Купон деактивирован');
      load(page);
    } catch { toast('error', 'Ошибка'); } finally {
      setDeleting(null);
    }
  };

  const searchCustomers = async (q: string) => {
    setCustSearch(q);
    if (q.length < 2) { setCustResults([]); return; }
    setCustSearching(true);
    try {
      const { data } = await customersAPI.list({ search: q, limit: 8 });
      setCustResults(data.items || []);
    } catch {
      setCustResults([]);
    } finally {
      setCustSearching(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800, marginBottom: 24, flexWrap: 'wrap' as any }}>
        <Tag size={24} /> Купоны
      </h1>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16, marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Код', 'Название', 'Клиент', 'Бонус', 'Мин. покупка', 'Статус', 'Истекает', 'Создан', ''].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>
                <Loader2 className="animate-spin" style={{ marginRight: 8, display: 'inline' }} size={16} /> Загрузка...
              </td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Купонов нет</td></tr>
            )}
            {!loading && items.map(c => {
              const expired = c.expires_at && new Date(c.expires_at) < new Date();
              const inactive = !c.is_active || c.is_used || expired;
              return (
                <tr key={c.id}>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#FFE600' }}>
                    {c.code}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#e2eaf6', fontWeight: 600 }}>
                    {c.title}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: c.customer_id ? '#60a5fa' : '#8899aa' }}>
                    {c.customer_name}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 700, color: '#22c55e' }}>
                    +{Number(c.bonus_amount).toLocaleString('ru-RU')} сом
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>
                    {Number(c.min_purchase) > 0 ? `${Number(c.min_purchase).toLocaleString('ru-RU')} сом` : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <span style={{
                      background: c.is_used ? '#60a5fa18' : inactive ? '#ff4d4d18' : '#22c55e18',
                      color: c.is_used ? '#60a5fa' : inactive ? '#ff4d4d' : '#22c55e',
                      padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                    }}>
                      {c.is_used ? 'Использован' : expired ? 'Истёк' : c.is_active ? 'Активен' : 'Отключён'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                    {new Date(c.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    {c.is_active && !c.is_used && (
                      <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4d4d', opacity: deleting === c.id ? 0.4 : 0.7, padding: 4 }}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 32 }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Назад</button>
          <span style={{ padding: '10px 16px', color: 'var(--text2)', fontSize: 13 }}>{page} / {totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Далее →</button>
        </div>
      )}

      {/* Create form */}
      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
          <Plus size={16} /> Создать купон
        </h3>
        <form
          onSubmit={async e => {
            e.preventDefault();
            setSaving(true); setMsg('');
            const fd = new FormData(e.currentTarget);
            try {
              await adminAPI.createCoupon({
                title: fd.get('title') as string,
                description: (fd.get('description') as string) || undefined,
                bonus_amount: Number(fd.get('bonus_amount')),
                min_purchase: Number(fd.get('min_purchase') || 0),
                customer_id: selectedCust?.id || null,
                expires_at: (fd.get('expires_at') as string) || null,
              });
              setMsg('success:Купон создан и отправлен клиенту!');
              (e.target as HTMLFormElement).reset();
              setSelectedCust(null);
              setCustSearch('');
              load(1); setPage(1);
            } catch (er: any) {
              setMsg('error:' + (er?.response?.data?.detail?.message || er?.response?.data?.detail || 'Ошибка'));
            } finally {
              setSaving(false);
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Название купона *</label>
            <input className="input" name="title" placeholder="Скидка на весеннюю коллекцию" required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Описание (необязательно)</label>
            <input className="input" name="description" placeholder="Действует при покупке от 1000 сом" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Бонус (сом) *</label>
              <input className="input" name="bonus_amount" type="number" min="1" step="1" placeholder="500" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Мин. покупка (сом)</label>
              <input className="input" name="min_purchase" type="number" min="0" step="1" placeholder="0" />
            </div>
          </div>

          {/* Customer selector */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>
              Клиент (пусто = для всех)
            </label>
            {selectedCust ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)',
                borderRadius: 10, padding: '10px 14px',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e2eaf6' }}>{selectedCust.name}</div>
                  <div style={{ fontSize: 12, color: '#8899aa' }}>{selectedCust.phone}</div>
                </div>
                <button type="button" onClick={() => { setSelectedCust(null); setCustSearch(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4d4d', padding: 4 }}>
                  <XCircle size={18} />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8899aa' }} />
                  <input
                    className="input"
                    value={custSearch}
                    onChange={e => searchCustomers(e.target.value)}
                    placeholder="Поиск по имени или телефону..."
                    style={{ paddingLeft: 34 }}
                  />
                </div>
                {custResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 10,
                    maxHeight: 200, overflowY: 'auto', marginTop: 4,
                  }}>
                    {custResults.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => {
                          setSelectedCust({ id: c.id, name: c.full_name, phone: c.phone });
                          setCustResults([]);
                          setCustSearch('');
                        }}
                        style={{
                          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                          borderBottom: '1px solid #1c2a3a', textAlign: 'left',
                        }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e2eaf6' }}>{c.full_name}</span>
                        <span style={{ fontSize: 12, color: '#8899aa' }}>{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {custSearching && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 10, padding: 12, textAlign: 'center', color: '#8899aa', fontSize: 12, marginTop: 4 }}>
                    Поиск...
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Истекает (необязательно)</label>
            <input className="input" name="expires_at" type="datetime-local" />
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
            {saving ? 'Создание...' : 'Создать купон'}
          </button>
        </form>
        {msg && (
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: msg.startsWith('error:') ? 'var(--danger)' : 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {msg.startsWith('error:') ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            {msg.replace(/^(success|error):/, '')}
          </div>
        )}
      </div>
    </div>
  );
}
