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
    }} className="modal-overlay" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="modal-content" style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '32px 28px', width: '100%', maxWidth: 380, margin: '0 12px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={28} color="var(--accent)" />
          </div>
          <h3 className="h2" style={{ color: 'var(--text)', margin: '0 0 8px' }}>
            {title || 'Подтверждение действия'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
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
            width: '100%', padding: '14px 16px', borderRadius: 10, fontSize: 16,
            textAlign: 'center', letterSpacing: 4, fontWeight: 600,
            background: 'var(--bg2)', border: error ? '1px solid var(--danger)' : '1px solid var(--border)',
            color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'center' }}>
            <XCircle size={14} color="var(--danger)" />
            <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>{error}</span>
          </div>
        )}

        <div className="btn-row" style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel} style={{ flex: 1 }}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !pin.trim()} style={{ flex: 1 }}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Проверка...' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
}
