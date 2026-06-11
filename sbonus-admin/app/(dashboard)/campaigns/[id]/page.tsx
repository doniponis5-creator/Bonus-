'use client';
import { Gift, Loader2, ArrowLeft, Calendar, Coins, MessageSquare, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { adminAPI } from '@/lib/api';

const STATUS_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  pending:    { text: 'Ожидает',     color: 'var(--warn)', bg: 'rgba(245,158,11,0.12)' },
  processing: { text: 'Обработка',   color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' },
  sent:       { text: 'Отправлено',  color: 'var(--success)', bg: 'rgba(34,197,94,0.12)' },
  cancelled:  { text: 'Отменено',    color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' },
};

const REC_STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: 'Ожидает', color: 'var(--warn)' },
  sent:    { text: 'Отправлено', color: 'var(--success)' },
  failed:  { text: 'Ошибка', color: 'var(--danger)' },
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

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}><Loader2 className="animate-spin" style={{ marginRight: 8, display: 'inline' }} size={16} /> Загрузка...</div>;
  if (!data) return <div style={{ padding: 32, color: 'var(--danger)' }}>Кампания не найдена</div>;

  const c = data.campaign;
  const st = STATUS_LABEL[c.status] || STATUS_LABEL.pending;

  return (
    <div>
      <Link href="/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
        <ArrowLeft size={14} /> Назад к списку
      </Link>

      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        <Gift size={24} /> {c.name}
      </h1>
      <span style={{ display: 'inline-block', background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
        {st.text}
      </span>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 12, marginBottom: 8 }}><Calendar size={14} /> Дата</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{new Date(c.bonus_date).toLocaleDateString('ru-RU')}</div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 12, marginBottom: 8 }}><Coins size={14} /> Сумма</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>+{Number(c.amount).toLocaleString('ru-RU')} сом</div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 12, marginBottom: 8 }}><Target size={14} /> Цель</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{c.target_type === 'all' ? 'Все клиенты' : 'Индивидуально'}</div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 12, marginBottom: 8 }}>Получатели</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{c.sent_count} / {c.recipients_count}</div>
        </div>
      </div>

      {c.reason && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Сабаб / Повод</div>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>{c.reason}</div>
        </div>
      )}

      {c.message_template && (
        <div className="card" style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
            <MessageSquare size={12} /> WhatsApp шаблон
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', background: 'var(--bg2)', padding: 12, borderRadius: 10 }}>
            {c.message_template}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Получатели</h2>
      <div style={{ overflowX: 'auto', background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Клиент', 'Телефон', 'Статус', 'Время', 'Ошибка'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--bg3)', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.recipients.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Получателей нет</td></tr>
            )}
            {data.recipients.map((r: any) => {
              const rs = REC_STATUS[r.status] || REC_STATUS.pending;
              return (
                <tr key={r.customer_id}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 13, color: 'var(--text)' }}>{r.customer_name}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text2)', fontFamily: 'monospace' }}>{r.customer_phone}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 12, fontWeight: 600, color: rs.color }}>{rs.text}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text2)' }}>
                    {r.sent_at ? new Date(r.sent_at).toLocaleString('ru-RU') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg3)', fontSize: 11, color: 'var(--danger)' }}>{r.error || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
