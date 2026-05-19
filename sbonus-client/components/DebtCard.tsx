import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';

interface Props {
  amount: number;
  updatedAt?: string | null;
}

export default function DebtCard({ amount, updatedAt }: Props) {
  const hasDebt = amount > 0;
  return (
    <div className={`card ${hasDebt ? 'card-danger' : ''}`}>
      <p className="label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <FileText size={12} /> Задолженность (1C)
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: hasDebt ? 'var(--danger)' : 'var(--accent)',
          }}
        >
          {amount.toLocaleString('ru-RU')} <span style={{ fontSize: 14, color: 'var(--text2)' }}>KGS</span>
        </div>
        {hasDebt ? <AlertTriangle size={28} color="var(--danger)" /> : <CheckCircle2 size={28} color="var(--accent)" />}
      </div>
      {updatedAt && (
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          Обновлено: {new Date(updatedAt).toLocaleString('ru-RU')}
        </p>
      )}
      {!hasDebt && (
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Задолженности нет <CheckCircle2 size={14} color="var(--accent)" /></span>
        </p>
      )}
    </div>
  );
}
