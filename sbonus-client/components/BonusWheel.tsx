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

/* Canvas-only palette (canvas cannot read CSS vars) — curated v2 set */
const ACCENT = '#FFE600';
const ON_ACCENT = '#111111';
const NEUTRAL_A = '#262B36';
const NEUTRAL_B = '#1B202B';
const NEUTRAL_C = '#3A4150';

/* ── segment fill: alternating deep neutrals, accent for top prize ── */
function segmentFill(i: number, seg: Segment, maxValue: number, count: number): string {
  if (maxValue > 0 && seg.value === maxValue) return ACCENT;
  if (count % 2 === 1 && i === count - 1) return NEUTRAL_C;
  return i % 2 === 0 ? NEUTRAL_A : NEUTRAL_B;
}

/* ── confetti particle system ──────────────── */
function createConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const colors = [ACCENT, '#FFFFFF', '#34d399'];
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
    const maxValue = Math.max(...segments.map(s => s.value));

    ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);

    ctx.save();
    ctx.translate(center, center);

    segments.forEach((seg, i) => {
      const angle = arc * i;
      const fill = segmentFill(i, seg, maxValue, segments.length);

      // Flat segment fill
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + arc);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      // Divider line
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(radius * 0.18, 0);
      ctx.lineTo(radius, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Label text — dark on accent, white on neutrals
      ctx.save();
      ctx.rotate(angle + arc / 2);
      ctx.fillStyle = fill === ACCENT ? ON_ACCENT : '#FFFFFF';
      ctx.font = `600 13px Inter, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(seg.label, radius - 14, 0);
      ctx.restore();
    });

    ctx.restore();

    // Center hub — flat neutral with accent ring
    ctx.beginPath();
    ctx.arc(center, center, 26, 0, 2 * Math.PI);
    ctx.fillStyle = NEUTRAL_B;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, 24, 0, 2 * Math.PI);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = ACCENT;
    ctx.font = `600 11px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', center, center);

    // Outer rim — quiet hairline
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
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
      <div className="fade-up" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 16, padding: '20px 16px', width: '100%', maxWidth: 400, margin: '0 auto',
      }}>
        {/* Back button */}
        <button onClick={backToSpinner} style={{
          alignSelf: 'flex-start',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12, padding: '8px 16px',
          color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit',
        }}>
          <Disc3 size={14} /> Крутить ещё
        </button>

        {/* Balance Card */}
        <div style={{
          width: '100%',
          background: 'var(--card-strong)',
          border: '1px solid var(--accent-border)',
          borderRadius: 16, padding: 20, textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <Wallet size={20} color="var(--accent)" />
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Ваш баланс</span>
          </div>
          {loadingHistory ? (
            <div className="display numeric" style={{ color: 'var(--text-3)' }}>...</div>
          ) : (
            <div className="display numeric" style={{ color: 'var(--accent)' }}>
              {balance !== null ? `${balance.toLocaleString('ru-RU')} сом` : '—'}
            </div>
          )}
        </div>

        {/* Last win summary */}
        {result && isWin && (
          <div style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            background: 'var(--card)',
            border: '1px solid var(--border-strong)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div className="icon-tile" style={{ background: 'var(--accent-dim)' }}>
              {isPhysical ? <Package size={17} color="var(--accent)" /> : <Gift size={17} color="var(--accent)" />}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isPhysical ? 'var(--text)' : 'var(--success)' }}>
                {isPhysical ? `Приз: ${result.label}` : `+${result.value} сом`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Только что выиграно</div>
            </div>
          </div>
        )}

        {/* Transactions */}
        <div style={{ width: '100%' }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text)',
            marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <ChevronDown size={16} /> Последние операции
          </div>

          {loadingHistory ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>Загрузка...</div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20, fontSize: 13 }}>
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
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12, padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="icon-tile">
                        {isEarn
                          ? <ArrowDownRight size={17} color="var(--success)" />
                          : <ArrowUpRight size={17} color="var(--danger)" />
                        }
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                          {tx.note || (tx.type === 'earn' ? 'Начисление' : tx.type === 'spend' ? 'Списание' : tx.type)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {new Date(tx.created_at).toLocaleDateString('ru-RU', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="numeric" style={{
                      fontSize: 14, fontWeight: 700,
                      color: isEarn ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {isEarn ? '+' : '-'}{Math.abs(amt).toLocaleString('ru-RU')} сом
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>
          Каждая покупка даёт одну попытку
        </div>
      </div>
    );
  }

  /* ── MAIN: Spinner View ─────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '16px 16px 0' }}>
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Disc3 size={20} color="var(--accent)" /> Колесо удачи
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 0' }}>
          Одна покупка — одна попытка
        </p>
      </div>

      {/* Spins counter */}
      <div style={{
        background: spins > 0 ? 'var(--accent-dim)' : 'var(--card)',
        borderRadius: 12, padding: '8px 20px',
        display: 'flex', alignItems: 'center', gap: 8,
        border: spins > 0 ? '1px solid var(--accent-border)' : '1px solid var(--border)',
      }}>
        <Ticket size={20} color={spins > 0 ? 'var(--accent)' : 'var(--text-3)'} />
        <div>
          <div className="numeric" style={{ fontSize: 17, fontWeight: 700, color: spins > 0 ? 'var(--accent)' : 'var(--text-3)' }}>{spins}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>попыток</div>
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
        {/* Outer decorative ring */}
        <div style={{
          position: 'absolute',
          width: WHEEL_SIZE + 28,
          height: WHEEL_SIZE + 28,
          borderRadius: 999,
          border: '1px solid var(--border-strong)',
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
              left: x - 3,
              top: y - 3,
              width: 6,
              height: 6,
              borderRadius: 999,
              background: spinning ? 'var(--accent)' : 'var(--border-strong)',
              transition: 'background 0.3s',
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
          borderTop: '22px solid var(--accent)',
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
        className="btn btn-primary"
        style={{ maxWidth: 280 }}
      >
        {spinning
          ? 'Крутится...'
          : spins > 0
            ? (<><Disc3 size={17} /> Крутить</>)
            : (<><ShoppingCart size={17} /> Сделайте покупку</>)
        }
      </button>

      {/* Info */}
      <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '0 20px', lineHeight: 1.5 }}>
        Каждая покупка даёт одну попытку.
        Выигрыш сразу зачисляется на бонусный счёт.
      </div>

      {/* ══════ WIN OVERLAY ══════ */}
      {showOverlay && result && (
        <div
          className="modal-backdrop"
          onClick={() => dismissOverlay()}
          style={{
            zIndex: 1000,
            opacity: overlayVisible ? 1 : 0,
            transition: 'opacity 0.3s var(--ease-out)',
            cursor: 'pointer',
          }}
        >
          {/* Confetti canvas */}
          <canvas ref={confettiRef} style={{
            position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          }} />

          {/* Prize card */}
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative', zIndex: 2, cursor: 'default' }}
          >
            {/* Close */}
            <div style={{
              position: 'absolute', top: 12, right: 14,
              color: 'var(--text-3)', cursor: 'pointer',
            }} onClick={() => dismissOverlay()}>
              <X size={20} />
            </div>

            {/* Icon */}
            <div className="modal-icon" style={{
              background: isWin ? 'var(--accent-dim)' : 'var(--card-strong)',
              border: isWin ? '1px solid var(--accent-border)' : '1px solid var(--border)',
            }}>
              {isPhysical
                ? <Package size={32} color="var(--accent)" />
                : isWin
                  ? <Gift size={32} color="var(--accent)" />
                  : <Meh size={32} color="var(--text-2)" />
              }
            </div>

            {/* Title */}
            <div style={{
              fontSize: 15, fontWeight: 600,
              color: isWin ? 'var(--text)' : 'var(--text-2)',
              marginBottom: 8,
            }}>
              {isPhysical ? 'Главный приз' : isWin ? 'Поздравляем' : 'В этот раз без приза'}
            </div>

            {/* Prize amount / label */}
            {isPhysical ? (
              <>
                <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 6 }}>Вы выиграли приз</div>
                <div className="h1" style={{ color: 'var(--accent)' }}>
                  {result.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.5 }}>
                  Обратитесь к кассиру для получения приза
                </div>
              </>
            ) : isWin ? (
              <>
                <div className="display numeric" style={{ color: 'var(--accent)' }}>
                  +{result.value}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 }}>
                  сом
                </div>
                <div className="numeric" style={{
                  fontSize: 13, color: 'var(--text-2)', marginTop: 12,
                  background: 'var(--card-strong)', borderRadius: 12, padding: '6px 12px',
                  display: 'inline-block',
                }}>
                  Баланс: <b style={{ color: 'var(--accent)', fontWeight: 700 }}>{result.new_balance.toLocaleString('ru-RU')} сом</b>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
                {result.message}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => dismissOverlay()}
              className={isWin ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ marginTop: 20 }}
            >
              {spins > 0 ? 'Крутить ещё' : 'Посмотреть баланс'}
            </button>
            {spins > 0 && (
              <button
                onClick={() => dismissOverlay(true)}
                className="btn btn-ghost"
                style={{ marginTop: 8, fontSize: 12, padding: '10px 0' }}
              >
                Посмотреть баланс
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
