'use client';

import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 32,
      textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'rgba(248,113,113,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertCircle size={30} color="var(--danger)" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
        Что-то пошло не так
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-2)', maxWidth: 300 }}>
        Произошла ошибка. Попробуйте обновить страницу.
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '13px 28px',
          borderRadius: 12,
          border: 'none',
          background: 'var(--accent)',
          color: '#111',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Попробовать снова
      </button>
    </div>
  );
}
