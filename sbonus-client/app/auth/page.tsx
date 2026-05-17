'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, XCircle } from 'lucide-react';
import { customerAuthAPI } from '@/lib/api';
import { setToken } from '@/lib/auth';

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Ссылка повреждена — токен отсутствует.');
      return;
    }
    customerAuthAPI
      .verify(token)
      .then((res) => {
        setToken(res.data.access_token);
        router.replace('/');
      })
      .catch((err) => {
        const code = err?.response?.data?.detail?.code;
        if (code === 'TOKEN_EXPIRED') {
          setError('Срок действия ссылки истёк. Запросите новую.');
        } else if (code === 'TOKEN_ALREADY_USED') {
          setError('Ссылка уже была использована. Запросите новую.');
        } else if (code === 'INVALID_TOKEN') {
          setError('Недействительная ссылка.');
        } else {
          setError('Не удалось войти. Попробуйте ещё раз.');
        }
      });
  }, [token, router]);

  if (error) {
    return (
      <div className="center">
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(239,68,68,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <XCircle size={32} color="var(--danger)" />
          </div>
          <h1 className="h1" style={{ marginBottom: 8 }}>
            Не удалось войти
          </h1>
          <p className="muted" style={{ marginBottom: 24, fontSize: 14 }}>
            {error}
          </p>
          <button className="btn btn-primary" onClick={() => router.replace('/login')}>
            Запросить новую ссылку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <Loader2 className="spinner" size={32} color="var(--accent)" />
      <p className="muted" style={{ marginTop: 16 }}>
        Входим в кабинет...
      </p>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="center">
          <Loader2 className="spinner" size={32} color="var(--accent)" />
        </div>
      }
    >
      <AuthInner />
    </Suspense>
  );
}
