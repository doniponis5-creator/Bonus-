'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Disc3, Ticket, ShoppingCart, Gift, Meh, Package } from 'lucide-react';
import { wheelAPI } from '@/lib/api';

interface Segment {
  id: number;
  label: string;
  value: number;
  color: string;
  probability: number;
}

interface SpinResult {
  segment_id: number;
  label: string;
  value: number;
  message: string;
  new_balance: number;
  spins_remaining: number;
  prize_type?: string;
}

/* ── constants ─────────────────────────────── */
const WHEEL_SIZE = 300;    // CSS px
const GOLD = '#FFE600';
const BG = '#0a0f1a';

/* ── color helpers ─────────────────────────── */
function shadeColor(hex: string, pct: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(255 * pct)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * pct)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * pct)));
  return `rgb(${r},${g},${b})`;
}

export default function BonusWheel() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [spins, setSpins] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef(false);

  /* ── load config ─────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await wheelAPI.config();
        setSegments(data.segments);
        setSpins(data.spins_available);
      } catch { /* fallback */ }
      finally { setLoading(false); }
    })();
  }, []);

  /* ── draw wheel ONCE on canvas (static) ──── */
  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || segments.length === 0 || drawnRef.current) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for performance
    canvas.width = WHEEL_SIZE * dpr;
    canvas.height = WHEEL_SIZE * dpr;
    canvas.style.width = `${WHEEL_SIZE}px`;
    canvas.style.height = `${WHEEL_SIZE}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const center = WHEEL_SIZE / 2;
    const radius = center - 4;
    const arc = (2 * Math.PI) / segments.length;

    ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);

    /* ── segments ─────────────────────────── */
    ctx.save();
    ctx.translate(center, center);

    segments.forEach((seg, i) => {
      const angle = arc * i;

      // Segment fill with radial gradient
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + arc);
      ctx.closePath();

      const grad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
      grad.addColorStop(0, shadeColor(seg.color, 0.18));
      grad.addColorStop(0.55, seg.color);
      grad.addColorStop(1, shadeColor(seg.color, -0.15));
      ctx.fillStyle = grad;
      ctx.fill();

      // Subtle inner highlight
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + arc);
      ctx.closePath();
      ctx.clip();
      const hl = ctx.createLinearGradient(0, -radius, 0, radius);
      hl.addColorStop(0, 'rgba(255,255,255,0.07)');
      hl.addColorStop(0.5, 'transparent');
      hl.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = hl;
      ctx.fill();
      ctx.restore();

      // Divider line
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(radius * 0.18, 0);
      ctx.lineTo(radius, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Label text
      ctx.save();
      ctx.rotate(angle + arc / 2);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.font = `bold 13px "Inter", system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(seg.label, radius - 14, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    });

    ctx.restore();

    /* ── center hub ───────────────────────── */
    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(center, center, 26, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.restore();

    // Dark fill
    const hubGrad = ctx.createRadialGradient(center - 4, center - 4, 2, center, center, 26);
    hubGrad.addColorStop(0, '#2a2a2a');
    hubGrad.addColorStop(1, '#0d0d0d');
    ctx.beginPath();
    ctx.arc(center, center, 24, 0, 2 * Math.PI);
    ctx.fillStyle = hubGrad;
    ctx.fill();

    // Gold ring
    ctx.beginPath();
    ctx.arc(center, center, 24, 0, 2 * Math.PI);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text
    ctx.fillStyle = GOLD;
    ctx.font = `bold 11px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', center, center);

    /* ── outer ring (decorative) ──────────── */
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,230,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawnRef.current = true;
  }, [segments]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  /* ── handle spin ───────────────────────── */
  const handleSpin = async () => {
    if (spinning || spins <= 0) return;
    setSpinning(true);
    setResult(null);

    if (navigator.vibrate) navigator.vibrate(30);

    try {
      const { data } = await wheelAPI.spin();
      const segIndex = segments.findIndex(s => s.id === data.segment_id);
      const arc = 360 / segments.length;

      // Pointer at top = 270° in canvas coords
      const segCenterDeg = segIndex * arc + arc / 2;
      const currentNorm = ((rotation % 360) + 360) % 360;
      const targetAngle = ((270 - segCenterDeg - currentNorm) % 360 + 360) % 360;
      const newRotation = rotation + 360 * 6 + targetAngle;

      setRotation(newRotation);

      // Wait for animation to finish
      setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate([40, 20, 60]);
        setResult(data);
        setSpins(data.spins_remaining);
        setSpinning(false);
      }, 4800);

    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || 'Ошибка';
      setResult({ segment_id: 0, label: '', value: 0, message: msg, new_balance: 0, spins_remaining: spins });
      setSpinning(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#8899aa' }}>
        Загрузка колеса...
      </div>
    );
  }

  const isPhysical = result?.prize_type === 'physical';
  const isWin = (result?.value ?? 0) > 0 || isPhysical;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '16px 16px 0' }}>
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Disc3 size={20} /> Колесо Удачи
        </h2>
        <p style={{ fontSize: 12, color: '#8899aa', margin: '4px 0 0' }}>
          Каждая покупка = 1 попытка!
        </p>
      </div>

      {/* Spins counter */}
      <div style={{
        background: spins > 0 ? 'rgba(255,230,0,0.1)' : 'rgba(100,116,139,0.1)',
        borderRadius: 10, padding: '8px 20px',
        display: 'flex', alignItems: 'center', gap: 8,
        border: spins > 0 ? '1px solid rgba(255,230,0,0.15)' : '1px solid transparent',
      }}>
        <Ticket size={20} color={spins > 0 ? GOLD : '#64748b'} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: spins > 0 ? GOLD : '#64748b' }}>{spins}</div>
          <div style={{ fontSize: 10, color: '#8899aa' }}>попыток</div>
        </div>
      </div>

      {/* Wheel container */}
      <div style={{
        position: 'relative',
        width: WHEEL_SIZE + 40,
        height: WHEEL_SIZE + 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Outer decorative ring with pegs */}
        <div style={{
          position: 'absolute',
          width: WHEEL_SIZE + 28,
          height: WHEEL_SIZE + 28,
          borderRadius: '50%',
          border: '3px solid rgba(255,230,0,0.15)',
          boxShadow: spinning
            ? '0 0 30px rgba(255,230,0,0.15), inset 0 0 20px rgba(255,230,0,0.05)'
            : '0 0 15px rgba(0,0,0,0.3)',
          transition: 'box-shadow 0.5s',
        }} />

        {/* Pegs around the wheel (static dots) */}
        {Array.from({ length: 20 }).map((_, i) => {
          const angle = (360 / 20) * i - 90;
          const r = (WHEEL_SIZE + 28) / 2;
          const rad = (angle * Math.PI) / 180;
          const x = (WHEEL_SIZE + 40) / 2 + Math.cos(rad) * r;
          const y = (WHEEL_SIZE + 40) / 2 + Math.sin(rad) * r;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: x - 4,
              top: y - 4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: spinning
                ? (i % 2 === 0 ? GOLD : '#fff')
                : 'rgba(255,230,0,0.3)',
              boxShadow: spinning ? `0 0 6px ${i % 2 === 0 ? 'rgba(255,230,0,0.5)' : 'rgba(255,255,255,0.3)'}` : 'none',
              transition: 'all 0.3s',
              animation: spinning ? `pegBlink 0.6s ease-in-out ${i * 0.03}s infinite alternate` : 'none',
            }} />
          );
        })}

        {/* Pointer */}
        <div style={{
          position: 'absolute',
          top: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          width: 0, height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: `22px solid ${GOLD}`,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        }} />

        {/* Canvas — drawn ONCE, rotated via CSS transform (GPU) */}
        <canvas
          ref={canvasRef}
          width={WHEEL_SIZE}
          height={WHEEL_SIZE}
          style={{
            width: WHEEL_SIZE,
            height: WHEEL_SIZE,
            borderRadius: '50%',
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
              : 'none',
            willChange: spinning ? 'transform' : 'auto',
          }}
        />
      </div>

      {/* Spin Button */}
      <button
        onClick={handleSpin}
        disabled={spinning || spins <= 0}
        style={{
          width: '100%', maxWidth: 280,
          padding: '14px 0',
          borderRadius: 12,
          border: 'none',
          fontSize: 16, fontWeight: 800,
          cursor: spinning || spins <= 0 ? 'not-allowed' : 'pointer',
          background: spins > 0 ? `linear-gradient(135deg, ${GOLD}, #f59e0b)` : '#1c2a3a',
          color: spins > 0 ? BG : '#64748b',
          opacity: spinning ? 0.6 : 1,
          transition: 'opacity 0.3s',
          boxShadow: spins > 0 ? '0 4px 20px rgba(255,230,0,0.3)' : 'none',
          letterSpacing: spins > 0 ? 1 : 0,
        }}
      >
        {spinning
          ? 'Крутится...'
          : spins > 0
            ? (<><Disc3 size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> КРУТИТЬ!</>)
            : (<><ShoppingCart size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Сделайте покупку</>)
        }
      </button>

      {/* Result */}
      {result && (
        <div style={{
          width: '100%', maxWidth: 280,
          background: isPhysical
            ? 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(255,230,0,0.06))'
            : isWin
              ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(255,230,0,0.04))'
              : 'rgba(100,116,139,0.08)',
          border: `1px solid ${isPhysical ? 'rgba(168,85,247,0.3)' : isWin ? 'rgba(34,197,94,0.25)' : 'rgba(100,116,139,0.15)'}`,
          borderRadius: 14, padding: 16, textAlign: 'center',
          animation: 'resultIn 0.4s ease-out',
        }}>
          <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
            {isPhysical ? <Package size={28} color="#a855f7" /> : isWin ? <Gift size={28} color="#22c55e" /> : <Meh size={28} color="#8899aa" />}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: isPhysical ? '#a855f7' : isWin ? '#22c55e' : '#8899aa' }}>
            {result.message}
          </div>
          {isPhysical && (
            <div style={{ fontSize: 22, fontWeight: 800, color: GOLD, marginTop: 6 }}>
              {result.label}
            </div>
          )}
          {!isPhysical && result.value > 0 && (
            <div style={{ fontSize: 28, fontWeight: 800, color: GOLD, marginTop: 6 }}>
              +{result.value} KGS
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '0 20px', lineHeight: 1.5 }}>
        Каждая покупка даёт 1 попытку крутить колесо.
        Выигрыш начисляется мгновенно на ваш бонусный счёт!
      </div>

      <style>{`
        @keyframes pegBlink {
          from { opacity: 0.4; }
          to { opacity: 1; }
        }
        @keyframes resultIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
