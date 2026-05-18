'use client';
import { FileSearch, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';

interface LogItem {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  earn: '#22c55e',
  spend: '#ff4d4d',
  login: '#60a5fa',
  logout: '#8899aa',
  create: '#c084fc',
  update: '#f59e0b',
  delete: '#ff4d4d',
};

function actionColor(action: string): string {
  const key = Object.keys(ACTION_COLORS).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : '#8899aa';
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const perPage = 50;

  const load = async (p: number) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.auditLogs(p);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800 }}>
          <FileSearch size={24} /> Журнал аудита
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
          Всего записей: {total.toLocaleString('ru-RU')}
        </p>
      </div>

      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Действие', 'Сущность', 'ID объекта', 'Пользователь', 'IP', 'Детали', 'Дата'].map((h) => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>
                  <Loader2 className="animate-spin" style={{ marginRight: 8, display: 'inline' }} size={16} /> Загрузка...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>
                  Записей нет
                </td>
              </tr>
            )}
            {!loading && items.map((l) => {
              const color = actionColor(l.action);
              return (
                <tr key={l.id}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <span style={{ background: `${color}18`, color, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#e2eaf6' }}>
                    {l.entity_type || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa', fontFamily: 'monospace' }}>
                    {l.entity_id ? l.entity_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa', fontFamily: 'monospace' }}>
                    {l.user_id ? l.user_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                    {l.ip_address || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.details ? JSON.stringify(l.details) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa', whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleString('ru-RU')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Назад</button>
          <span style={{ padding: '10px 16px', color: 'var(--text2)', fontSize: 13 }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Далее →</button>
        </div>
      )}
    </div>
  );
}
