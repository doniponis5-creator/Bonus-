'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { isNativeShell } from '@/lib/nativeBridge';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallMode = 'hidden' | 'native' | 'ios' | 'android-guide';

function isIOS(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
}

export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<InstallMode>('hidden');

  useEffect(() => {
    if (isStandalone() || isNativeShell()) return;

    let dismissed = '';
    try { dismissed = localStorage.getItem('pwa_install_dismissed_v2') || ''; } catch { /* ignore */ }
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    if (isIOS()) {
      // iOS не поддерживает beforeinstallprompt, поэтому показываем инструкцию.
      const timer = setTimeout(() => setMode('ios'), 1800);
      return () => clearTimeout(timer);
    }

    let nativePromptSeen = false;

    // Chrome/Android отдаёт системный prompt только если PWA полностью installable.
    const promptHandler = (event: Event) => {
      event.preventDefault();
      nativePromptSeen = true;
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setMode('native');
    };

    const installedHandler = () => {
      setDeferredPrompt(null);
      setMode('hidden');
    };

    window.addEventListener('beforeinstallprompt', promptHandler);
    window.addEventListener('appinstalled', installedHandler);

    // Если событие прошло до hydration или браузер prompt не отдаёт, не молчим:
    // показываем ручную Android-инструкцию.
    const fallbackTimer = setTimeout(() => {
      if (!nativePromptSeen && /Android/i.test(navigator.userAgent)) {
        setMode('android-guide');
      }
    }, 2500);

    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener('beforeinstallprompt', promptHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setMode('hidden');
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setMode('hidden');
    try { localStorage.setItem('pwa_install_dismissed_v2', String(Date.now())); } catch { /* ignore */ }
  };

  if (mode === 'native') {
    return (
      <div className="fade-up" style={bannerStyle}>
        <div style={iconStyle}>
          <Download size={22} color="var(--on-accent)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Установить S Bonus</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Быстрый доступ к бонусам</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={handleDismiss} className="btn btn-ghost" style={smallBtnStyle}>Позже</button>
          <button onClick={handleInstall} className="btn btn-primary" style={smallBtnStyle}>Установить</button>
        </div>
      </div>
    );
  }

  if (mode === 'ios' || mode === 'android-guide') {
    return (
      <div className="fade-up" style={bannerStyle}>
        <button onClick={handleDismiss} aria-label="Закрыть" style={{
          position: 'absolute', top: 10, right: 10, background: 'none',
          border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4,
        }}>
          <X size={16} />
        </button>
        <div style={iconStyle}>
          <Download size={22} color="var(--on-accent)" />
        </div>
        <div style={{ flex: 1, paddingRight: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Установить S Bonus
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            {mode === 'ios' ? (
              <>
                Нажмите{' '}
                <span style={pillStyle}>
                  <Share size={12} color="var(--text-2)" /> Поделиться
                </span>
                {' '}→{' '}
                <strong style={{ color: 'var(--text)', fontWeight: 600 }}>На экран «Домой»</strong>
              </>
            ) : (
              <>
                Откройте меню браузера{' '}
                <span style={pillStyle}>⋮</span>
                {' '}→{' '}
                <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Добавить на главный экран</strong>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

const bannerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 70,
  left: 12,
  right: 12,
  zIndex: 200,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 16,
  padding: '16px 18px',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  boxShadow: 'var(--shadow-2)',
};

const iconStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  background: 'var(--accent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const smallBtnStyle: React.CSSProperties = {
  width: 'auto',
  padding: '8px 14px',
  fontSize: 13,
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  background: 'var(--card-strong)',
  borderRadius: 999,
  padding: '2px 8px',
  verticalAlign: 'middle',
};
