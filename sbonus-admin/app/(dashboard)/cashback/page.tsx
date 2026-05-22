'use client';
import { useEffect, useState } from 'react';
import { cashbackAPI } from '@/lib/api';
import { Percent, Loader2, Plus, Trash2, CheckCircle2, XCircle, Zap } from 'lucide-react';

export default function CashbackPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [promo, setPromo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // New category form
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newPercent, setNewPercent] = useState('');
  const [saving, setSaving] = useState(false);

  // Global promo
  const [promoEnabled, setPromoEnabled] = useState(false);
  const [promoPercent, setPromoPercent] = useState('');
  const [promoSaving, setPromoSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [catRes, promoRes] = await Promise.all([
        cashbackAPI.categories().catch(() => ({ data: [] })),
        cashbackAPI.globalPromo().catch(() => ({ data: null })),
      ]);
      setCategories(catRes.data || []);
      if (promoRes.data) {
        setPromo(promoRes.data);
        setPromoEnabled(promoRes.data.enabled || false);
        setPromoPercent(String(promoRes.data.percent || ''));
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      await cashbackAPI.createCategory(newSlug, newName, Number(newPercent));
      setMsg('Категория добавлена!');
      setNewSlug(''); setNewName(''); setNewPercent('');
      load();
    } catch (er: any) {
      setMsg('Ошибка: ' + (er?.response?.data?.detail || 'неизвестно'));
    } finally { setSaving(false); }
  };

  const handleDeleteCategory = async (slug: string) => {
    try { await cashbackAPI.deleteCategory(slug); load(); } catch {}
  };

  const handleUpdatePercent = async (slug: string, percent: number) => {
    try { await cashbackAPI.updateCategory(slug, percent); load(); } catch {}
  };

  const handleSavePromo = async () => {
    setPromoSaving(true);
    try {
      await cashbackAPI.updateGlobalPromo({ enabled: promoEnabled, percent: Number(promoPercent) || undefined });
      setMsg('Глобальная акция обновлена!');
      load();
    } catch (er: any) {
      setMsg('Ошибка: ' + (er?.response?.data?.detail || 'неизвестно'));
    } finally { setPromoSaving(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Loader2 size={16} className="animate-spin" /> Загрузка...
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Percent size={24} /> Кешбэк по категориям
      </h1>

      {/* Global promo */}
      <div className="card" style={{ marginBottom: 24, maxWidth: 560 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} color="#f97316" /> Глобальная акция
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Акция активна</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Перекрывает категорийный кешбэк</div>
          </div>
          <button type="button" onClick={() => setPromoEnabled(!promoEnabled)} style={{
            width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: promoEnabled ? '#f97316' : '#333', position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11, background: '#fff',
              position: 'absolute', top: 3, left: promoEnabled ? 23 : 3, transition: 'left 0.2s',
            }} />
          </button>
        </div>
        {promoEnabled && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Процент кешбэка (%)</label>
            <input className="input" type="number" min="0" max="100" step="0.1" value={promoPercent}
              onChange={e => setPromoPercent(e.target.value)} placeholder="10" style={{ maxWidth: 200 }} />
          </div>
        )}
        <button onClick={handleSavePromo} className="btn btn-primary" disabled={promoSaving}>
          {promoSaving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      {/* Categories table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Категории</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                {['Slug', 'Название', 'Кешбэк %', 'Действия'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Категории не настроены</td></tr>
              )}
              {categories.map((c: any) => (
                <tr key={c.slug}>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #1c2a3a', fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)' }}>{c.slug}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #1c2a3a' }}>
                    <input type="number" min="0" max="100" step="0.1" defaultValue={c.percent}
                      onBlur={e => { const v = Number(e.target.value); if (v !== c.percent) handleUpdatePercent(c.slug, v); }}
                      style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, fontWeight: 700, textAlign: 'center' }} />
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #1c2a3a' }}>
                    <button onClick={() => handleDeleteCategory(c.slug)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ff4d4d33', background: '#ff4d4d12', color: '#ff4d4d', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add category */}
      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Добавить категорию
        </h3>
        <form onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Slug *</label>
              <input className="input" value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="electronics" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Название *</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Электроника" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>% *</label>
              <input className="input" type="number" min="0" max="100" step="0.1" value={newPercent}
                onChange={e => setNewPercent(e.target.value)} placeholder="5" required />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Добавление...' : 'Добавить'}</button>
        </form>
        {msg && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            color: msg.startsWith('Ошибка') ? 'var(--danger)' : '#22c55e' }}>
            {msg.startsWith('Ошибка') ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
