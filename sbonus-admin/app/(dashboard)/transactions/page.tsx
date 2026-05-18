'use client';
import { Users, CreditCard, Ticket, Loader2, PlusCircle, MinusCircle, Gift, Clock, RefreshCcw, Undo2, Megaphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import ExportButton from '@/components/ExportButton';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';

type TxMeta = { label: string; color: string; Icon: typeof PlusCircle };

const TYPE_LABELS: Record<string, TxMeta> = {
  earn:     { label: 'Начисление',    color: '#22c55e', Icon: PlusCircle },
  spend:    { label: 'Списание',      color: '#ff4d4d', Icon: MinusCircle },
  birthday: { label: 'День рождения', color: '#ffd700', Icon: Gift },
  referral: { label: 'Реферал',       color: '#60a5fa', Icon: Users },
  promo:    { label: 'Промокод',      color: '#c084fc', Icon: Ticket },
  expire:   { label: 'Истёк',         color: '#8899aa', Icon: Clock },
  refund:   { label: 'Возврат',       color: '#fb923c', Icon: RefreshCcw },
  campaign: { label: 'Кампания',      color: '#34d399', Icon: Megaphone },
};

const TX_TYPES = ['', 'earn', 'spend', 'birthday', 'referral', 'promo', 'expire', 'refund', 'campaign'];

export default function TransactionsPage() {
  const { toast, confirm } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [txType, setTxType] = useState('');
  const [loading, setLoading] = useState(false);

  // Reversal modal
  const [reverseModal, setReverseModal] = useState(false);
  const [reverseTxn, setReverseTxn] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

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

  useEffect(() => { setPage(1); load(1, txType); }, [txType]);
  useEffect(() => { if (page > 1) load(page, txType); }, [page]);

  const totalPages = Math.ceil(total / perPage);

  const openReverse = (txn: any) => {
    setReverseTxn(txn);
    setReverseReason('');
    setReverseModal(true);
  };

  const handleReverse = async () => {
    if (!reverseReason.trim()) { toast('warning', 'Укажите причину отмены'); return; }
    if (!await confirm(`Отменить транзакцию на ${Number(reverseTxn.amount).toLocaleString('ru-RU')} KGS для ${reverseTxn.customer_name}?`)) return;
    setReversing(true);
    try {
      const { data } = await adminAPI.reverseTransaction(reverseTxn.id, reverseReason.trim());
      toast('success', data.message);
      setReverseModal(false);
      load(page, txType);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || 'Ошибка отмены';
      toast('error', msg);
    } finally {
      setReversing(false);
    }
  };

  const canReverse = (type: string) => !['refund', 'expire'].includes(type);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800 }}><CreditCard size={24} /> Транзакции</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Всего: {total.toLocaleString('ru-RU')}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select className="input" style={{ width: 180 }} value={txType} onChange={e => setTxType(e.target.value)}>
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
              {['Тип', 'Клиент', 'Телефон', 'Сумма', 'Покупка', 'Кассир', 'Филиал', 'Дата', ''].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}><Loader2 className="animate-spin" style={{ marginRight: 8, display: 'inline' }} size={16} /> Загрузка...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Транзакций нет</td></tr>
            )}
            {!loading && items.map(t => {
              const meta = TYPE_LABELS[t.type];
              const label = meta?.label ?? t.type;
              const color = meta?.color ?? '#8899aa';
              const Icon = meta?.Icon;
              const isRefund = t.type === 'refund';
              return (
                <tr key={t.id} style={{ transition: 'background 0.15s', opacity: isRefund ? 0.6 : 1 }}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <span style={{ background: `${color}18`, color, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {Icon && <Icon size={14} />} {label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, fontWeight: 600, color: '#e2eaf6' }}>{t.customer_name}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{t.customer_phone}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, fontWeight: 700, color }}>
                    {['spend', 'expire', 'refund'].includes(t.type) ? '−' : '+'}{Number(t.amount).toLocaleString('ru-RU')} KGS
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>
                    {t.purchase_amount ? `${Number(t.purchase_amount).toLocaleString('ru-RU')} KGS` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{t.cashier_name}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#8899aa' }}>{t.branch_name}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa', whiteSpace: 'nowrap' }}>
                    {new Date(t.created_at).toLocaleString('ru-RU')}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    {canReverse(t.type) && (
                      <button
                        onClick={() => openReverse(t)}
                        title="Отменить транзакцию"
                        style={{
                          background: 'none', border: '1px solid rgba(251,146,60,0.3)', color: '#fb923c',
                          borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Undo2 size={12} /> Отмена
                      </button>
                    )}
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
          <span style={{ padding: '10px 16px', color: 'var(--text2)', fontSize: 13 }}>{page} / {totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Далее →</button>
        </div>
      )}

      {/* Reversal Modal */}
      {reverseModal && reverseTxn && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '420px' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#e2eaf6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Undo2 size={18} /> Отмена транзакции
            </h2>

            <div style={{ background: '#1c2a3a', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><span style={{ fontSize: 11, color: '#8899aa' }}>Клиент:</span><div style={{ fontSize: 13, fontWeight: 600 }}>{reverseTxn.customer_name}</div></div>
                <div><span style={{ fontSize: 11, color: '#8899aa' }}>Тип:</span><div style={{ fontSize: 13 }}>{TYPE_LABELS[reverseTxn.type]?.label || reverseTxn.type}</div></div>
                <div><span style={{ fontSize: 11, color: '#8899aa' }}>Сумма:</span><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{Number(reverseTxn.amount).toLocaleString('ru-RU')} KGS</div></div>
                <div><span style={{ fontSize: 11, color: '#8899aa' }}>Дата:</span><div style={{ fontSize: 12 }}>{new Date(reverseTxn.created_at).toLocaleString('ru-RU')}</div></div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 8 }}>Причина отмены *</label>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: 80 }}
                value={reverseReason}
                onChange={e => setReverseReason(e.target.value)}
                placeholder="Почему отменяете? (обязательно)"
              />
            </div>

            <div style={{ background: 'rgba(251,146,60,0.1)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#fb923c' }}>
              ⚠️ {reverseTxn.type === 'spend'
                ? `Бонусы (${Number(reverseTxn.amount).toLocaleString('ru-RU')} KGS) будут возвращены на счёт клиента`
                : `С бонусного счёта клиента будет списано ${Number(reverseTxn.amount).toLocaleString('ru-RU')} KGS`
              }
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn" style={{ flex: 1, background: '#1c2a3a', color: '#e2eaf6' }} onClick={() => setReverseModal(false)}>Отмена</button>
              <button
                className="btn"
                style={{ flex: 1, background: '#fb923c', color: '#000', fontWeight: 700 }}
                onClick={handleReverse}
                disabled={reversing || !reverseReason.trim()}
              >
                {reversing ? 'Обработка...' : 'Подтвердить отмену'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
