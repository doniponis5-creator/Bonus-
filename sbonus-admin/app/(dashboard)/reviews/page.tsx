'use client';
import { Star, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'На проверке', bg: 'rgba(245,158,11,0.12)', color: 'var(--warn)' },
  approved: { label: 'Одобрен', bg: 'rgba(34,197,94,0.12)', color: 'var(--success)' },
  rejected: { label: 'Отклонён', bg: 'rgba(239,68,68,0.12)', color: 'var(--danger)' },
};

const PLATFORM_MAP: Record<string, string> = {
  google: 'Google Maps',
  '2gis': '2GIS',
};

export default function ReviewsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { toast, confirm } = useToast();
  const [acting, setActing] = useState<string | null>(null);

  const limit = 50;

  const load = async (p = page, s = filter) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.reviews(p, limit, s || undefined);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page, filter); }, [page, filter]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      if (!await confirm('Отклонить отзыв?')) return;
    }
    setActing(id);
    try {
      await adminAPI.actionReview(id, action);
      toast('success', action === 'approve' ? 'Отзыв одобрен' : 'Отзыв отклонён');
      load(page, filter);
    } catch { toast('error', 'Ошибка'); } finally {
      setActing(null);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700 }}>
          <Star size={24} /> Отзывы за бонус
          {pendingCount > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, background: 'var(--warn)', color: 'var(--bg)', borderRadius: 999, padding: '2px 10px', marginLeft: 8 }}>
              {pendingCount} ожидают
            </span>
          )}
        </h1>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { value: '', label: 'Все' },
          { value: 'pending', label: 'На проверке' },
          { value: 'approved', label: 'Одобренные' },
          { value: 'rejected', label: 'Отклонённые' },
        ].map(f => (
          <button key={f.value} onClick={() => { setFilter(f.value); setPage(1); }}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: filter === f.value ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              color: filter === f.value ? 'var(--bg)' : 'var(--text2)',
              transition: 'all 0.15s',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16, marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Клиент', 'Платформа', 'Ссылка', 'Бонус', 'Статус', 'Дата', 'Действия'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--bg3)', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>
                <Loader2 className="animate-spin" style={{ marginRight: 8, display: 'inline' }} size={16} /> Загрузка...
              </td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Заявок нет</td></tr>
            )}
            {!loading && items.map(r => {
              const st = STATUS_MAP[r.status] || STATUS_MAP.pending;
              return (
                <tr key={r.id}>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.customer_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{r.customer_phone}</div>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {PLATFORM_MAP[r.platform] || r.platform}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)' }}>
                    <a href={r.review_link} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      <ExternalLink size={12} /> Открыть
                    </a>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>
                    +{Number(r.bonus_amount).toLocaleString('ru-RU')} сом
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)' }}>
                    <span style={{
                      background: st.bg, color: st.color,
                      padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                    }}>
                      {st.label}
                    </span>
                    {r.admin_note && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{r.admin_note}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text2)' }}>
                    {new Date(r.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--bg3)' }}>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleAction(r.id, 'approve')} disabled={acting === r.id}
                          style={{
                            padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 700, background: 'var(--success)', color: '#fff',
                            opacity: acting === r.id ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          <CheckCircle2 size={13} /> Одобрить
                        </button>
                        <button onClick={() => handleAction(r.id, 'reject')} disabled={acting === r.id}
                          style={{
                            padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 700, background: 'rgba(239,68,68,0.13)', color: 'var(--danger)',
                            opacity: acting === r.id ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          <XCircle size={13} /> Отклонить
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Назад</button>
          <span style={{ padding: '10px 16px', color: 'var(--text2)', fontSize: 13 }}>{page} / {totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Далее →</button>
        </div>
      )}
    </div>
  );
}
