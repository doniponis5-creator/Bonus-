'use client';
import { useEffect, useState } from 'react';
import { abTestingAPI } from '@/lib/api';
import { FlaskConical, Loader2, Plus, Trophy, XCircle, CheckCircle2, BarChart3 } from 'lucide-react';

export default function ABTestingPage() {
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [varA, setVarA] = useState('');
  const [varB, setVarB] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await abTestingAPI.list(filter || undefined);
      setTests(data);
    } catch { setTests([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      await abTestingAPI.create({ name, variant_a_message: varA, variant_b_message: varB, description: desc || undefined });
      setMsg('Тест создан!');
      setName(''); setVarA(''); setVarB(''); setDesc('');
      setShowForm(false);
      load();
    } catch (er: any) {
      setMsg('Ошибка: ' + (er?.response?.data?.detail || 'неизвестно'));
    } finally { setSaving(false); }
  };

  const handleComplete = async (id: string) => {
    try { await abTestingAPI.complete(id); load(); } catch {}
  };

  const handleCancel = async (id: string) => {
    try { await abTestingAPI.cancel(id); load(); } catch {}
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      active: { bg: '#22c55e18', color: '#22c55e', label: 'Активный' },
      completed: { bg: '#3b82f618', color: '#3b82f6', label: 'Завершён' },
      cancelled: { bg: '#8899aa18', color: '#8899aa', label: 'Отменён' },
    };
    const m = map[s] || map.cancelled;
    return <span style={{ background: m.bg, color: m.color, padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{m.label}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FlaskConical size={24} /> A/B Тестирование
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 10, padding: 3 }}>
            {[{ l: 'Все', v: '' }, { l: 'Активные', v: 'active' }, { l: 'Завершённые', v: 'completed' }].map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)} style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: filter === f.v ? 'var(--accent)' : 'transparent',
                color: filter === f.v ? '#000' : 'var(--text2)',
              }}>{f.l}</button>
            ))}
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Plus size={16} /> Новый тест
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24, maxWidth: 600 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Создать A/B тест</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Название теста *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Тест приветственного сообщения" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Вариант A (сообщение) *</label>
              <textarea className="input" value={varA} onChange={e => setVarA(e.target.value)} placeholder="Привет! У вас 500 бонусов — потратьте сегодня!" required rows={2} style={{ resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Вариант B (сообщение) *</label>
              <textarea className="input" value={varB} onChange={e => setVarB(e.target.value)} placeholder="Скидка ждёт! Приходите и используйте свои бонусы 🎁" required rows={2} style={{ resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Описание</label>
              <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Цель: увеличить конверсию..." />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Создание...' : 'Создать тест'}</button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
            </div>
          </form>
          {msg && <div style={{ marginTop: 12, color: msg.startsWith('Ошибка') ? 'var(--danger)' : '#22c55e', fontSize: 13, fontWeight: 600 }}>{msg}</div>}
        </div>
      )}

      {/* Tests list */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 40, color: 'var(--text2)' }}>
          <Loader2 size={16} className="animate-spin" /> Загрузка...
        </div>
      ) : tests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          <FlaskConical size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p>Нет A/B тестов</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tests.map(t => {
            const total = t.variant_a_sent + t.variant_b_sent;
            const aWidth = total > 0 ? (t.variant_a_rate / Math.max(t.variant_a_rate + t.variant_b_rate, 1)) * 100 : 50;
            return (
              <div key={t.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t.name}</h3>
                    {t.description && <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>{t.description}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {statusBadge(t.status)}
                    {t.winner && (
                      <span style={{ background: '#FFE60018', color: '#FFE600', padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Trophy size={12} /> Победитель: {t.winner}
                      </span>
                    )}
                  </div>
                </div>

                {/* Variants comparison */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div style={{ padding: 16, background: 'rgba(59,130,246,0.06)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
                    <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, marginBottom: 8 }}>ВАРИАНТ A</div>
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.5 }}>{t.variant_a_message}</p>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Отправлено</div><div style={{ fontSize: 18, fontWeight: 800 }}>{t.variant_a_sent}</div></div>
                      <div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Конверсия</div><div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>{t.variant_a_rate}%</div></div>
                    </div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(249,115,22,0.06)', borderRadius: 12, border: '1px solid rgba(249,115,22,0.15)' }}>
                    <div style={{ fontSize: 11, color: '#f97316', fontWeight: 700, marginBottom: 8 }}>ВАРИАНТ B</div>
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.5 }}>{t.variant_b_message}</p>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Отправлено</div><div style={{ fontSize: 18, fontWeight: 800 }}>{t.variant_b_sent}</div></div>
                      <div><div style={{ fontSize: 10, color: 'var(--text3)' }}>Конверсия</div><div style={{ fontSize: 18, fontWeight: 800, color: '#f97316' }}>{t.variant_b_rate}%</div></div>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {total > 0 && (
                  <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
                    <div style={{ width: `${aWidth}%`, background: '#3b82f6', transition: 'width 0.3s' }} />
                    <div style={{ flex: 1, background: '#f97316' }} />
                  </div>
                )}

                {/* Actions */}
                {t.status === 'active' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleComplete(t.id)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #22c55e33', background: '#22c55e12', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={14} /> Завершить
                    </button>
                    <button onClick={() => handleCancel(t.id)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #8899aa33', background: '#8899aa12', color: '#8899aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <XCircle size={14} /> Отменить
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
