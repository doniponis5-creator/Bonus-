'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Gift, Loader2, Phone, UserPlus } from 'lucide-react';
import { getToken, isTokenValid } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: 40, color: '#8899aa' }}>Загрузка...</div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get('ref') || '';

  const [phone, setPhone] = useState('+996');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [referrerName, setReferrerName] = useState('');
  const [inviteeBonus, setInviteeBonus] = useState('25');

  // Если уже авторизован — на главную
  useEffect(() => {
    if (isTokenValid(getToken())) router.replace('/');
  }, [router]);

  // Показать имя пригласившего (для красивого UX)
  useEffect(() => {
    if (!refCode) return;
    fetch(`${API_URL}/api/v1/customers/referrer-name/${encodeURIComponent(refCode)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.name) setReferrerName(data.name);
        if (data?.invitee_bonus) setInviteeBonus(data.invitee_bonus);
      })
      .catch(() => {});
  }, [refCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/customer-auth/self-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          full_name: name.trim(),
          referral_code: refCode || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.detail?.message || data?.detail || 'Ошибка регистрации';
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      } else {
        setSuccess(true);
        // Track QR scan for analytics
        try {
          await fetch(`${API_URL}/api/v1/qr-analytics/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qr_code: 'REGISTER_QR',
              utm_source: refCode ? 'referral' : 'qr_banner',
              utm_medium: 'qr_code',
              utm_campaign: refCode || 'self_register',
              device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            }),
          });
        } catch {}
      }
    } catch {
      setError('Ошибка сети. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="center">
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          {/* Success icon */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(34,197,94,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <CheckCircle2 size={40} color="#22c55e" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>
            Вы зарегистрированы!
          </h1>

          {/* Bonus card — show exact amount */}
          {refCode && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(255,230,0,0.12), rgba(124,111,255,0.08))',
              borderRadius: 16, padding: '20px 24px', margin: '16px 0',
              border: '1px solid rgba(255,230,0,0.25)',
            }}>
              <Gift size={24} color="var(--accent)" />
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)', margin: '8px 0 4px' }}>
                +{inviteeBonus} сом
              </div>
              <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
                Бонус зачислен на ваш счёт!
              </p>
            </div>
          )}

          {/* WhatsApp instruction */}
          <div style={{
            background: 'rgba(37,211,102,0.08)', borderRadius: 14, padding: '16px 20px',
            margin: '16px 0', border: '1px solid rgba(37,211,102,0.15)', textAlign: 'left',
          }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#25D366', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              📱 Как войти в кабинет?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: 'rgba(37,211,102,0.15)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#25D366', flexShrink: 0 }}>1</span>
                Откройте WhatsApp
              </p>
              <p style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: 'rgba(37,211,102,0.15)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#25D366', flexShrink: 0 }}>2</span>
                Найдите сообщение от Смарт Центр
              </p>
              <p style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: 'rgba(37,211,102,0.15)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#25D366', flexShrink: 0 }}>3</span>
                Нажмите на ссылку — вы в кабинете!
              </p>
            </div>
          </div>

          {/* CTA buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <a href="https://wa.me/" target="_blank" rel="noopener" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 0', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer',
              textDecoration: 'none',
            }}>
              📱 Открыть WhatsApp
            </a>
            <button onClick={() => router.push('/login')} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600,
              background: 'rgba(255,255,255,0.06)', color: 'var(--text2)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}>
              Войти по номеру телефона
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <div style={{ maxWidth: 360, width: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/icon-192.png" alt="S Bonus" width={64} height={64} style={{ borderRadius: 16, marginBottom: 10 }} />
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>
            S Bonus
          </div>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Регистрация в Смарт Центр</p>
        </div>

        {/* Referral banner */}
        {refCode && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,230,0,0.1), rgba(124,111,255,0.1))',
            borderRadius: 16, padding: '16px 20px', marginBottom: 16,
            border: '1px solid rgba(255,230,0,0.2)',
            textAlign: 'center',
          }}>
            <Gift size={24} color="var(--accent)" />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>
              {referrerName
                ? `${referrerName} приглашает вас!`
                : 'Вас пригласил друг!'
              }
            </p>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              Зарегистрируйтесь и получите <strong style={{ color: 'var(--accent)' }}>бонус на счёт</strong>
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={18} /> Регистрация
          </h2>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Ваше имя</label>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Алишер Каримов"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
              <Phone size={12} style={{ verticalAlign: 'middle' }} /> Номер телефона
            </label>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+996700123456"
              required
              inputMode="tel"
              autoComplete="tel"
            />
          </div>

          {refCode && (
            <div style={{
              background: 'rgba(255,230,0,0.05)', borderRadius: 10, padding: '10px 14px',
              marginBottom: 14, fontSize: 12, color: 'var(--text2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Gift size={14} color="var(--accent)" />
              Реферальный код: <strong style={{ color: 'var(--accent)', letterSpacing: 1 }}>{refCode}</strong>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || phone.length < 10 || name.trim().length < 2}
          >
            {loading ? (
              <><Loader2 className="spinner" size={18} /> Регистрация...</>
            ) : (
              <><UserPlus size={18} /> Зарегистрироваться</>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
          Уже есть аккаунт?{' '}
          <a href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Войти</a>
        </p>
      </div>
    </div>
  );
}
