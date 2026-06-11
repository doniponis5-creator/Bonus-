'use client';
import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (type: ToastType, message: string, duration?: number) => void;
  confirm: (message: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

// Hex literals — concatenated with alpha suffix (CSS vars cannot be alpha-suffixed)
const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', icon: '#22c55e' },
  error: { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', icon: '#ef4444' },
  warning: { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', icon: '#f59e0b' },
  info: { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', icon: '#3b82f6' },
};

function ToastItem({ t, onRemove }: { t: Toast; onRemove: (id: number) => void }) {
  const [exiting, setExiting] = useState(false);
  const Icon = ICONS[t.type];
  const colors = COLORS[t.type];

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(t.id), 300);
    }, t.duration || 4000);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, onRemove]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        borderRadius: 12,
        background: 'var(--card)',
        border: `1px solid ${colors.border}33`,
        borderLeft: `3px solid ${colors.border}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        minWidth: 0,
        maxWidth: 480,
        width: '100%',
        animation: exiting ? 'toast-out 0.3s ease forwards' : 'toast-in 0.3s ease forwards',
        cursor: 'pointer',
        transition: 'transform 0.15s ease',
      }}
      onClick={() => { setExiting(true); setTimeout(() => onRemove(t.id), 300); }}
    >
      <Icon size={20} color={colors.icon} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>{t.message}</span>
      <X size={16} color="var(--text3)" style={{ flexShrink: 0 }} />
    </div>
  );
}

function ConfirmModal({ message, onResult }: { message: string; onResult: (ok: boolean) => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResult(false);
      if (e.key === 'Enter') onResult(true);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onResult]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10001,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      animation: 'toast-in 0.2s ease',
    }} className="modal-overlay">
      <div className="modal-content" style={{
        background: 'var(--card)', borderRadius: 16, padding: '24px',
        maxWidth: 400, width: '90%', margin: '0 12px',
        border: '1px solid var(--border)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <AlertTriangle size={24} color="var(--warn)" />
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Подтверждение</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 24px' }}>{message}</p>
        <div className="btn-row" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => onResult(false)}>Отмена</button>
          <button className="btn btn-primary" onClick={() => onResult(true)}>Подтвердить</button>
        </div>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((type: ToastType, message: string, duration?: number) => {
    setToasts((prev) => [...prev, { id: ++toastId, type, message, duration }]);
  }, []);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ message, resolve });
    });
  }, []);

  const handleConfirmResult = useCallback((ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  }, [confirmState]);

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}
      <div style={{
        position: 'fixed', top: 12, left: 12, right: 12, zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end',
      }}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onRemove={removeToast} />
        ))}
      </div>
      {confirmState && <ConfirmModal message={confirmState.message} onResult={handleConfirmResult} />}
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes toast-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100px); } }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
