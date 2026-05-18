'use client';
import { Store, Loader2, XCircle, Plus, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.branches();
      setBranches(data);
    } catch {
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    setSaving(true);
    try {
      await adminAPI.createBranch(name, address, city, phone);
      setMsg(`success:Филиал "${name}" успешно добавлен`);
      setName(''); setAddress(''); setCity(''); setPhone('');
      load();
    } catch (er: any) {
      setErr(er?.response?.data?.detail?.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 24, fontWeight: 800, marginBottom: 24 }}><Store size={24} /> Филиалы</h1>

      {/* Таблица филиалов */}
      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16, marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['#', 'Название', 'Адрес', 'Город', 'Телефон', 'Статус', 'Дата'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}><Loader2 className="animate-spin" style={{marginRight: 8, display: 'inline'}} size={16} /> Загрузка...</td></tr>
            )}
            {!loading && branches.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Филиалы не найдены</td></tr>
            )}
            {!loading && branches.map((b, i) => (
              <tr key={b.id}>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{i + 1}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 700, color: '#e2eaf6' }}>{b.name}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{b.address || '—'}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{b.city || '—'}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{b.phone || '—'}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                  <span style={{
                    background: b.is_active ? '#00e5a018' : '#ff4d4d18',
                    color: b.is_active ? '#00e5a0' : '#ff4d4d',
                    padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                  }}>
                    {b.is_active ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                  {new Date(b.created_at).toLocaleDateString('ru-RU')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Форма добавления */}
      <div className="card" style={{ maxWidth: 520 }}>
        <h3 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 16, fontWeight: 700, marginBottom: 20 }}><Plus size={16} /> Добавить филиал</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Название *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Смарт Центр 2" required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Адрес</label>
            <input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="ул. Ленина, 1" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Город</label>
              <input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="Ош" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Телефон</label>
              <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+996700000000" />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
            {saving ? 'Сохранение...' : 'Добавить филиал'}
          </button>
        </form>
        {msg && (
          <div style={{ marginTop: 12, color: msg.startsWith('error:') ? 'var(--danger)' : 'var(--accent)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {msg.startsWith('error:') ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            {msg.replace(/^(success|error):/, '')}
          </div>
        )}
        {err && <div style={{ marginTop: 12, color: 'var(--danger)', fontSize: 14, fontWeight: 600 }}><XCircle size={14} style={{display:'inline',marginRight:4}} /> {err}</div>}
      </div>
    </div>
  );
}
