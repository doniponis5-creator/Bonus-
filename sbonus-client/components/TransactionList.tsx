import { Clock, Gift, History, MinusCircle, PlusCircle, RefreshCcw, Ticket, Users } from 'lucide-react';
import type { CabinetTransaction } from '@/lib/api';

const TX_META: Record<string, { label: string; color: string; Icon: typeof PlusCircle; sign: '+' | '-' }> = {
  earn:     { label: 'Начисление',    color: '#FFE600', Icon: PlusCircle,  sign: '+' },
  spend:    { label: 'Списание',      color: '#ff4d4d', Icon: MinusCircle, sign: '-' },
  birthday: { label: 'День рождения', color: '#ffd700', Icon: Gift,         sign: '+' },
  referral: { label: 'Реферал',       color: '#60a5fa', Icon: Users,        sign: '+' },
  promo:    { label: 'Промокод',      color: '#c084fc', Icon: Ticket,       sign: '+' },
  expire:   { label: 'Истёк',         color: '#8899aa', Icon: Clock,        sign: '-' },
  refund:   { label: 'Возврат',       color: '#fb923c', Icon: RefreshCcw,   sign: '+' },
};

interface Props {
  items: CabinetTransaction[];
}

export default function TransactionList({ items }: Props) {
  return (
    <div className="card">
      <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <History size={16} /> Последние операции
      </h2>
      {items.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: 16 }}>
          Операций пока нет
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((t) => {
            const meta = TX_META[t.type] || { label: t.type, color: '#8899aa', Icon: Clock, sign: '+' as const };
            const Icon = meta.Icon;
            const amount = Math.abs(Number(t.amount));
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${meta.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} color={meta.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{meta.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {new Date(t.created_at).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: meta.color,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {meta.sign}
                  {amount.toLocaleString('ru-RU')} сом
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
