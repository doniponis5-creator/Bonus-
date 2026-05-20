'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
        minHeight: '100dvh', background: '#0a0f1a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, color: '#8899aa',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid rgba(255,230,0,0.15)',
          borderTopColor: '#FFE600',
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{ fontSize: 14 }}>Входим...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#0a0f1a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 32, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>😔</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#ef4444' }}>{error}</div>
        <button
          onClick={() => router.replace('/login?redirect=/wheel')}
          style={{
            marginTop: 8, padding: '12px 24px',
            borderRadius: 10, border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: '#8899aa', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
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
      background: '#0a0f1a',
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
        minHeight: '100dvh', background: '#0a0f1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8899aa',
      }}>
        Загрузка...
      </div>
    }>
      <WheelInner />
    </Suspense>
  );
}
