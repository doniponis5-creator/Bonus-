'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, MessageCircle, Phone } from 'lucide-react';
import { customerAuthAPI } from '@/lib/api';
import { getToken, isTokenValid } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+996');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isTokenValid(getToken())) router.replace('/');
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await customerAuthAPI.requestLink(phone.trim());
      setSent(true);
    } catch (err: any) {
      const code = err?.response?.data?.detail?.code;
      if (code === 'RATE_LIMIT_EXCEEDED') {
        setError('Слишком много запросов. Подождите минуту.');
      } else {
        setError('Не удалось отправить ссылку. Попробуйте ещё раз.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="center">
        <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'rgba(255,230,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <CheckCircle2 size={36} color="var(--accent)" />
          </div>
          <h1 className="h1" style={{ marginBottom: 12 }}>
            Ссылка отправлена!
          </h1>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
            Если номер <strong style={{ color: 'var(--text)' }}>{phone}</strong> зарегистрирован,
            мы отправили ссылку для входа в WhatsApp.
            <br />
            <br />
            Откройте сообщение и нажмите на ссылку.
          </p>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 24 }}>
            Ссылка действует 15 минут.
          </p>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setSent(false);
              setError('');
            }}
          >
            Отправить ещё раз
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <div style={{ maxWidth: 360, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: 'var(--accent)',
              marginBottom: 8,
            }}
          >
            S Bonus
          </div>
          <p className="muted">Личный кабинет Смарт Центр</p>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 16 }}>
          <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={18} /> Вход по номеру
          </h2>
          <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
            Введите ваш номер телефона — мы отправим ссылку для входа в WhatsApp.
          </p>

          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+996700123456"
            required
            inputMode="tel"
            autoComplete="tel"
            style={{ marginBottom: 12 }}
          />

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading || phone.length < 10}>
            {loading ? (
              <>
                <Loader2 className="spinner" size={18} /> Отправляем...
              </>
            ) : (
              <>
                <MessageCircle size={18} /> Получить ссылку в WhatsApp
              </>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
          Нет аккаунта? Обратитесь к кассиру в магазине.
        </p>
      </div>
    </div>
  );
}
