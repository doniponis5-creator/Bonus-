'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import BonusWheel from '@/components/BonusWheel';
import { isTokenValid, getToken, setToken } from '@/lib/auth';
import { customerAuthAPI } from '@/lib/api';

function WheelInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    // Case 1: Direct link with magic token → auto-verify
    if (token) {
      setVerifying(true);
      customerAuthAPI.verify(token)
        .then((res) => {
          setToken(res.data.access_token);
          // Remove token from URL (clean up)
          window.history.replaceState({}, '', '/wheel');
          setReady(true);
        })
        .catch((err) => {
          const code = err?.response?.data?.detail?.code;
          if (code === 'TOKEN_EXPIRED') {
            setError('Ссылка истекла. Попросите новую ссылку.');
          } else if (code === 'TOKEN_ALREADY_USED') {
            // Token already used — check if user already has valid JWT
            if (isTokenValid(getToken())) {
              window.history.replaceState({}, '', '/wheel');
              setReady(true);
            } else {
              setError('Ссылка уже использована. Попросите новую.');
            }
          } else {
            setError('Ошибка входа. Попросите новую ссылку.');
          }
        })
        .finally(() => setVerifying(false));
      return;
    }

    // Case 2: No token — check existing JWT
    if (isTokenValid(getToken())) {
      setReady(true);
    } else {
      router.replace('/login?redirect=/wheel');
    }
  }, [router, searchParams]);

  // Loading state while verifying token
  if (verifying) {
    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, color: 'var(--text-2)',
      }}>
        <div className="spinner" style={{
          width: 40, height: 40, borderRadius: 999,
          border: '3px solid var(--border-strong)',
          borderTopColor: 'var(--accent)',
        }} />
        <div style={{ fontSize: 14 }}>Входим...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 32, textAlign: 'center',
      }}>
        <div className="icon-tile" style={{ width: 56, height: 56, borderRadius: 16 }}>
          <AlertCircle size={28} color="var(--danger)" />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{error}</div>
        <button
          onClick={() => router.replace('/login?redirect=/wheel')}
          className="btn btn-primary"
          style={{ marginTop: 8, maxWidth: 280 }}
        >
          Войти по номеру телефона
        </button>
      </div>
    );
  }

  if (!ready) return null;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <BonusWheel />
    </div>
  );
}

export default function WheelPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-2)',
      }}>
        Загрузка...
      </div>
    }>
      <WheelInner />
    </Suspense>
  );
}
