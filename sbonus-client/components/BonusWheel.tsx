'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Disc3, Ticket, ShoppingCart, Gift, Meh, Package, Wallet, ArrowUpRight, ArrowDownRight, X, ChevronDown, Loader2 } from 'lucide-react';
import { wheelAPI, customerAPI, CabinetTransaction } from '@/lib/api';

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
const WHEEL_SIZE = 300;
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

/* ── confetti particle system ──────────────── */
function createConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const colors = ['#FFE600', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ec4899', '#fff'];
  const particles: Array<{
    x: number; y: number; w: number; h: number;
    color: string; vx: number; vy: number; rot: number; vr: number;
    opacity: number;
  }> = [];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: W / 2 + (Math.random() - 0.5) * 60,
      y: H / 2 - 40,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * -14 - 4,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 15,
      opacity: 1,
    });
  }

  let frame = 0;
  const maxFrames = 90;

  function animate() {
    if (frame >= maxFrames) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx;
      p.vy += 0.35;
      p.y += p.vy;
      p.rot += p.vr;
      p.opacity = Math.max(0, 1 - frame / maxFrames);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    requestAnimationFrame(animate);
  }
  animate();
}

export default function BonusWheel() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [spins, setSpins] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState(0);

  // Win overlay state
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const confettiRef = useRef<HTMLCanvasElement>(null);

  // Post-spin balance/history state
  const [showHistory, setShowHistory] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<CabinetTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

    ctx.save();
    ctx.translate(center, center);

    segments.forEach((seg, i) => {
      const angle = arc * i;

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

    // Center hub
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(center, center, 26, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.restore();

    const hubGrad = ctx.createRadialGradient(center - 4, center - 4, 2, center, center, 26);
    hubGrad.addColorStop(0, '#2a2a2a');
    hubGrad.addColorStop(1, '#0d0d0d');
    ctx.beginPath();
    ctx.arc(center, center, 24, 0, 2 * Math.PI);
    ctx.fillStyle = hubGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, 24, 0, 2 * Math.PI);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = GOLD;
    ctx.font = `bold 11px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', center, center);

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

  /* ── show win overlay ─────────────────────── */
  const showWinOverlay = useCallback((data: SpinResult) => {
    setShowOverlay(true);
    // Trigger entrance animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOverlayVisible(true);
      });
    });

    // Fire confetti for wins
    const isWin = data.value > 0 || data.prize_type === 'physical';
    if (isWin && confettiRef.current) {
      const c = confettiRef.current;
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      setTimeout(() => createConfetti(c), 200);
    }

    if (navigator.vibrate) {
      navigator.vibrate(isWin ? [50, 30, 80, 30, 120] : [40, 20, 60]);
    }
  }, []);

  /* ── dismiss overlay ──────────────────────── */
  const dismissOverlay = useCallback(async (forceBalance = false) => {
    setOverlayVisible(false);
    setTimeout(() => setShowOverlay(false), 300);

    // If user has spins and didn't force balance view → back to spinner
    if (spins > 0 && !forceBalance) return;

    // Otherwise show balance & history
    setLoadingHistory(true);
    setShowHistory(true);
    try {
      const { data } = await customerAPI.me();
      setBalance(Number(data.balance));
      setTransactions(data.recent_transactions || []);
    } catch { /* ignore */ }
    finally { setLoadingHistory(false); }
  }, [spins]);

  /* ── handle spin ───────────────────────── */
  const handleSpin = async () => {
    if (spinning || spins <= 0) return;
    setSpinning(true);
    setResult(null);
    setShowHistory(false);

    if (navigator.vibrate) navigator.vibrate(30);

    try {
      const { data } = await wheelAPI.spin();
      const segIndex = segments.findIndex(s => s.id === data.segment_id);
      const arc = 360 / segments.length;

      const segCenterDeg = segIndex * arc + arc / 2;
      const currentNorm = ((rotation % 360) + 360) % 360;
      const targetAngle = ((270 - segCenterDeg - currentNorm) % 360 + 360) % 360;
      const newRotation = rotation + 360 * 6 + targetAngle;

      setRotation(newRotation);

      setTimeout(() => {
        setResult(data);
        setSpins(data.spins_remaining);
        setSpinning(false);
        showWinOverlay(data);
      }, 4800);

    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || 'Ошибка';
      setResult({ segment_id: 0, label: '', value: 0, message: msg, new_balance: 0, spins_remaining: spins });
      setSpinning(false);
    }
  };

  /* ── back to spinner ─────────────────────── */
  const backToSpinner = () => {
    setShowHistory(false);
    setResult(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 0', color: 'var(--text-2)' }}>
        <Loader2 size={22} className="spinner" />
        <span style={{ fontSize: 14 }}>Загрузка колеса...</span>
      </div>
    );
  }

  const isPhysical = result?.prize_type === 'physical';
  const isWin = (result?.value ?? 0) > 0 || isPhysical;

  /* ── POST-SPIN: Balance & History View ───── */
  if (showHistory) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 16, padding: '20px 16px', width: '100%', maxWidth: 400, margin: '0 auto',
        animation: 'fadeSlideUp 0.5s ease-out',
      }}>
        {/* Back button */}
        <button onClick={backToSpinner} style={{
          alignSelf: 'flex-start',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '8px 16px',
          color: '#8899aa', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Disc3 size={14} /> Крутить ещё
        </button>

        {/* Balance Card */}
        <div style={{
          width: '100%',
          background: 'linear-gradient(135deg, rgba(255,230,0,0.08), rgba(255,230,0,0.02))',
          border: '1px solid rgba(255,230,0,0.15)',
          borderRadius: 16, padding: 20, textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <Wallet size={20} color={GOLD} />
            <span style={{ fontSize: 13, color: '#8899aa', fontWeight: 600 }}>Ваш баланс</span>
          </div>
          {loadingHistory ? (
            <div style={{ fontSize: 28, fontWeight: 800, color: '#64748b' }}>...</div>
          ) : (
            <div style={{ fontSize: 32, fontWeight: 800, color: GOLD }}>
              {balance !== null ? `${balance.toLocaleString('ru-RU')} сом` : '—'}
            </div>
          )}
        </div>

        {/* Last win summary */}
        {result && isWin && (
          <div style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            background: isPhysical
              ? 'rgba(168,85,247,0.08)'
              : 'rgba(34,197,94,0.08)',
            border: `1px solid ${isPhysical ? 'rgba(168,85,247,0.2)' : 'rgba(34,197,94,0.2)'}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            {isPhysical ? <Package size={24} color="#a855f7" /> : <Gift size={24} color="#22c55e" />}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isPhysical ? '#a855f7' : '#22c55e' }}>
                {isPhysical ? `Приз: ${result.label}` : `+${result.value} сом`}
              </div>
              <div style={{ fontSize: 11, color: '#8899aa' }}>Только что выиграно</div>
            </div>
          </div>
        )}

        {/* Transactions */}
        <div style={{ width: '100%' }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#ccd6e0',
            marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <ChevronDown size={16} /> Последние операции
          </div>

          {loadingHistory ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>Загрузка...</div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 20, fontSize: 13 }}>
              Нет операций
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {transactions.slice(0, 10).map(tx => {
                const amt = Number(tx.amount);
                const isEarn = tx.type === 'earn' || tx.type === 'promo' || tx.type === 'referral';
                return (
                  <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10, padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: isEarn ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isEarn
                          ? <ArrowDownRight size={16} color="#22c55e" />
                          : <ArrowUpRight size={16} color="#ef4444" />
                        }
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#ccd6e0' }}>
                          {tx.note || (tx.type === 'earn' ? 'Начисление' : tx.type === 'spend' ? 'Списание' : tx.type)}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          {new Date(tx.created_at).toLocaleDateString('ru-RU', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: isEarn ? '#22c55e' : '#ef4444',
                    }}>
                      {isEarn ? '+' : '-'}{Math.abs(amt).toLocaleString('ru-RU')} сом
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '8px 0' }}>
          Каждая покупка даёт 1 попытку крутить колесо
        </div>

        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  /* ── MAIN: Spinner View ─────────────────── */
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

        {/* Pegs */}
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

      {/* Info */}
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '0 20px', lineHeight: 1.5 }}>
        Каждая покупка даёт 1 попытку крутить колесо.
        Выигрыш начисляется мгновенно на ваш бонусный счёт!
      </div>

      {/* ══════ WIN OVERLAY ══════ */}
      {showOverlay && result && (
        <div
          onClick={() => dismissOverlay()}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: overlayVisible ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0)',
            backdropFilter: overlayVisible ? 'blur(12px)' : 'blur(0px)',
            WebkitBackdropFilter: overlayVisible ? 'blur(12px)' : 'blur(0px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.4s ease-out',
            cursor: 'pointer',
          }}
        >
          {/* Confetti canvas */}
          <canvas ref={confettiRef} style={{
            position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          }} />

          {/* Prize card */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative', zIndex: 2,
              transform: overlayVisible ? 'scale(1) translateY(0)' : 'scale(0.5) translateY(40px)',
              opacity: overlayVisible ? 1 : 0,
              transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              background: isPhysical
                ? 'linear-gradient(145deg, rgba(168,85,247,0.15), rgba(10,15,26,0.95))'
                : isWin
                  ? 'linear-gradient(145deg, rgba(34,197,94,0.12), rgba(10,15,26,0.95))'
                  : 'linear-gradient(145deg, rgba(100,116,139,0.1), rgba(10,15,26,0.95))',
              border: `2px solid ${isPhysical ? 'rgba(168,85,247,0.4)' : isWin ? 'rgba(255,230,0,0.3)' : 'rgba(100,116,139,0.2)'}`,
              borderRadius: 24, padding: '36px 32px',
              textAlign: 'center', maxWidth: 320, width: '85vw',
              boxShadow: isWin
                ? '0 0 60px rgba(255,230,0,0.15), 0 20px 60px rgba(0,0,0,0.5)'
                : '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Close hint */}
            <div style={{
              position: 'absolute', top: 12, right: 14,
              color: '#64748b', cursor: 'pointer',
            }} onClick={() => dismissOverlay()}>
              <X size={20} />
            </div>

            {/* Icon */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isPhysical
                ? 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))'
                : isWin
                  ? 'linear-gradient(135deg, rgba(255,230,0,0.15), rgba(34,197,94,0.08))'
                  : 'rgba(100,116,139,0.1)',
              border: `2px solid ${isPhysical ? 'rgba(168,85,247,0.3)' : isWin ? 'rgba(255,230,0,0.2)' : 'rgba(100,116,139,0.15)'}`,
              animation: isWin ? 'iconPulse 2s ease-in-out infinite' : 'none',
            }}>
              {isPhysical
                ? <Package size={36} color="#a855f7" />
                : isWin
                  ? <Gift size={36} color={GOLD} />
                  : <Meh size={36} color="#8899aa" />
              }
            </div>

            {/* Title */}
            <div style={{
              fontSize: 16, fontWeight: 600,
              color: isPhysical ? '#c084fc' : isWin ? '#86efac' : '#94a3b8',
              marginBottom: 8,
            }}>
              {isPhysical ? 'Невероятно!' : isWin ? 'Поздравляем!' : 'Не повезло...'}
            </div>

            {/* Prize amount / label */}
            {isPhysical ? (
              <>
                <div style={{ fontSize: 14, color: '#8899aa', marginBottom: 6 }}>Вы выиграли приз</div>
                <div style={{
                  fontSize: 28, fontWeight: 800, color: '#a855f7',
                  textShadow: '0 0 20px rgba(168,85,247,0.4)',
                }}>
                  {result.label}
                </div>
                <div style={{ fontSize: 12, color: '#8899aa', marginTop: 10, lineHeight: 1.5 }}>
                  Обратитесь к кассиру для получения приза
                </div>
              </>
            ) : isWin ? (
              <>
                <div style={{
                  fontSize: 44, fontWeight: 900, color: GOLD,
                  textShadow: '0 0 30px rgba(255,230,0,0.3)',
                  lineHeight: 1.1,
                }}>
                  +{result.value}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,230,0,0.7)', marginTop: 2 }}>
                  сом
                </div>
                <div style={{
                  fontSize: 13, color: '#8899aa', marginTop: 12,
                  background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 12px',
                  display: 'inline-block',
                }}>
                  Баланс: <b style={{ color: GOLD }}>{result.new_balance.toLocaleString('ru-RU')} сом</b>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: '#8899aa', lineHeight: 1.5 }}>
                {result.message}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => dismissOverlay()}
              style={{
                marginTop: 20, width: '100%', padding: '12px 0',
                borderRadius: 12, border: 'none',
                fontSize: 14, fontWeight: 700,
                cursor: 'pointer',
                background: isWin
                  ? `linear-gradient(135deg, ${GOLD}, #f59e0b)`
                  : 'rgba(255,255,255,0.08)',
                color: isWin ? BG : '#ccc',
              }}
            >
              {spins > 0 ? 'Крутить ещё!' : 'Посмотреть баланс'}
            </button>
            {spins > 0 && (
              <button
                onClick={() => dismissOverlay(true)}
                style={{
                  marginTop: 8, width: '100%', padding: '10px 0',
                  borderRadius: 10, border: 'none',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: '#64748b',
                }}
              >
                Посмотреть баланс
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pegBlink {
          from { opacity: 0.4; }
          to { opacity: 1; }
        }
        @keyframes resultIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes iconPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
