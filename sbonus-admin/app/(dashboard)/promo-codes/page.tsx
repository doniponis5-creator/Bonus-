'use client';
import { Ticket, Loader2, XCircle, Plus, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';

export default function PromoCodesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const limit = 50;

  const load = async (p = page) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.promoCodes(p, limit);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 24, fontWeight: 800, marginBottom: 24 }}><Ticket size={24} /> Промокоды</h1>

      {/* Таблица промокодов */}
      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16, marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Код', 'Бонус', 'Использовано', 'Лимит', 'Истекает', 'Статус', 'Создан'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}><Loader2 className="animate-spin" style={{marginRight: 8, display: 'inline'}} size={16} /> Загрузка...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Промокодов нет</td></tr>
            )}
            {!loading && items.map(p => {
              const exhausted = p.used_count >= p.max_uses;
              const expired = p.expires_at && new Date(p.expires_at) < new Date();
              const inactive = !p.is_active || exhausted || expired;
              return (
                <tr key={p.id}>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#00e5a0' }}>
                    {p.code}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 700, color: '#e2eaf6' }}>
                    +{Number(p.bonus_amount).toLocaleString('ru-RU')} KGS
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#e2eaf6' }}>
                    {p.used_count}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>
                    {p.max_uses}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                    {p.expires_at ? new Date(p.expires_at).toLocaleDateString('ru-RU') : '∞'}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <span style={{
                      background: inactive ? '#ff4d4d18' : '#00e5a018',
                      color: inactive ? '#ff4d4d' : '#00e5a0',
                      padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                    }}>
                      {exhausted ? 'Исчерпан' : expired ? 'Истёк' : p.is_active ? 'Активен' : 'Отключён'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                    {new Date(p.created_at).toLocaleDateString('ru-RU')}
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

      {/* Форма создания */}
      <div className="card" style={{ maxWidth: 520 }}>
        <h3 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 16, fontWeight: 700, marginBottom: 20 }}><Plus size={16} /> Создать промокод</h3>
        <form
          onSubmit={async e => {
            e.preventDefault();
            setSaving(true); setMsg('');
            const fd = new FormData(e.currentTarget);
            try {
              const code = (fd.get('code') as string).toUpperCase();
              await adminAPI.createPromo({
                code,
                bonus_amount: Number(fd.get('amount')),
                max_uses: Number(fd.get('max')) || 100,
                expires_at: fd.get('expires') || undefined,
              });
              setMsg(`<CheckCircle2 size={14} style={{display:'inline',marginRight:4}} /> Промокод "${code}" создан`);
              (e.target as HTMLFormElement).reset();
              load(1); setPage(1);
            } catch (er: any) {
              setMsg('<XCircle size={14} style={{display:'inline',marginRight:4}} /> ' + (er?.response?.data?.detail?.message || 'Ошибка'));
            } finally {
              setSaving(false);
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Код *</label>
            <input className="input" name="code" placeholder="BONUS500" required style={{ textTransform: 'uppercase' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Сумма бонуса (KGS) *</label>
              <input className="input" name="amount" type="number" min="1" placeholder="500" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Лимит использований</label>
              <input className="input" name="max" type="number" min="1" placeholder="100" />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Истекает (необязательно)</label>
            <input className="input" name="expires" type="datetime-local" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
            {saving ? 'Создание...' : 'Создать промокод'}
          </button>
        </form>
        {msg && (
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: msg.includes('<CheckCircle2 size={14} style={{display:'inline',marginRight:4}} />') ? 'var(--accent)' : 'var(--danger)' }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
