'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Lock, Phone, ShieldCheck } from 'lucide-react';
import { customerAuthAPI } from '@/lib/api';
import { getToken, isTokenValid, setToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+996');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isTokenValid(getToken())) router.replace('/');
  }, [router]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Auto-focus first code input
  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length < 10) return;
    setError('');
    setLoading(true);
    try {
      await customerAuthAPI.sendOtp(phone.trim());
      setStep('code');
      setCode(['', '', '', '']);
      setCountdown(120); // 2 min cooldown
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'object' && detail?.code === 'RATE_LIMIT_EXCEEDED') {
        setError('Слишком много запросов. Подождите 2 минуты.');
      } else if (typeof detail === 'string') {
        setError(detail);
      } else {
        setError('Ошибка отправки. Попробуйте ещё раз.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // only digits
    const newCode = [...code];
    newCode[index] = value.slice(-1); // single digit
    setCode(newCode);

    // Auto-advance to next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 digits entered
    const fullCode = newCode.join('');
    if (fullCode.length === 4) {
      handleVerifyOtp(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newCode = pasted.split('');
      setCode(newCode);
      handleVerifyOtp(pasted);
    }
  };

  const handleVerifyOtp = async (fullCode: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await customerAuthAPI.verifyOtp(phone.trim(), fullCode);
      setToken(res.data.access_token);
      router.replace('/');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Неверный код');
      setCode(['', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setLoading(true);
    try {
      await customerAuthAPI.sendOtp(phone.trim());
      setCode(['', '', '', '']);
      setCountdown(120);
    } catch {
      setError('Не удалось отправить код');
    } finally {
      setLoading(false);
    }
  };

  // ─── STEP 2: CODE INPUT ───
  if (step === 'code') {
    return (
      <div className="center">
        <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(255,230,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Lock size={32} color="var(--accent)" />
          </div>

          <h1 className="h1" style={{ marginBottom: 8 }}>Введите код</h1>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
            Код отправлен в WhatsApp на<br />
            <strong style={{ color: 'var(--text)' }}>{phone}</strong>
          </p>

          {/* 4-digit code inputs */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20,
          }}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleCodeChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                style={{
                  width: 56, height: 64, textAlign: 'center',
                  fontSize: 28, fontWeight: 800, letterSpacing: 2,
                  background: 'var(--card)', border: `2px solid ${digit ? 'var(--accent)' : 'var(--card-border)'}`,
                  borderRadius: 14, color: 'var(--text)', outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <Loader2 className="spinner" size={24} color="var(--accent)" />
            </div>
          )}

          {/* Resend */}
          <div style={{ marginBottom: 24 }}>
            {countdown > 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>
                Повторная отправка через {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
              </p>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={handleResend}
                disabled={loading}
                style={{ fontSize: 14 }}
              >
                Отправить код ещё раз
              </button>
            )}
          </div>

          {/* Back */}
          <button
            className="btn btn-ghost"
            onClick={() => { setStep('phone'); setError(''); setCode(['', '', '', '']); }}
            style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={14} /> Изменить номер
          </button>
        </div>
      </div>
    );
  }

  // ─── STEP 1: PHONE INPUT ───
  return (
    <div className="center">
      <div style={{ maxWidth: 360, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/icon-192.png" alt="S Bonus" width={72} height={72} style={{ borderRadius: 20, marginBottom: 12 }} />
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>
            S Bonus
          </div>
          <p className="muted">Личный кабинет Смарт Центр</p>
        </div>

        <form onSubmit={handleSendOtp} className="card" style={{ marginBottom: 16 }}>
          <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={18} /> Вход по номеру
          </h2>
          <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
            Введите номер — мы отправим 4-значный код в WhatsApp.
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
              <><Loader2 className="spinner" size={18} /> Отправляем...</>
            ) : (
              <><ShieldCheck size={18} /> Получить код</>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
          Нет аккаунта?{' '}
          <a href="/register" style={{ color: 'var(--accent)', fontWeight: 600 }}>Зарегистрироваться</a>
        </p>
      </div>
    </div>
  );
}
