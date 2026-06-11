'use client';
import { Briefcase, Loader2, XCircle, Plus, CheckCircle2, Lock, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';

export default function CashiersPage() {
  const { toast, confirm } = useToast();
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);

  // Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+996');
  const [pin, setPin] = useState('');
  const [branchId, setBranchId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cashiersRes, branchesRes] = await Promise.all([
        adminAPI.cashiers(),
        adminAPI.branches(),
      ]);
      setCashiers(cashiersRes.data);
      setBranches(branchesRes.data);
      if (branchesRes.data.length > 0 && !branchId) {
        setBranchId(branchesRes.data[0].id);
      }
    } catch {
      setCashiers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (c: any) => {
    const action = c.is_active ? 'заблокировать' : 'разблокировать';
    if (!await confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} кассира «${c.full_name}»?`)) return;
    try {
      await adminAPI.updateCashier(c.id, { is_active: !c.is_active });
      load();
    } catch (er: any) {
      toast('error', er?.response?.data?.detail?.message || 'Ошибка');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (!branchId) { setErr('Выберите филиал'); return; }
    setSaving(true);
    try {
      await adminAPI.createCashier({ phone, full_name: name, pin, branch_id: branchId });
      setMsg(`success:Кассир "${name}" добавлен`);
      setName(''); setPhone('+996'); setPin('');
      load();
    } catch (er: any) {
      setErr(er?.response?.data?.detail?.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 24, fontWeight: 700, marginBottom: 24, flexWrap: 'wrap' as any }}><Briefcase size={24} /> Кассиры</h1>

      {/* Таблица кассиров */}
      <div style={{ overflowX: 'auto', background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16, marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['#', 'ФИО', 'Телефон', 'Филиал', 'Статус', 'Добавлен', 'Действия'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--bg3)', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}><Loader2 className="animate-spin" style={{marginRight: 8, display: 'inline'}} size={16} /> Загрузка...</td></tr>
            )}
            {!loading && cashiers.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Кассиры не найдены</td></tr>
            )}
            {!loading && cashiers.map((c, i) => (
              <tr key={c.id}>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 13, color: 'var(--text2)' }}>{i + 1}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.full_name}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 13, color: 'var(--text2)' }}>{c.phone}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 13, color: 'var(--text2)' }}>{c.branch_name}</td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)' }}>
                  <span style={{
                    background: c.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    color: c.is_active ? 'var(--success)' : 'var(--danger)',
                    padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  }}>
                    {c.is_active ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text2)' }}>
                  {new Date(c.created_at).toLocaleDateString('ru-RU')}
                </td>
                <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', textAlign: 'right' }}>
                  <button
                    onClick={() => toggleActive(c)}
                    style={{
                      background: 'none',
                      border: '1px solid ' + (c.is_active ? 'var(--warn)' : 'var(--success)'),
                      color: c.is_active ? 'var(--warn)' : 'var(--success)',
                      padding: '6px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {c.is_active ? <><Lock size={12} /> Блокир.</> : <><Unlock size={12} /> Разблок.</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Форма добавления */}
      <div className="card" style={{ maxWidth: 520 }}>
        <h3 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 16, fontWeight: 700, marginBottom: 20 }}><Plus size={16} /> Добавить кассира</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Полное имя *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Айгуль Асанова" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Телефон *</label>
              <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+996700123456" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>PIN (4 цифры) *</label>
              <input className="input" type="password" maxLength={4} minLength={4} value={pin} onChange={e => setPin(e.target.value)} placeholder="••••" required />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Филиал *</label>
            <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)} required>
              <option value="">— Выберите филиал —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
            {saving ? 'Добавление...' : 'Добавить кассира'}
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
