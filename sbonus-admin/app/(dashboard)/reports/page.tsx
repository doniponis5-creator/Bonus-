'use client';
import { useState } from 'react';
import { FileText, Calendar, Download, Printer, Eye } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function ReportsPage() {
  const [reportType, setReportType] = useState<'daily'|'monthly'>('daily');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [previewUrl, setPreviewUrl] = useState('');

  const generateReport = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : '';
    if (reportType === 'daily') {
      setPreviewUrl(`${API_URL}/api/v1/reports/daily?date=${date}`);
    } else {
      setPreviewUrl(`${API_URL}/api/v1/reports/monthly?month=${month}`);
    }
  };

  const openInNewTab = () => {
    if (previewUrl) window.open(previewUrl, '_blank');
  };

  const printReport = () => {
    if (previewUrl) {
      const w = window.open(previewUrl, '_blank');
      if (w) {
        w.onload = () => { setTimeout(() => w.print(), 500); };
      }
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={24} color="var(--warn)" />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Брендированные отчёты</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Генерация PDF-отчётов с брендингом Смарт Центр</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: 'var(--card)', borderRadius: 16, padding: 24, border: '1px solid var(--border)', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { id: 'daily', label: 'Ежедневный', icon: <Calendar size={16} /> },
            { id: 'monthly', label: 'Ежемесячный', icon: <FileText size={16} /> },
          ].map(t => (
            <button key={t.id} onClick={() => { setReportType(t.id as any); setPreviewUrl(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: reportType === t.id ? 'var(--accent)' : 'var(--bg2)', color: reportType === t.id ? 'var(--on-accent)' : 'var(--text2)' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {reportType === 'daily' ? (
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setPreviewUrl(''); }}
              style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--bg3)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14 }} />
          ) : (
            <input type="month" value={month} onChange={e => { setMonth(e.target.value); setPreviewUrl(''); }}
              style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--bg3)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14 }} />
          )}

          <button onClick={generateReport}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: 'var(--on-accent)' }}>
            <Eye size={16} /> Генерировать
          </button>

          {previewUrl && (
            <>
              <button onClick={openInNewTab}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, border: '1px solid var(--bg3)', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: 'var(--bg2)', color: 'var(--text)' }}>
                <Download size={16} /> Открыть
              </button>
              <button onClick={printReport}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, border: '1px solid var(--bg3)', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: 'var(--bg2)', color: 'var(--text)' }}>
                <Printer size={16} /> Печать
              </button>
            </>
          )}
        </div>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={16} color="var(--warn)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Предпросмотр</span>
          </div>
          <iframe src={previewUrl} style={{ width: '100%', height: 800, border: 'none', background: 'white' }} />
        </div>
      )}

      {!previewUrl && (
        <div style={{ background: 'var(--card)', borderRadius: 16, padding: 60, border: '1px solid var(--border)', textAlign: 'center' }}>
          <FileText size={48} color="var(--bg3)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>Выберите период и нажмите "Генерировать"</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Отчёт будет создан с брендингом Смарт Центр и готов к печати</div>
        </div>
      )}
    </div>
  );
}
