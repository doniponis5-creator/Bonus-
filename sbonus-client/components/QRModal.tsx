'use client';

import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  qrCode: string;
  fullName: string;
  onClose: () => void;
}

export default function QRModal({ open, qrCode, fullName, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: 24,
          maxWidth: 340,
          width: '100%',
          position: 'relative',
          textAlign: 'center',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'rgba(0,0,0,0.06)',
            border: 'none',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={18} color="#333" />
        </button>

        <p style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>Покажите кассиру</p>
        <p style={{ color: '#111', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{fullName}</p>

        <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block' }}>
          <QRCodeSVG value={qrCode} size={220} level="M" includeMargin={false} />
        </div>

        <p style={{ color: '#333', fontSize: 14, fontWeight: 600, marginTop: 16, fontFamily: 'monospace' }}>
          {qrCode}
        </p>
      </div>
    </div>
  );
}
