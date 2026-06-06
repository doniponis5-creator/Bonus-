'use client';
import { Star, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'На проверке', bg: '#f59e0b18', color: '#f59e0b' },
  approved: { label: 'Одобрен', bg: '#22c55e18', color: '#22c55e' },
  rejected: { label: 'Отклонён', bg: '#ff4d4d18', color: '#ff4d4d' },
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
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800 }}>
          <Star size={24} /> Отзывы за бонус
          {pendingCount > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, background: '#f59e0b', color: '#0a0f1a', borderRadius: 100, padding: '2px 10px', marginLeft: 8 }}>
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
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: filter === f.value ? '#FFE600' : 'rgba(255,255,255,0.06)',
              color: filter === f.value ? '#0a0f1a' : '#8899aa',
              transition: 'all 0.15s',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16, marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Клиент', 'Платформа', 'Ссылка', 'Бонус', 'Статус', 'Дата', 'Действия'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>
                <Loader2 className="animate-spin" style={{ marginRight: 8, display: 'inline' }} size={16} /> Загрузка...
              </td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Заявок нет</td></tr>
            )}
            {!loading && items.map(r => {
              const st = STATUS_MAP[r.status] || STATUS_MAP.pending;
              return (
                <tr key={r.id}>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2eaf6' }}>{r.customer_name}</div>
                    <div style={{ fontSize: 12, color: '#8899aa' }}>{r.customer_phone}</div>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, fontWeight: 600, color: '#e2eaf6' }}>
                    {PLATFORM_MAP[r.platform] || r.platform}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <a href={r.review_link} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      <ExternalLink size={12} /> Открыть
                    </a>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 700, color: '#22c55e' }}>
                    +{Number(r.bonus_amount).toLocaleString('ru-RU')} сом
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <span style={{
                      background: st.bg, color: st.color,
                      padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                    }}>
                      {st.label}
                    </span>
                    {r.admin_note && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{r.admin_note}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                    {new Date(r.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleAction(r.id, 'approve')} disabled={acting === r.id}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 700, background: '#22c55e', color: '#fff',
                            opacity: acting === r.id ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          <CheckCircle2 size={13} /> Одобрить
                        </button>
                        <button onClick={() => handleAction(r.id, 'reject')} disabled={acting === r.id}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 700, background: '#ff4d4d22', color: '#ff4d4d',
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
