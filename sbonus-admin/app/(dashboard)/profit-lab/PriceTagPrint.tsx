'use client';
/**
 * Печать ценников со скидкой — формат «как в магазине» (по умолчанию 58×40 мм).
 * Рамка делится на две части: сверху — название, снизу — цена.
 * Название и цены правятся вручную. Все размеры элементов настраиваются.
 * При скидке: старая цена зачёркнута + новая крупно + угловой бейдж «−X%».
 * Печать в отдельном окне с точным @page size (мм) — термопринтер / лист.
 */
import { useEffect, useRef, useState } from 'react';
import { Printer, Tag, RotateCcw, SlidersHorizontal } from 'lucide-react';

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

// Сохранение настроек ценника между сессиями (только размеры/вид, не данные товара).
const CFG_KEY = 'sbonus_pricetag_cfg_v1';
const loadCfg = (): Record<string, any> => {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(CFG_KEY) || '{}') || {}; } catch { return {}; }
};

export default function PriceTagPrint({
  name, oldPrice, newPrice, discount,
}: { name: string; oldPrice: number; newPrice: number; discount: number }) {
  // ── Редактируемые данные ценника ──
  const [eName, setEName] = useState(name);
  const [eOld, setEOld] = useState<number>(Math.round(oldPrice));
  const [eNew, setENew] = useState<number>(Math.round(newPrice));
  const dirty = useRef(false);

  useEffect(() => {
    setEName(name); setEOld(Math.round(oldPrice)); setENew(Math.round(newPrice));
    dirty.current = false;
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty.current) { setEOld(Math.round(oldPrice)); setENew(Math.round(newPrice)); }
  }, [oldPrice, newPrice]);

  const resetFromProduct = () => {
    setEName(name); setEOld(Math.round(oldPrice)); setENew(Math.round(newPrice));
    dirty.current = false;
  };

  // ── Размеры ценника ──
  const [w, setW] = useState(58);
  const [h, setH] = useState(40);
  const [cell, setCell] = useState(3);
  const [qty, setQty] = useState(1);
  const [showOld, setShowOld] = useState(true);
  const [showBadge, setShowBadge] = useState(true);
  const [boldIdx, setBoldIdx] = useState(1);
  const [fontScale, setFontScale] = useState(1);

  // ── Расширенные размеры элементов (0 = авто) ──
  const [showAdv, setShowAdv] = useState(false);
  const [borderMm, setBorderMm] = useState(0.4);   // толщина рамки
  const [splitPct, setSplitPct] = useState(50);    // доля строки названия, %
  const [nameMm, setNameMm] = useState(0);         // шрифт названия (0=авто)
  const [newMm, setNewMm] = useState(0);           // шрифт новой цены (0=авто)
  const [oldMm, setOldMm] = useState(0);           // шрифт старой цены (0=авто)
  const [badgeMm, setBadgeMm] = useState(3);       // шрифт бейджа
  const [padMm, setPadMm] = useState(2.5);         // боковой отступ названия

  // ── Сохранённые настройки: загрузка один раз, затем автосохранение ──
  const cfgLoaded = useRef(false);
  useEffect(() => {
    const c = loadCfg();
    if (c.w != null) setW(c.w);
    if (c.h != null) setH(c.h);
    if (c.cell != null) setCell(c.cell);
    if (c.qty != null) setQty(c.qty);
    if (c.showOld != null) setShowOld(c.showOld);
    if (c.showBadge != null) setShowBadge(c.showBadge);
    if (c.boldIdx != null) setBoldIdx(c.boldIdx);
    if (c.fontScale != null) setFontScale(c.fontScale);
    if (c.showAdv != null) setShowAdv(c.showAdv);
    if (c.borderMm != null) setBorderMm(c.borderMm);
    if (c.splitPct != null) setSplitPct(c.splitPct);
    if (c.nameMm != null) setNameMm(c.nameMm);
    if (c.newMm != null) setNewMm(c.newMm);
    if (c.oldMm != null) setOldMm(c.oldMm);
    if (c.badgeMm != null) setBadgeMm(c.badgeMm);
    if (c.padMm != null) setPadMm(c.padMm);
    cfgLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!cfgLoaded.current) return;
    const cfg = { w, h, cell, qty, showOld, showBadge, boldIdx, fontScale, showAdv,
      borderMm, splitPct, nameMm, newMm, oldMm, badgeMm, padMm };
    try { window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
  }, [w, h, cell, qty, showOld, showBadge, boldIdx, fontScale, showAdv,
      borderMm, splitPct, nameMm, newMm, oldMm, badgeMm, padMm]);

  // Скидка считается из самих цен.
  const calcDiscount = eOld > 0 && eNew < eOld ? Math.round((1 - eNew / eOld) * 100) : 0;
  const hasDiscount = calcDiscount > 0;
  const withOld = hasDiscount && showOld;
  const withBadge = hasDiscount && showBadge;
  const b = BOLD[boldIdx];
  const strokeCss = (mm: number) => (mm > 0 ? `-webkit-text-stroke:${mm}mm #1a1a1a;` : '');

  const PX = 3.78; // мм → px (96 dpi)

  // Итоговые размеры (override → авто) с учётом общего масштаба.
  const autoNew = withOld ? 8.5 * (w / 58) : 10 * (w / 58);
  const fNameMm = (nameMm > 0 ? nameMm : nameFontMm(eName, w)) * fontScale;
  const fNewMm = (newMm > 0 ? newMm : autoNew) * fontScale;
  const fOldMm = (oldMm > 0 ? oldMm : 3.4) * fontScale;
  const bw = Math.max(0.1, borderMm);
  const nameFlex = Math.min(90, Math.max(10, splitPct));
  const priceFlex = 100 - nameFlex;

  const tagHtml = () => {
    const old = withOld ? `<div class="old">${fmtPrice(eOld)}с</div>` : '';
    const badge = withBadge ? `<div class="badge">−${calcDiscount}%</div>` : '';
    return `<div class="tag">${badge}<div class="name">${escapeHtml(eName)}</div>` +
      `<div class="price">${old}<div class="new">${fmtPrice(eNew)}с</div></div></div>`;
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
      `.tag{position:relative;width:${w}mm;height:${h}mm;border:${bw}mm solid #1a1a1a;` +
      `border-radius:${(cell * 0.6).toFixed(2)}mm;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;}` +
      '.tag:last-child{page-break-after:auto;}' +
      `.name{flex:${nameFlex};display:flex;align-items:center;padding:0 ${padMm}mm;font-weight:${b.nameW};${strokeCss(b.stroke)}` +
      `font-size:${fNameMm.toFixed(2)}mm;line-height:1.08;color:#1a1a1a;word-break:break-word;overflow:hidden;}` +
      `.price{flex:${priceFlex};border-top:${bw}mm solid #1a1a1a;display:flex;flex-direction:column;` +
      'align-items:center;justify-content:center;gap:0.4mm;}' +
      `.old{font-size:${fOldMm.toFixed(2)}mm;font-weight:${b.oldW};color:#555;text-decoration:line-through;}` +
      `.new{font-weight:${b.newW};font-size:${fNewMm.toFixed(2)}mm;color:#1a1a1a;letter-spacing:-0.3mm;${strokeCss(b.stroke)}}` +
      `.badge{position:absolute;top:0;right:0;background:#e11d48;color:#fff;font-weight:800;` +
      `font-size:${badgeMm}mm;padding:0.6mm 1.6mm;border-bottom-left-radius:1.5mm;}` +
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
  const fldL: React.CSSProperties = { ...fld, textAlign: 'left' };
  const fldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
  const fldLbl: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: 0.2, textTransform: 'uppercase' };

  const numField = (label: string, val: number, set: (n: number) => void, step = 0.1, min = 0, max = 999) => (
    <div style={fldWrap}><span style={fldLbl}>{label}</span>
      <input type="number" step={step} min={min} max={max} value={val}
        onChange={e => set(Number(e.target.value) || 0)} style={fld} /></div>
  );

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Tag size={15} color="var(--accent)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>Печать ценника со скидкой</div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Название, цены и все размеры настраиваются</div>
        </div>
        <button onClick={resetFromProduct} title="Сбросить из товара"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
            color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <RotateCcw size={13} /> Из товара
        </button>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* ── Превью ── */}
        <div style={{
          background: '#f4f4f5', padding: 18, borderRadius: 14, border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            position: 'relative', width: w * PX, height: h * PX, background: '#fff',
            border: `${bw * PX}px solid #1a1a1a`, borderRadius: cell * 0.6 * PX, display: 'flex',
            flexDirection: 'column', overflow: 'hidden', fontFamily: 'Arial, Helvetica, sans-serif',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)', transition: 'width .2s, height .2s',
          }}>
            {withBadge && (
              <div style={{
                position: 'absolute', top: 0, right: 0, background: '#e11d48', color: '#fff',
                fontWeight: 800, fontSize: badgeMm * PX * 0.85, padding: '2px 6px',
                borderBottomLeftRadius: 6,
              }}>−{calcDiscount}%</div>
            )}
            <div style={{
              flex: nameFlex, display: 'flex', alignItems: 'center', padding: `0 ${padMm * PX}px`,
              fontSize: fNameMm * PX, lineHeight: 1.08, color: '#1a1a1a', overflow: 'hidden',
              fontWeight: b.nameW, WebkitTextStroke: b.stroke ? `${(b.stroke * PX).toFixed(2)}px #1a1a1a` : undefined,
              wordBreak: 'break-word',
            }}>{eName}</div>
            <div style={{
              flex: priceFlex, borderTop: `${bw * PX}px solid #1a1a1a`, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
            }}>
              {withOld && (
                <div style={{ fontSize: fOldMm * PX, fontWeight: b.oldW, color: '#555', textDecoration: 'line-through' }}>
                  {fmtPrice(eOld)}с
                </div>
              )}
              <div style={{ fontWeight: b.newW, fontSize: fNewMm * PX, color: '#1a1a1a', letterSpacing: -1, WebkitTextStroke: b.stroke ? `${(b.stroke * PX).toFixed(2)}px #1a1a1a` : undefined }}>
                {fmtPrice(eNew)}с
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#71717a', fontWeight: 600 }}>{w} × {h} мм</div>
        </div>

        {/* ── Настройки ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 230, flex: 1 }}>
          {/* Данные */}
          <div style={fldWrap}>
            <span style={fldLbl}>Название</span>
            <input type="text" value={eName}
              onChange={e => { dirty.current = true; setEName(e.target.value); }}
              placeholder="Название товара" style={fldL} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={fldWrap}><span style={fldLbl}>Старая цена</span>
              <input type="number" min={0} value={eOld}
                onChange={e => { dirty.current = true; setEOld(Number(e.target.value) || 0); }} style={fld} /></div>
            <div style={fldWrap}><span style={{ ...fldLbl, color: 'var(--accent)' }}>Цена со скидкой</span>
              <input type="number" min={0} value={eNew}
                onChange={e => { dirty.current = true; setENew(Number(e.target.value) || 0); }}
                style={{ ...fld, borderColor: 'var(--accent-border)' }} /></div>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

          {/* Пресеты размеров */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { setW(p.w); setH(p.h); }}
                className={`chip ${w === p.w && h === p.h ? 'active' : ''}`}>{p.label}</button>
            ))}
          </div>

          {/* Жирность */}
          <div>
            <div style={{ ...fldLbl, marginBottom: 6 }}>Жирность</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BOLD.map((x, i) => (
                <button key={x.label} onClick={() => setBoldIdx(i)}
                  className={`chip ${boldIdx === i ? 'active' : ''}`}>{x.label}</button>
              ))}
            </div>
          </div>

          {/* Размер шрифта (общий масштаб) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={fldLbl}>Размер шрифта</span>
              <span className="numeric" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(fontScale * 100)}%</span>
            </div>
            <input type="range" min={0.7} max={1.5} step={0.05} value={fontScale}
              onChange={e => setFontScale(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {[0.85, 1, 1.15, 1.3].map(v => (
                <button key={v} onClick={() => setFontScale(v)}
                  className={`chip ${Math.abs(fontScale - v) < 0.001 ? 'active' : ''}`}>{Math.round(v * 100)}%</button>
              ))}
            </div>
          </div>

          {/* Размеры ценника */}
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

          {/* ── Расширенные размеры ── */}
          <button onClick={() => setShowAdv(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600,
              color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 9, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><SlidersHorizontal size={14} /> Расширенные размеры</span>
            <span style={{ color: 'var(--text3)' }}>{showAdv ? '▲' : '▼'}</span>
          </button>

          {showAdv && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              {/* Доля строки названия */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={fldLbl}>Высота названия</span>
                  <span className="numeric" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{nameFlex}% / {priceFlex}%</span>
                </div>
                <input type="range" min={20} max={80} step={1} value={splitPct}
                  onChange={e => setSplitPct(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {numField('Рамка, мм', borderMm, setBorderMm, 0.1, 0.1, 3)}
                {numField('Отступ, мм', padMm, setPadMm, 0.5, 0, 10)}
                {numField('Шрифт назв., мм', nameMm, setNameMm, 0.1, 0, 20)}
                {numField('Шрифт цены, мм', newMm, setNewMm, 0.1, 0, 30)}
                {numField('Стар. цена, мм', oldMm, setOldMm, 0.1, 0, 20)}
                {numField('Бейдж, мм', badgeMm, setBadgeMm, 0.1, 1, 10)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>
                0 = авто (подбирается под ширину). Общий «Размер шрифта %» применяется поверх.
              </div>
            </div>
          )}

          {/* Тумблеры */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showOld} onChange={e => setShowOld(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
              Старая цена (зачёркнутая)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showBadge} onChange={e => setShowBadge(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
              Бейдж «−{calcDiscount}%»
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
