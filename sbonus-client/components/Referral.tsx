'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Gift, Users, Copy, Check, Share2, QrCode, Trophy, Loader2,
  Crown, Sparkles, Lock, MessageCircle,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { referralAPI, customerAPI } from '@/lib/api';

interface Milestone { referrals_needed: number; reward_amount: number; title: string; }
interface MyStats {
  referral_count: number;
  referral_code: string;
  total_bonus_earned: number;
  next_milestone: Milestone | null;
  claimed_milestones: number[];
  rank: number;
}

export default function Referral({ referralCode, onBalanceChange }: { referralCode: string; onBalanceChange?: () => void }) {
  const [stats, setStats] = useState<MyStats | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const link = typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${referralCode}` : '';
  const inviterBonus = info?.bonus_per_invite ?? 50;
  const inviteeBonus = info?.invitee_bonus ?? 25;
  const shareText = `🎁 Дарю тебе ${inviteeBonus} сом бонус в Смарт Центр!\n\nРегистрируйся по ссылке: ${link}`;

  const load = useCallback(async () => {
    try {
      const [s, m, i] = await Promise.all([
        referralAPI.myStats().catch(() => null),
        referralAPI.milestones().catch(() => null),
        customerAPI.referralInfo().catch(() => null),
      ]);
      if (s) setStats(s.data);
      if (m) setMilestones(m.data || []);
      if (i) setInfo(i.data);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const waShare = () => {
    if (navigator.vibrate) navigator.vibrate(20);
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };
  const nativeShare = () => {
    if (navigator.share) navigator.share({ title: 'Смарт Центр — Бонус', text: shareText, url: link }).catch(() => {});
    else copy();
  };
  const copy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const claim = async (n: number) => {
    if (claiming) return;
    setClaiming(n);
    try {
      const r = await referralAPI.claimMilestone(n);
      setToast({ msg: `Награда получена! +${r.data?.reward_amount ?? ''} сом` });
      setTimeout(() => setToast(null), 3500);
      await load();
      onBalanceChange?.();
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      setToast({ msg: typeof d === 'string' ? d : (d?.message || 'Не удалось получить'), error: true });
      setTimeout(() => setToast(null), 3500);
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 0', color: 'var(--text-2)' }}>
        <Loader2 size={22} className="spinner" />
        <span style={{ fontSize: 14 }}>Загрузка...</span>
      </div>
    );
  }

  const count = stats?.referral_count ?? 0;
  const next = stats?.next_milestone || null;
  const nextPct = next ? Math.min(100, (count / next.referrals_needed) * 100) : 100;

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* ── HERO ── */}
      <div className="card card-accent" style={{ marginBottom: 12, textAlign: 'center', padding: '22px 18px' }}>
        <div style={{
          width: 60, height: 60, borderRadius: 18, margin: '0 auto 12px',
          background: 'linear-gradient(135deg, #FFE600, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 22px rgba(255,230,0,0.32)',
        }}>
          <Users size={30} color="#0a0a0a" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Приглашай друзей</h2>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
          За каждого друга <b style={{ color: 'var(--accent)' }}>ты +{inviterBonus} сом</b>,
          а <b style={{ color: '#34d399' }}>друг +{inviteeBonus} сом</b>!
        </p>
      </div>

      {/* ── ГЛАВНАЯ КНОПКА: WhatsApp ── */}
      <button
        onClick={waShare}
        className="tap"
        style={{
          width: '100%', padding: '16px', borderRadius: 16, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #25D366, #1da851)', color: '#fff',
          fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: '0 6px 22px rgba(37,211,102,0.32)', marginBottom: 10,
        }}
      >
        <MessageCircle size={22} /> Отправить другу в WhatsApp
      </button>

      {/* ── Вторичные действия ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <SecBtn onClick={copy} icon={copied ? <Check size={16} /> : <Copy size={16} />} label={copied ? 'Скопировано' : 'Копировать'} active={copied} />
        <SecBtn onClick={nativeShare} icon={<Share2 size={16} />} label="Поделиться" />
        <SecBtn onClick={() => setShowQR(v => !v)} icon={<QrCode size={16} />} label="QR-код" active={showQR} />
      </div>

      {/* ── QR ── */}
      {showQR && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 16 }}>
            <QRCodeSVG value={link} size={180} level="M" />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            Покажи этот код другу — пусть отсканирует камерой
          </p>
        </div>
      )}

      {/* ── СТАТИСТИКА ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <Stat icon={<Users size={18} color="#FFE600" />} value={count} label="друзей" />
        <Stat icon={<Crown size={18} color="#f59e0b" />} value={`#${stats?.rank ?? '—'}`} label="место" />
        <Stat icon={<Gift size={18} color="#34d399" />} value={(stats?.total_bonus_earned ?? 0).toLocaleString('ru-RU')} label="сом" />
      </div>

      {/* ── ПРОГРЕСС К НАГРАДЕ ── */}
      {next && (
        <div className="card" style={{ marginBottom: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>До награды <b style={{ color: 'var(--accent)' }}>+{next.reward_amount} сом</b></span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{count} / {next.referrals_needed}</span>
          </div>
          <div className="progress"><div className="progress-bar" style={{ width: `${nextPct}%` }} /></div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}>
            Ещё <b style={{ color: 'var(--text)' }}>{Math.max(0, next.referrals_needed - count)}</b> {pluralFriends(Math.max(0, next.referrals_needed - count))} до награды!
          </p>
        </div>
      )}

      {/* ── МИЛСТОУНЫ ── */}
      <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 2px 10px' }}>
        <Trophy size={16} color="#FFE600" /> Награды за друзей
      </h3>
      {milestones.map(m => {
        const claimed = stats?.claimed_milestones?.includes(m.referrals_needed);
        const reached = count >= m.referrals_needed;
        const canClaim = reached && !claimed;
        const pct = Math.min(100, (count / m.referrals_needed) * 100);
        return (
          <div key={m.referrals_needed} className="card" style={{
            margin: '0 0 10px', padding: 14, display: 'flex', alignItems: 'center', gap: 12,
            border: canClaim ? '1px solid rgba(52,211,153,0.4)' : claimed ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--border)',
            opacity: claimed ? 0.65 : 1,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: reached ? 'linear-gradient(135deg, #FFE600, #f59e0b)' : 'rgba(255,255,255,0.06)',
            }}>
              {claimed ? <Check size={22} color="#0a0a0a" /> : reached ? <Sparkles size={22} color="#0a0a0a" /> : <Lock size={18} color="var(--text-3)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{m.referrals_needed} {pluralFriends(m.referrals_needed)} → +{m.reward_amount} сом</div>
              {!reached && (
                <div className="progress" style={{ marginTop: 6, height: 4 }}><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
              )}
              {claimed && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Награда получена</div>}
            </div>
            {canClaim && (
              <button onClick={() => claim(m.referrals_needed)} disabled={claiming === m.referrals_needed} className="tap"
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 10, padding: '9px 14px', flexShrink: 0,
                  fontWeight: 700, fontSize: 13, color: '#0a0a0a',
                  background: 'linear-gradient(135deg, #34d399, #10b981)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: claiming === m.referrals_needed ? 0.6 : 1,
                }}>
                {claiming === m.referrals_needed ? <Loader2 size={14} className="spinner" /> : <Gift size={14} />} Забрать
              </button>
            )}
          </div>
        );
      })}

      {/* ── TOAST ── */}
      {toast && (
        <div className="float-up" style={{
          position: 'fixed', bottom: 96, left: 16, right: 16, maxWidth: 448, margin: '0 auto',
          background: toast.error ? 'linear-gradient(135deg, #f87171, #ef4444)' : 'linear-gradient(135deg, #34d399, #10b981)',
          color: toast.error ? '#fff' : '#0a0a0a', borderRadius: 16, padding: '14px 18px', zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}>
          {toast.error ? <Lock size={20} /> : <Sparkles size={20} />}
          <div style={{ fontWeight: 700, fontSize: 14 }}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}

function SecBtn({ onClick, icon, label, active }: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button onClick={onClick} className="tap" style={{
      flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer',
      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
      background: active ? 'rgba(255,230,0,0.08)' : 'var(--card-strong)',
      color: active ? 'var(--accent)' : 'var(--text)',
      fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      {icon}{label}
    </button>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</div>
    </div>
  );
}

function pluralFriends(n: number): string {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'друг';
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'друга';
  return 'друзей';
}
