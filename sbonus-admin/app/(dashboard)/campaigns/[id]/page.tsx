'use client';
import { Gift, Loader2, ArrowLeft, Calendar, Coins, MessageSquare, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { adminAPI } from '@/lib/api';

const STATUS_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  pending:    { text: 'Ожидает',     color: '#ffb347', bg: '#ffb34718' },
  processing: { text: 'Обработка',   color: '#00b8d4', bg: '#00b8d418' },
  sent:       { text: 'Отправлено',  color: '#00e5a0', bg: '#00e5a018' },
  cancelled:  { text: 'Отменено',    color: '#ff4d4d', bg: '#ff4d4d18' },
};

const REC_STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: 'Ожидает', color: '#ffb347' },
  sent:    { text: 'Отправлено', color: '#00e5a0' },
  failed:  { text: 'Ошибка', color: '#ff4d4d' },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.campaign(id);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}><Loader2 className="animate-spin" style={{ marginRight: 8, display: 'inline' }} size={16} /> Загрузка...</div>;
  if (!data) return <div style={{ padding: 32, color: '#ff4d4d' }}>Кампания не найдена</div>;

  const c = data.campaign;
  const st = STATUS_LABEL[c.status] || STATUS_LABEL.pending;

  return (
    <div>
      <Link href="/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#8899aa', fontSize: 13, marginBottom: 16 }}>
        <ArrowLeft size={14} /> Назад к списку
      </Link>

      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
        <Gift size={24} /> {c.name}
      </h1>
      <span style={{ display: 'inline-block', background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
        {st.text}
      </span>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8899aa', fontSize: 12, marginBottom: 8 }}><Calendar size={14} /> Дата</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2eaf6' }}>{new Date(c.bonus_date).toLocaleDateString('ru-RU')}</div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8899aa', fontSize: 12, marginBottom: 8 }}><Coins size={14} /> Сумма</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#00e5a0' }}>+{Number(c.amount).toLocaleString('ru-RU')} KGS</div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8899aa', fontSize: 12, marginBottom: 8 }}><Target size={14} /> Цель</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e2eaf6' }}>{c.target_type === 'all' ? 'Все клиенты' : 'Индивидуально'}</div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8899aa', fontSize: 12, marginBottom: 8 }}>Получатели</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2eaf6' }}>{c.sent_count} / {c.recipients_count}</div>
        </div>
      </div>

      {c.reason && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Сабаб / Повод</div>
          <div style={{ fontSize: 14, color: '#e2eaf6' }}>{c.reason}</div>
        </div>
      )}

      {c.message_template && (
        <div className="card" style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8899aa', marginBottom: 6 }}>
            <MessageSquare size={12} /> WhatsApp шаблон
          </div>
          <div style={{ fontSize: 13, color: '#e2eaf6', whiteSpace: 'pre-wrap', fontFamily: 'monospace', background: '#0d1117', padding: 12, borderRadius: 8 }}>
            {c.message_template}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#e2eaf6' }}>Получатели</h2>
      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Клиент', 'Телефон', 'Статус', 'Время', 'Ошибка'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.recipients.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Получателей нет</td></tr>
            )}
            {data.recipients.map((r: any) => {
              const rs = REC_STATUS[r.status] || REC_STATUS.pending;
              return (
                <tr key={r.customer_id}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#e2eaf6' }}>{r.customer_name}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa', fontFamily: 'monospace' }}>{r.customer_phone}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, fontWeight: 600, color: rs.color }}>{rs.text}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                    {r.sent_at ? new Date(r.sent_at).toLocaleString('ru-RU') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 11, color: '#ff4d4d' }}>{r.error || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
