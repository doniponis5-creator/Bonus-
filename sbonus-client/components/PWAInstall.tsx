'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
}

export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissed = localStorage.getItem('pwa_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    if (isIOS()) {
      // iOS: show custom guide after 2 seconds
      const timer = setTimeout(() => setShowIOSGuide(true), 2000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: use native install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShowBanner(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSGuide(false);
    localStorage.setItem('pwa_dismissed', String(Date.now()));
  };

  // ─── Android banner ───
  if (showBanner) {
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

  // ─── iOS guide ───
  if (showIOSGuide) {
    return (
      <div className="fade-up" style={bannerStyle}>
        <button onClick={handleDismiss} style={{
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
            Нажмите{' '}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'var(--card-strong)', borderRadius: 999, padding: '2px 8px',
              verticalAlign: 'middle',
            }}>
              <Share size={12} color="var(--text-2)" /> Поделиться
            </span>
            {' '}→{' '}
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>На экран «Домой»</strong>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Styles ───
const bannerStyle: React.CSSProperties = {
  position: 'fixed', bottom: 70, left: 12, right: 12, zIndex: 200,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 16, padding: '16px 18px',
  display: 'flex', alignItems: 'center', gap: 14,
  boxShadow: 'var(--shadow-2)',
};

const iconStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 12,
  background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const smallBtnStyle: React.CSSProperties = {
  width: 'auto', padding: '8px 14px', fontSize: 13,
};
