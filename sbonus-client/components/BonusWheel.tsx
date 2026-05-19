'use client';

import { useEffect, useRef, useState } from 'react';
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

export default function BonusWheel() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [spins, setSpins] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (segments.length > 0) drawWheel(rotation);
  }, [segments, rotation]);

  const loadConfig = async () => {
    try {
      const { data } = await wheelAPI.config();
      setSegments(data.segments);
      setSpins(data.spins_available);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  const drawWheel = (rot: number) => {
    const canvas = canvasRef.current;
    if (!canvas || segments.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 8;
    const arc = (2 * Math.PI) / segments.length;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((rot * Math.PI) / 180);

    segments.forEach((seg, i) => {
      const angle = arc * i;

      // Segment fill
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + arc);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();

      // Border
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.rotate(angle + arc / 2);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${size < 300 ? 11 : 14}px system-ui`;
      ctx.textAlign = 'right';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 3;
      ctx.fillText(seg.label, radius - 16, 5);
      ctx.restore();
    });

    ctx.restore();

    // Center circle
    ctx.beginPath();
    ctx.arc(center, center, 28, 0, 2 * Math.PI);
    ctx.fillStyle = '#0a0f1a';
    ctx.fill();
    ctx.strokeStyle = '#FFE600';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Center text
    ctx.fillStyle = '#FFE600';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('SPIN', center, center + 4);
  };

  const handleSpin = async () => {
    if (spinning || spins <= 0) return;
    setSpinning(true);
    setResult(null);

    try {
      const { data } = await wheelAPI.spin();
      const segIndex = segments.findIndex(s => s.id === data.segment_id);
      const arc = 360 / segments.length;

      // Calculate winning angle (pointer at top = 270deg visual)
      const targetAngle = 360 - (segIndex * arc + arc / 2);
      const totalRotation = rotation + 360 * 5 + targetAngle; // 5 full spins + target

      setRotation(totalRotation);

      // Animate
      const startRot = rotation;
      const totalDelta = totalRotation - startRot;
      const duration = 4000;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentRot = startRot + totalDelta * eased;

        drawWheel(currentRot);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setResult(data);
          setSpins(data.spins_remaining);
          setSpinning(false);
        }
      };

      requestAnimationFrame(animate);
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
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#FFE600' }}>
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
      }}>
        <Ticket size={24} color={spins > 0 ? '#FFE600' : '#64748b'} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: spins > 0 ? '#FFE600' : '#64748b' }}>
            {spins}
          </div>
          <div style={{ fontSize: 11, color: '#8899aa' }}>попыток</div>
        </div>
      </div>

      {/* Wheel */}
      <div style={{ position: 'relative' }}>
        {/* Pointer */}
        <div style={{
          position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: '24px solid #FFE600',
          zIndex: 10,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        }} />

        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          style={{
            width: 320, height: 320,
            filter: spinning ? 'brightness(1.1)' : 'brightness(1)',
            transition: 'filter 0.3s',
          }}
        />

        {/* Glow effect when spinning */}
        {spinning && (
          <div style={{
            position: 'absolute', inset: -10,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,230,0,0.15) 0%, transparent 70%)',
            animation: 'pulse 1s ease-in-out infinite',
          }} />
        )}
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
            ? 'linear-gradient(135deg, #FFE600, #f59e0b)'
            : '#1c2a3a',
          color: spins > 0 ? '#0a0f1a' : '#64748b',
          opacity: spinning ? 0.7 : 1,
          transition: 'all 0.3s',
          boxShadow: spins > 0 ? '0 4px 20px rgba(255,230,0,0.3)' : 'none',
        }}
      >
        {spinning ? (<><Disc3 size={18} style={{ display: 'inline', verticalAlign: 'middle' }} /> Крутится...</>) : spins > 0 ? (<><Disc3 size={18} style={{ display: 'inline', verticalAlign: 'middle' }} /> КРУТИТЬ!</>) : (<><ShoppingCart size={18} style={{ display: 'inline', verticalAlign: 'middle' }} /> Сделайте покупку</>)}
      </button>

      {/* Result */}
      {result && (
        <div style={{
          width: '100%', maxWidth: 300,
          background: result.value > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.1)',
          border: `1px solid ${result.value > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.2)'}`,
          borderRadius: 16, padding: 20, textAlign: 'center',
          animation: 'fadeIn 0.5s ease',
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
            <div style={{ fontSize: 28, fontWeight: 800, color: '#FFE600', marginTop: 8 }}>
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
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
