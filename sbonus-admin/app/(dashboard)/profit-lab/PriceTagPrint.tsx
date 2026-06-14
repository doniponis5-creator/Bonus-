'use client';
/**
 * Печать ценников со скидкой — формат «как в магазине» (по умолчанию 58×40 мм).
 * Рамка делится на две части: сверху — название, снизу — цена.
 * При скидке: старая цена зачёркнута + новая крупно + угловой бейдж «−X%».
 * Печать в отдельном окне с точным @page size (мм) — термопринтер / лист.
 */
import { useState } from 'react';
import { Printer, Tag } from 'lucide-react';

const fmtPrice = (n: number) =>
  (Math.round(Number(n) || 0)).toLocaleString('ru-RU').replace(/\s/g, ' ');

const escapeHtml = (s: string) =>
  String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Авто-размер шрифта названия под ширину ценника (мм). */
const nameFontMm = (name: string, wMm: number) => {
  const len = (name || '').length;
  const base = wMm / 58;
  if (len <= 14) return 4.2 * base;
  if (len <= 20) return 3.6 * base;
  if (len <= 28) return 3.0 * base;
  return 2.6 * base;
};

const PRESETS = [
  { label: '58×40', w: 58, h: 40 },
  { label: '40×30', w: 40, h: 30 },
  { label: '30×20', w: 30, h: 20 },
];

// Уровни жирности шрифта (вес + лёгкая обводка глифов для термопечати).
const BOLD = [
  { label: 'Обычный', nameW: 700, newW: 800, oldW: 600, stroke: 0 },
  { label: 'Жирный',  nameW: 800, newW: 900, oldW: 700, stroke: 0 },
  { label: 'Жирнее',  nameW: 900, newW: 900, oldW: 700, stroke: 0.12 },
];

export default function PriceTagPrint({
  name, oldPrice, newPrice, discount,
}: { name: string; oldPrice: number; newPrice: number; discount: number }) {
  const [w, setW] = useState(58);
  const [h, setH] = useState(40);
  const [cell, setCell] = useState(3);
  const [qty, setQty] = useState(1);
  const [showOld, setShowOld] = useState(true);
  const [showBadge, setShowBadge] = useState(true);
  const [boldIdx, setBoldIdx] = useState(1); // по умолчанию «Жирный»
  const [fontScale, setFontScale] = useState(1); // масштаб шрифта 0.7–1.5

  const hasDiscount = discount > 0 && newPrice < oldPrice;
  const withOld = hasDiscount && showOld;
  const withBadge = hasDiscount && showBadge;
  const b = BOLD[boldIdx];
  const strokeCss = (mm: number) => (mm > 0 ? `-webkit-text-stroke:${mm}mm #1a1a1a;` : '');

  const PX = 3.78; // мм → px (96 dpi)
  const newFontMm = withOld ? 8.5 * (w / 58) : 10 * (w / 58);

  const tagHtml = () => {
    const old = withOld ? `<div class="old">${fmtPrice(oldPrice)}с</div>` : '';
    const badge = withBadge ? `<div class="badge">−${Math.round(discount)}%</div>` : '';
    return `<div class="tag">${badge}<div class="name">${escapeHtml(name)}</div>` +
      `<div class="price">${old}<div class="new">${fmtPrice(newPrice)}с</div></div></div>`;
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=520,height=400');
    if (!win) { alert('Разрешите всплывающие окна, чтобы напечатать ценник.'); return; }
    const n = Math.max(1, Math.min(200, qty));
    const tags = Array.from({ length: n }, tagHtml).join('');
    win.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Ценник</title><style>' +
      '*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      `@page{size:${w}mm ${h}mm;margin:0;}` +
      'body{font-family:Arial,Helvetica,sans-serif;background:#fff;}' +
      `.tag{position:relative;width:${w}mm;height:${h}mm;border:1.5px solid #1a1a1a;` +
      `border-radius:${(cell * 0.6).toFixed(2)}mm;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;}` +
      '.tag:last-child{page-break-after:auto;}' +
      `.name{flex:1;display:flex;align-items:center;padding:0 2.5mm;font-weight:${b.nameW};${strokeCss(b.stroke)}` +
      `font-size:${(nameFontMm(name, w) * fontScale).toFixed(2)}mm;line-height:1.05;color:#1a1a1a;}` +
      '.price{flex:1;border-top:1.5px solid #1a1a1a;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:0.4mm;}' +
      `.old{font-size:${(3.4 * fontScale).toFixed(2)}mm;font-weight:${b.oldW};color:#555;text-decoration:line-through;}` +
      `.new{font-weight:${b.newW};font-size:${(newFontMm * fontScale).toFixed(2)}mm;color:#1a1a1a;letter-spacing:-0.3mm;${strokeCss(b.stroke)}}` +
      '.badge{position:absolute;top:0;right:0;background:#e11d48;color:#fff;font-weight:800;' +
      'font-size:3mm;padding:0.6mm 1.6mm;border-bottom-left-radius:1.5mm;}' +
      `</style></head><body>${tags}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  // ── стили ──
  const fld: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 9, color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
    textAlign: 'right', fontWeight: 600,
  };
  const fldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
  const fldLbl: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: 0.2, textTransform: 'uppercase' };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Tag size={15} color="var(--accent)" />
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>Печать ценника со скидкой</div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Формат как в магазине · точный размер в мм</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* ── Превью на «бумаге» ── */}
        <div style={{
          background: '#f4f4f5', padding: 18, borderRadius: 14, border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            position: 'relative', width: w * PX, height: h * PX, background: '#fff',
            border: '1.5px solid #1a1a1a', borderRadius: cell * 0.6 * PX, display: 'flex',
            flexDirection: 'column', overflow: 'hidden', fontFamily: 'Arial, Helvetica, sans-serif',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)', transition: 'width .2s, height .2s',
          }}>
            {withBadge && (
              <div style={{
                position: 'absolute', top: 0, right: 0, background: '#e11d48', color: '#fff',
                fontWeight: 800, fontSize: Math.max(9, 3 * PX * 0.42), padding: '2px 6px',
                borderBottomLeftRadius: 6,
              }}>−{Math.round(discount)}%</div>
            )}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', padding: '0 9px',
              fontSize: nameFontMm(name, w) * PX * fontScale, lineHeight: 1.05, color: '#1a1a1a', overflow: 'hidden',
              fontWeight: b.nameW, WebkitTextStroke: b.stroke ? `${(b.stroke * PX).toFixed(2)}px #1a1a1a` : undefined,
            }}>{name}</div>
            <div style={{
              flex: 1, borderTop: '1.5px solid #1a1a1a', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
            }}>
              {withOld && (
                <div style={{ fontSize: 13 * fontScale, fontWeight: b.oldW, color: '#555', textDecoration: 'line-through' }}>
                  {fmtPrice(oldPrice)}с
                </div>
              )}
              <div style={{ fontWeight: b.newW, fontSize: newFontMm * PX * fontScale, color: '#1a1a1a', letterSpacing: -1, WebkitTextStroke: b.stroke ? `${(b.stroke * PX).toFixed(2)}px #1a1a1a` : undefined }}>
                {fmtPrice(newPrice)}с
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#71717a', fontWeight: 600 }}>{w} × {h} мм</div>
        </div>

        {/* ── Настройки ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 230, flex: 1 }}>
          {/* Пресеты размеров */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { setW(p.w); setH(p.h); }}
                className={`chip ${w === p.w && h === p.h ? 'active' : ''}`}>{p.label}</button>
            ))}
          </div>

          {/* Жирность шрифта */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: 0.2, textTransform: 'uppercase', marginBottom: 6 }}>Жирность</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BOLD.map((x, i) => (
                <button key={x.label} onClick={() => setBoldIdx(i)}
                  className={`chip ${boldIdx === i ? 'active' : ''}`}>{x.label}</button>
              ))}
            </div>
          </div>

          {/* Размер шрифта */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: 0.2, textTransform: 'uppercase' }}>Размер шрифта</span>
              <span className="numeric" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(fontScale * 100)}%</span>
            </div>
            <input type="range" min={0.7} max={1.5} step={0.05} value={fontScale}
              onChange={e => setFontScale(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {[0.85, 1, 1.15, 1.3].map(v => (
                <button key={v} onClick={() => setFontScale(v)}
                  className={`chip ${Math.abs(fontScale - v) < 0.001 ? 'active' : ''}`}>{Math.round(v * 100)}%</button>
              ))}
            </div>
          </div>

          {/* Поля */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={fldWrap}><span style={fldLbl}>Ширина, мм</span>
              <input type="number" min={20} max={120} value={w} onChange={e => setW(Number(e.target.value) || 0)} style={fld} /></div>
            <div style={fldWrap}><span style={fldLbl}>Высота, мм</span>
              <input type="number" min={20} max={120} value={h} onChange={e => setH(Number(e.target.value) || 0)} style={fld} /></div>
            <div style={fldWrap}><span style={fldLbl}>Размер ячейки</span>
              <input type="number" min={0} max={20} value={cell} onChange={e => setCell(Number(e.target.value) || 0)} style={fld} /></div>
            <div style={fldWrap}><span style={fldLbl}>Кол-во, шт</span>
              <input type="number" min={1} max={200} value={qty} onChange={e => setQty(Number(e.target.value) || 1)} style={fld} /></div>
          </div>

          {/* Тумблеры */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showOld} onChange={e => setShowOld(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
              Старая цена (зачёркнутая)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showBadge} onChange={e => setShowBadge(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
              Бейдж «−{Math.round(discount)}%»
            </label>
          </div>

          <button onClick={handlePrint}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
            style={{
              marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              padding: '12px 16px', background: 'var(--accent)', color: '#000', border: 'none',
              borderRadius: 11, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 6px 16px var(--accent-dim)', transition: 'filter .15s, transform .1s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}>
            <Printer size={17} /> Печать{qty > 1 ? ` · ${qty} шт` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
