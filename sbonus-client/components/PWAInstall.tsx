'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed recently
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    const dismissed = localStorage.getItem('pwa_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

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
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa_dismissed', String(Date.now()));
  };

  if (!showBanner) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 70, left: 12, right: 12, zIndex: 200,
      background: 'linear-gradient(135deg, #1e293b, #0f172a)',
      border: '1px solid rgba(255,230,0,0.2)',
      borderRadius: 16, padding: '16px 18px',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'slideUp 0.3s ease-out',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: '#FFE600', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 900, color: '#0a0f1a', flexShrink: 0,
      }}>S</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2eaf6' }}>Установить приложение</div>
        <div style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }}>Быстрый доступ к бонусам</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={handleDismiss} style={{
          background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', padding: '6px 8px',
        }}>Позже</button>
        <button onClick={handleInstall} style={{
          background: '#FFE600', color: '#0a0f1a', border: 'none',
          borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>Установить</button>
      </div>
    </div>
  );
}
