'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, QrCode, Loader2 } from 'lucide-react';
import BalanceCard from '@/components/BalanceCard';
import DebtCard from '@/components/DebtCard';
import QRModal from '@/components/QRModal';
import TransactionList from '@/components/TransactionList';
import { customerAPI, type CabinetMe } from '@/lib/api';
import { clearToken, getToken, isTokenValid } from '@/lib/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<CabinetMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (!isTokenValid(getToken())) {
      router.replace('/login');
      return;
    }
    customerAPI
      .me()
      .then((res) => setData(res.data))
      .catch(() => setError('Не удалось загрузить данные. Попробуйте обновить страницу.'));
  }, [router]);

  const handleLogout = () => {
    clearToken();
    router.replace('/login');
  };

  if (error) {
    return (
      <div className="center">
        <p className="muted" style={{ marginBottom: 16 }}>
          {error}
        </p>
        <button className="btn btn-primary" style={{ maxWidth: 200 }} onClick={() => location.reload()}>
          Обновить
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="center">
        <Loader2 className="spinner" size={32} color="var(--accent)" />
      </div>
    );
  }

  return (
    <div className="app">
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 4px 16px',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>S Bonus</div>
        <button
          onClick={handleLogout}
          aria-label="Выйти"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text2)',
            cursor: 'pointer',
            padding: 8,
            display: 'flex',
          }}
        >
          <LogOut size={20} />
        </button>
      </header>

      <BalanceCard
        fullName={data.full_name}
        balance={Number(data.balance)}
        tierName={data.tier_name}
        tierPercent={Number(data.tier_percent)}
        nextTierName={data.next_tier_name}
        nextTierRemaining={data.next_tier_remaining != null ? Number(data.next_tier_remaining) : null}
        progressPercent={Number(data.tier_progress_percent)}
      />

      <DebtCard amount={Number(data.debt_amount)} updatedAt={data.debt_updated_at} />

      <button
        className="btn btn-secondary"
        style={{ marginBottom: 12 }}
        onClick={() => setQrOpen(true)}
      >
        <QrCode size={18} /> Показать QR кассиру
      </button>

      <TransactionList items={data.recent_transactions} />

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 20 }}>
        Реферальный код: <strong style={{ color: 'var(--text2)' }}>{data.referral_code}</strong>
      </p>

      <QRModal open={qrOpen} qrCode={data.qr_code} fullName={data.full_name} onClose={() => setQrOpen(false)} />
    </div>
  );
}
