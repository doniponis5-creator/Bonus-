'use client';
import { Users, CreditCard, Ticket, Loader2, PlusCircle, MinusCircle, Gift, Clock, RefreshCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import ExportButton from '@/components/ExportButton';
import { adminAPI } from '@/lib/api';

type TxMeta = { label: string; color: string; Icon: typeof PlusCircle };

const TYPE_LABELS: Record<string, TxMeta> = {
  earn:     { label: 'Начисление',    color: '#00e5a0', Icon: PlusCircle },
  spend:    { label: 'Списание',      color: '#ff4d4d', Icon: MinusCircle },
  birthday: { label: 'День рождения', color: '#ffd700', Icon: Gift },
  referral: { label: 'Реферал',       color: '#60a5fa', Icon: Users },
  promo:    { label: 'Промокод',      color: '#c084fc', Icon: Ticket },
  expire:   { label: 'Истёк',         color: '#8899aa', Icon: Clock },
  refund:   { label: 'Возврат',       color: '#fb923c', Icon: RefreshCcw },
};

const TX_TYPES = ['', 'earn', 'spend', 'birthday', 'referral', 'promo', 'expire', 'refund'];

export default function TransactionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [txType, setTxType] = useState('');
  const [loading, setLoading] = useState(false);

  const perPage = 50;

  const load = async (p = page, t = txType) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.transactions(p, perPage, t);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, txType); setPage(1); }, [txType]);
  useEffect(() => { load(page, txType); }, [page]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 24, fontWeight: 800 }}><CreditCard size={24} /> Транзакции</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Всего: {total.toLocaleString('ru-RU')}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select
            className="input"
            style={{ width: 180 }}
            value={txType}
            onChange={e => setTxType(e.target.value)}
          >
            <option value="">Все типы</option>
            {TX_TYPES.filter(Boolean).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]?.label || t}</option>
            ))}
          </select>
          <ExportButton days={30} />
        </div>
      </div>

      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Тип', 'Клиент', 'Телефон', 'Сумма', 'Покупка', 'Кассир', 'Филиал', 'Дата'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}><Loader2 className="animate-spin" style={{marginRight: 8, display: 'inline'}} size={16} /> Загрузка...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Транзакций нет</td></tr>
            )}
            {!loading && items.map(t => {
              const meta = TYPE_LABELS[t.type];
              const label = meta?.label ?? t.type;
              const color = meta?.color ?? '#8899aa';
              const Icon = meta?.Icon;
              return (
                <tr key={t.id} style={{ transition: 'background 0.15s' }}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <span style={{ background: `${color}18`, color, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {Icon && <Icon size={14} />} {label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, fontWeight: 600, color: '#e2eaf6' }}>{t.customer_name}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{t.customer_phone}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, fontWeight: 700, color }}>
                    {t.type === 'spend' ? '−' : '+'}{Number(t.amount).toLocaleString('ru-RU')} KGS
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>
                    {t.purchase_amount ? `${Number(t.purchase_amount).toLocaleString('ru-RU')} KGS` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{t.cashier_name}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{t.branch_name}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa', whiteSpace: 'nowrap' }}>
                    {new Date(t.created_at).toLocaleString('ru-RU')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Назад</button>
          <span style={{ padding: '10px 16px', color: 'var(--text2)', fontSize: 13 }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Далее →</button>
        </div>
      )}
    </div>
  );
}
