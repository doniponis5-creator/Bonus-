'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Disc3, Ticket, ShoppingCart, Gift, Meh } from 'lucide-react';
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
}

/* ── constants ─────────────────────────────────────────── */
const CANVAS_SIZE = 360;           // logical px (retina handled by dpr)
const OUTER_RING = 18;             // width of LED ring
const LED_COUNT = 28;              // number of LED dots
const GOLD = '#FFE600';
const GOLD_DARK = '#c9a800';
const BG = '#0a0f1a';

/* ── easing: custom elastic-out for satisfying bounce ──── */
function elasticOut(t: number): number {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
}

/* ── darken / lighten color helpers ───────────────────── */
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef(0);           // accumulated rotation (degrees)
  const rafRef = useRef(0);           // rAF id
  const ledPhaseRef = useRef(0);      // LED animation phase

  /* ── load wheel config ─────────────────────────────── */
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

  /* ── draw wheel on canvas ──────────────────────────── */
  const drawWheel = useCallback((rot: number, ledPhase: number) => {
    const canvas = canvasRef.current;
    if (!canvas || segments.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== CANVAS_SIZE * dpr) {
      canvas.width = CANVAS_SIZE * dpr;
      canvas.height = CANVAS_SIZE * dpr;
      canvas.style.width = `${CANVAS_SIZE}px`;
      canvas.style.height = `${CANVAS_SIZE}px`;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const size = CANVAS_SIZE;
    const center = size / 2;
    const outerR = center - 4;
    const innerR = outerR - OUTER_RING;
    const segR = innerR - 2;
    const arc = (2 * Math.PI) / segments.length;

    ctx.clearRect(0, 0, size, size);

    /* ── outer metallic ring ──────────────────────────── */
    const ringGrad = ctx.createRadialGradient(center, center, innerR, center, center, outerR);
    ringGrad.addColorStop(0, '#2a2a2a');
    ringGrad.addColorStop(0.3, '#4a4a4a');
    ringGrad.addColorStop(0.6, '#3a3a3a');
    ringGrad.addColorStop(1, '#1a1a1a');
    ctx.beginPath();
    ctx.arc(center, center, outerR, 0, 2 * Math.PI);
    ctx.arc(center, center, innerR, 0, 2 * Math.PI, true);
    ctx.fillStyle = ringGrad;
    ctx.fill();

    // Metallic ring border lines
    ctx.beginPath();
    ctx.arc(center, center, outerR, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,230,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, innerR, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,230,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* ── LED dots ─────────────────────────────────────── */
    const ledR = (outerR + innerR) / 2;
    for (let i = 0; i < LED_COUNT; i++) {
      const a = (2 * Math.PI * i) / LED_COUNT - Math.PI / 2;
      const x = center + Math.cos(a) * ledR;
      const y = center + Math.sin(a) * ledR;

      // Alternate colors, phase-shifted for chase animation
      const on = (i + Math.floor(ledPhase)) % 3 === 0;
      const glow = on ? 1 : 0.25;

      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
      const ledColor = i % 2 === 0 ? GOLD : '#fff';
      ctx.fillStyle = on ? ledColor : 'rgba(80,80,80,0.5)';
      ctx.fill();

      if (on) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(255,230,0,${0.25 * glow})`;
        ctx.fill();
        ctx.restore();
      }
    }

    /* ── wheel segments ───────────────────────────────── */
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((rot * Math.PI) / 180);

    segments.forEach((seg, i) => {
      const angle = arc * i;

      // Segment fill with gradient for 3D depth
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, segR, angle, angle + arc);
      ctx.closePath();

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, segR);
      grad.addColorStop(0, shadeColor(seg.color, 0.15));
      grad.addColorStop(0.6, seg.color);
      grad.addColorStop(1, shadeColor(seg.color, -0.12));
      ctx.fillStyle = grad;
      ctx.fill();

      // Inner shadow overlay for 3D effect
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, segR, angle, angle + arc);
      ctx.closePath();
      ctx.clip();
      const shadow = ctx.createRadialGradient(0, 0, segR * 0.2, 0, 0, segR);
      shadow.addColorStop(0, 'rgba(255,255,255,0.08)');
      shadow.addColorStop(0.5, 'transparent');
      shadow.addColorStop(1, 'rgba(0,0,0,0.15)');
      ctx.fillStyle = shadow;
      ctx.fill();
      ctx.restore();

      // Gold divider lines
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(segR, 0);
      ctx.strokeStyle = 'rgba(255,230,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Text with shadow
      ctx.save();
      ctx.rotate(angle + arc / 2);
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(seg.label, segR - 18, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    });

    ctx.restore();

    /* ── premium center hub ───────────────────────────── */
    // Outer shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(center, center, 32, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.restore();

    // Metallic gradient
    const hubGrad = ctx.createRadialGradient(center - 6, center - 6, 4, center, center, 32);
    hubGrad.addColorStop(0, '#333');
    hubGrad.addColorStop(0.4, '#1a1a1a');
    hubGrad.addColorStop(1, '#0d0d0d');
    ctx.beginPath();
    ctx.arc(center, center, 30, 0, 2 * Math.PI);
    ctx.fillStyle = hubGrad;
    ctx.fill();

    // Gold border ring
    ctx.beginPath();
    ctx.arc(center, center, 30, 0, 2 * Math.PI);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner accent ring
    ctx.beginPath();
    ctx.arc(center, center, 24, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,230,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // SPIN text
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 13px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', center, center);

  }, [segments]);

  /* ── idle LED animation ─────────────────────────────── */
  useEffect(() => {
    if (segments.length === 0) return;
    let running = true;
    const tick = () => {
      if (!running) return;
      ledPhaseRef.current += 0.06;
      drawWheel(rotRef.current, ledPhaseRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [segments, drawWheel]);

  /* ── handle spin ────────────────────────────────────── */
  const handleSpin = async () => {
    if (spinning || spins <= 0) return;
    setSpinning(true);
    setResult(null);

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(30);

    try {
      const { data } = await wheelAPI.spin();
      const segIndex = segments.findIndex(s => s.id === data.segment_id);
      const arc = 360 / segments.length;

      // Pointer is at TOP = 270° in canvas coords (0°=3 o'clock, clockwise)
      // Segment i center = segIndex * arc + arc/2 degrees
      // After rotating wheel by R degrees, segment appears at (θ + R) mod 360
      // We need: θ + startRot + totalSpin ≡ 270 (mod 360)
      // So: targetAngle = (270 - θ - startNorm + 360) % 360
      const startRot = rotRef.current;
      const segCenterDeg = segIndex * arc + arc / 2;
      const startNorm = ((startRot % 360) + 360) % 360;
      const targetAngle = ((270 - segCenterDeg - startNorm) % 360 + 360) % 360;
      const totalSpin = 360 * 7 + targetAngle; // 7 full spins + precise target (NO random offset!)
      const endRot = startRot + totalSpin;

      const duration = 5500; // longer for more drama
      const startTime = performance.now();

      cancelAnimationFrame(rafRef.current);

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Two-phase easing: fast start → elastic bounce end
        let eased: number;
        if (progress < 0.7) {
          // First 70%: cubic ease-in-out for smooth acceleration
          const t = progress / 0.7;
          eased = 0.7 * (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        } else {
          // Last 30%: elastic deceleration with subtle bounce
          const t = (progress - 0.7) / 0.3;
          eased = 0.7 + 0.3 * elasticOut(t);
        }

        const currentRot = startRot + totalSpin * eased;
        rotRef.current = currentRot;

        // Speed up LED chase when spinning fast
        const speed = Math.max(0.06, (1 - progress) * 0.8);
        ledPhaseRef.current += speed;

        drawWheel(currentRot, ledPhaseRef.current);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          rotRef.current = endRot;
          // Haptic on result
          if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
          setResult(data);
          setSpins(data.spins_remaining);
          setSpinning(false);
          // Resume idle LED animation
          const idle = () => {
            ledPhaseRef.current += 0.06;
            drawWheel(rotRef.current, ledPhaseRef.current);
            rafRef.current = requestAnimationFrame(idle);
          };
          rafRef.current = requestAnimationFrame(idle);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '20px 16px' }}>
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: GOLD }}>
          <Disc3 size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> Колесо Удачи
        </h2>
        <p style={{ fontSize: 13, color: '#8899aa', margin: '6px 0 0' }}>
          Каждая покупка = 1 попытка!
        </p>
      </div>

      {/* Spins counter */}
      <div style={{
        background: spins > 0 ? 'rgba(255,230,0,0.12)' : 'rgba(100,116,139,0.12)',
        borderRadius: 12, padding: '10px 24px',
        display: 'flex', alignItems: 'center', gap: 8,
        border: spins > 0 ? '1px solid rgba(255,230,0,0.2)' : '1px solid transparent',
        transition: 'all 0.3s',
      }}>
        <Ticket size={24} color={spins > 0 ? GOLD : '#64748b'} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: spins > 0 ? GOLD : '#64748b' }}>
            {spins}
          </div>
          <div style={{ fontSize: 11, color: '#8899aa' }}>попыток</div>
        </div>
      </div>

      {/* Wheel */}
      <div style={{ position: 'relative' }}>
        {/* Premium pointer */}
        <div style={{
          position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10,
          width: 0, height: 0,
          borderLeft: '14px solid transparent',
          borderRight: '14px solid transparent',
          borderTop: `28px solid ${GOLD}`,
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.6)) drop-shadow(0 0 8px rgba(255,230,0,0.3))',
        }} />

        {/* Ambient glow behind wheel */}
        <div style={{
          position: 'absolute',
          inset: -20,
          borderRadius: '50%',
          background: spinning
            ? 'radial-gradient(circle, rgba(255,230,0,0.12) 0%, transparent 65%)'
            : 'radial-gradient(circle, rgba(255,230,0,0.05) 0%, transparent 65%)',
          transition: 'background 0.5s',
          pointerEvents: 'none',
        }} />

        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, display: 'block' }}
        />
      </div>

      {/* Spin Button */}
      <button
        onClick={handleSpin}
        disabled={spinning || spins <= 0}
        style={{
          width: '100%', maxWidth: 300,
          padding: '16px 0',
          borderRadius: 14,
          border: 'none',
          fontSize: 18, fontWeight: 800,
          cursor: spinning || spins <= 0 ? 'not-allowed' : 'pointer',
          background: spins > 0
            ? `linear-gradient(135deg, ${GOLD}, #f59e0b)`
            : '#1c2a3a',
          color: spins > 0 ? BG : '#64748b',
          opacity: spinning ? 0.7 : 1,
          transition: 'all 0.3s',
          boxShadow: spins > 0 ? '0 4px 24px rgba(255,230,0,0.35), 0 0 60px rgba(255,230,0,0.08)' : 'none',
          letterSpacing: spins > 0 ? 1 : 0,
        }}
      >
        {spinning
          ? (<><Disc3 size={18} style={{ display: 'inline', verticalAlign: 'middle', animation: 'spinIcon 1s linear infinite' }} /> Крутится...</>)
          : spins > 0
            ? (<><Disc3 size={18} style={{ display: 'inline', verticalAlign: 'middle' }} /> КРУТИТЬ!</>)
            : (<><ShoppingCart size={18} style={{ display: 'inline', verticalAlign: 'middle' }} /> Сделайте покупку</>)
        }
      </button>

      {/* Result */}
      {result && (
        <div style={{
          width: '100%', maxWidth: 300,
          background: result.value > 0
            ? 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(255,230,0,0.06))'
            : 'rgba(100,116,139,0.1)',
          border: `1px solid ${result.value > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.2)'}`,
          borderRadius: 16, padding: 20, textAlign: 'center',
          animation: 'resultPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
            {result.value > 0 ? <Gift size={32} color="#22c55e" /> : <Meh size={32} color="#8899aa" />}
          </div>
          <div style={{
            fontSize: 16, fontWeight: 700,
            color: result.value > 0 ? '#22c55e' : '#8899aa',
          }}>
            {result.message}
          </div>
          {result.value > 0 && (
            <div style={{
              fontSize: 32, fontWeight: 800, color: GOLD, marginTop: 8,
              textShadow: '0 0 20px rgba(255,230,0,0.4)',
              animation: 'countUp 0.6s ease-out',
            }}>
              +{result.value} KGS
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div style={{
        fontSize: 12, color: '#64748b', textAlign: 'center',
        padding: '0 20px', lineHeight: 1.6,
      }}>
        Каждая покупка даёт 1 попытку крутить колесо.
        Выигрыш начисляется мгновенно на ваш бонусный счёт!
      </div>

      <style>{`
        @keyframes spinIcon {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes resultPopIn {
          from { opacity: 0; transform: scale(0.8) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes countUp {
          from { opacity: 0; transform: scale(0.5); }
          50% { transform: scale(1.15); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
