'use client';
import { adminAPI } from '@/lib/api';
import { FileText, BarChart2 } from 'lucide-react';

export default function ExportButton({ days = 30 }: { days?: number }) {
  const download = async (format: 'csv' | 'xlsx') => {
    try {
      const { data } = await adminAPI.exportReport(format, days);
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `sbonus_report_${days}d.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Ошибка экспорта'); }
  };
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-secondary" onClick={() => download('csv')} style={{display: 'flex', alignItems: 'center', gap: 6}}><FileText size={16} /> CSV</button>
      <button className="btn btn-secondary" onClick={() => download('xlsx')} style={{display: 'flex', alignItems: 'center', gap: 6}}><BarChart2 size={16} /> Excel</button>
    </div>
  );
}
