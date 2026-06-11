import { Clock, Gift, History, MinusCircle, PlusCircle, RefreshCcw, Ticket, Users, Megaphone } from 'lucide-react';
import type { CabinetTransaction } from '@/lib/api';

export const TX_META: Record<string, { label: string; Icon: typeof PlusCircle; sign: '+' | '-' }> = {
  earn:     { label: 'Начисление',    Icon: PlusCircle,  sign: '+' },
  spend:    { label: 'Списание',      Icon: MinusCircle, sign: '-' },
  birthday: { label: 'День рождения', Icon: Gift,        sign: '+' },
  referral: { label: 'Реферал',       Icon: Users,       sign: '+' },
  promo:    { label: 'Промокод',      Icon: Ticket,      sign: '+' },
  expire:   { label: 'Истёк',         Icon: Clock,       sign: '-' },
  refund:   { label: 'Возврат',       Icon: RefreshCcw,  sign: '+' },
  campaign: { label: 'Акция',         Icon: Megaphone,   sign: '+' },
};

/** Цвет суммы: поступление — зелёный, списание — нейтральный. */
export const txAmountColor = (sign: '+' | '-') =>
  sign === '+' ? 'var(--success)' : 'var(--text)';

interface Props {
  items: CabinetTransaction[];
  onShowAll?: () => void;
  onSelect?: (t: CabinetTransaction) => void;
}

export default function TransactionList({ items, onShowAll, onSelect }: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
          <History size={16} color="var(--text-2)" /> Последние операции
        </h2>
        {onShowAll && items.length > 0 && (
          <button onClick={onShowAll} className="tap" style={{
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: '4px 0',
          }}>
            Все →
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: 16 }}>
          Операций пока нет
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((t) => {
            const meta = TX_META[t.type] || { label: t.type, Icon: Clock, sign: '+' as const };
            const Icon = meta.Icon;
            const amount = Math.abs(Number(t.amount));
            return (
              <div key={t.id} onClick={() => onSelect?.(t)} className={onSelect ? 'tap' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: onSelect ? 'pointer' : 'default', padding: '6px 0' }}>
                <div className="icon-tile">
                  <Icon size={17} color="var(--text-2)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{meta.label}</p>
                  <p className="caption">
                    {new Date(t.created_at).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="numeric" style={{ fontSize: 14, fontWeight: 600, color: txAmountColor(meta.sign), whiteSpace: 'nowrap' }}>
                  {meta.sign}{amount.toLocaleString('ru-RU')} сом
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
