'use client';

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
      background: '#0a0f1a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 32,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 48 }}>😔</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
        Что-то пошло не так
      </div>
      <div style={{ fontSize: 14, color: '#64748b', maxWidth: 300 }}>
        Произошла ошибка. Попробуйте обновить страницу.
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '12px 28px',
          borderRadius: 12,
          border: 'none',
          background: 'linear-gradient(135deg, #FFE600, #f59e0b)',
          color: '#0a0f1a',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Попробовать снова
      </button>
    </div>
  );
}
