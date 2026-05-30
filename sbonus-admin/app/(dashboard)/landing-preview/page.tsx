'use client';
import { useState } from 'react';
import { Globe, Eye, Code, ExternalLink } from 'lucide-react';

export default function LandingPreviewPage() {
  const [showCode, setShowCode] = useState(false);

  const landingUrl = 'https://smartcentr.store';

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={24} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Публичная страница</h1>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>smartcentr.store — лендинг S Bonus+</p>
          </div>
        </div>
        <a href={landingUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, background: '#6366f1', color: 'white', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          <ExternalLink size={16} /> Открыть
        </a>
      </div>

      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>smartcentr.store</span>
        </div>
        <div style={{ padding: 20, textAlign: 'center' }}>
          <Globe size={48} color="#374151" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af' }}>Лендинг будет доступен по адресу smartcentr.store</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>HTML-файл создан и готов к деплою на VPS</div>
        </div>
      </div>
    </div>
  );
}
