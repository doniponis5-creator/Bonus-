'use client';
import { useState, useRef, useEffect } from 'react';
import { Shield, Loader2, XCircle } from 'lucide-react';
import { adminAPI } from '@/lib/api';

interface PinConfirmModalProps {
  open: boolean;
  title?: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PinConfirmModal({ open, title, description, onConfirm, onCancel }: PinConfirmModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!pin.trim()) return;
    setLoading(true);
    setError('');
    try {
      await adminAPI.verifyPin(pin);
      onConfirm();
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || 'Неверный PIN-код');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 20,
        padding: '32px 28px', width: '100%', maxWidth: 380,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'rgba(255,230,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={28} color="#FFE600" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#e2eaf6', margin: '0 0 8px' }}>
            {title || 'Подтверждение действия'}
          </h3>
          <p style={{ fontSize: 13, color: '#8899aa', margin: 0 }}>
            {description || 'Введите ваш пароль для подтверждения'}
          </p>
        </div>

        <input
          ref={inputRef}
          type="password"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Пароль"
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 12, fontSize: 16,
            textAlign: 'center', letterSpacing: 4, fontWeight: 700,
            background: 'rgba(255,255,255,0.04)', border: error ? '1px solid #ff4d4d' : '1px solid #1c2a3a',
            color: '#e2eaf6', outline: 'none', boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'center' }}>
            <XCircle size={14} color="#ff4d4d" />
            <span style={{ fontSize: 13, color: '#ff4d4d', fontWeight: 600 }}>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid #1c2a3a',
            background: 'transparent', color: '#8899aa', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            Отмена
          </button>
          <button onClick={handleSubmit} disabled={loading || !pin.trim()} style={{
            flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
            background: loading ? 'rgba(255,230,0,0.3)' : '#FFE600', color: '#0a0f1a',
            fontSize: 14, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
            opacity: !pin.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Проверка...' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
}
