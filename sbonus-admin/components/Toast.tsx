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

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(0, 229, 160, 0.1)', border: '#00E5A0', icon: '#00E5A0' },
  error: { bg: 'rgba(255, 71, 87, 0.1)', border: '#FF4757', icon: '#FF4757' },
  warning: { bg: 'rgba(255, 165, 2, 0.1)', border: '#FFA502', icon: '#FFA502' },
  info: { bg: 'rgba(70, 130, 255, 0.1)', border: '#4682FF', icon: '#4682FF' },
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
        background: '#1a1f2e',
        border: `1px solid ${colors.border}33`,
        borderLeft: `3px solid ${colors.border}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        minWidth: 320,
        maxWidth: 480,
        animation: exiting ? 'toast-out 0.3s ease forwards' : 'toast-in 0.3s ease forwards',
        cursor: 'pointer',
        transition: 'transform 0.15s ease',
      }}
      onClick={() => { setExiting(true); setTimeout(() => onRemove(t.id), 300); }}
    >
      <Icon size={20} color={colors.icon} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 14, color: '#e0e0e0', lineHeight: 1.4 }}>{t.message}</span>
      <X size={16} color="#666" style={{ flexShrink: 0 }} />
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
    }}>
      <div style={{
        background: '#1a1f2e', borderRadius: 16, padding: '28px 32px',
        maxWidth: 400, width: '90%',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <AlertTriangle size={24} color="#FFA502" />
          <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>Подтверждение</span>
        </div>
        <p style={{ fontSize: 14, color: '#b0b0b0', lineHeight: 1.6, margin: '0 0 24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={() => onResult(false)} style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: '#b0b0b0', cursor: 'pointer', fontSize: 14,
          }}>Отмена</button>
          <button onClick={() => onResult(true)} style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: '#00E5A0', color: '#0a0f1a', cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>Подтвердить</button>
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
        position: 'fixed', top: 20, right: 20, zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: 10,
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
