'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Gift, Users, Copy, Check, Share2, QrCode, Trophy, Loader2,
  Crown, Lock, MessageCircle, AlertCircle,
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
  const shareText = `Дарю вам ${inviteeBonus} сом бонуса в Смарт Центр.\n\nРегистрируйтесь по ссылке: ${link}`;

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
      setToast({ msg: `Награда получена: +${r.data?.reward_amount ?? ''} сом` });
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
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
          background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Users size={26} color="var(--accent)" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.022em', marginBottom: 6 }}>Приглашайте друзей</h2>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
          За каждого друга <b style={{ color: 'var(--accent)', fontWeight: 600 }}>вы получаете +{inviterBonus} сом</b>,
          друг — <b style={{ color: 'var(--success)', fontWeight: 600 }}>+{inviteeBonus} сом</b>
        </p>
      </div>

      {/* ── WhatsApp share ── */}
      <button
        onClick={waShare}
        className="btn btn-secondary"
        style={{ marginBottom: 10 }}
      >
        <MessageCircle size={18} /> Поделиться в WhatsApp
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
          <div style={{ background: 'var(--text)', padding: 16, borderRadius: 16 }}>
            <QRCodeSVG value={link} size={180} level="M" />
          </div>
          <p className="caption" style={{ textAlign: 'center' }}>
            Покажите этот код другу — пусть отсканирует камерой
          </p>
        </div>
      )}

      {/* ── СТАТИСТИКА ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <Stat icon={<Users size={17} color="var(--accent)" />} value={count} label="друзей" />
        <Stat icon={<Crown size={17} color="var(--accent)" />} value={`#${stats?.rank ?? '—'}`} label="место" />
        <Stat icon={<Gift size={17} color="var(--success)" />} value={(stats?.total_bonus_earned ?? 0).toLocaleString('ru-RU')} label="сом" />
      </div>

      {/* ── ПРОГРЕСС К НАГРАДЕ ── */}
      {next && (
        <div className="card" style={{ marginBottom: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>До награды <b style={{ color: 'var(--accent)', fontWeight: 600 }}>+{next.reward_amount} сом</b></span>
            <span className="numeric" style={{ fontSize: 13, fontWeight: 600 }}>{count} / {next.referrals_needed}</span>
          </div>
          <div className="progress"><div className="progress-bar" style={{ width: `${nextPct}%` }} /></div>
          <p className="caption" style={{ marginTop: 6, textAlign: 'center' }}>
            Ещё <b style={{ color: 'var(--text)', fontWeight: 600 }}>{Math.max(0, next.referrals_needed - count)}</b> {pluralFriends(Math.max(0, next.referrals_needed - count))} до награды
          </p>
        </div>
      )}

      {/* ── МИЛСТОУНЫ ── */}
      <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 2px 10px' }}>
        <Trophy size={16} color="var(--accent)" /> Награды за друзей
      </h3>
      {milestones.map(m => {
        const claimed = stats?.claimed_milestones?.includes(m.referrals_needed);
        const reached = count >= m.referrals_needed;
        const canClaim = reached && !claimed;
        const pct = Math.min(100, (count / m.referrals_needed) * 100);
        return (
          <div key={m.referrals_needed} className="card" style={{
            margin: '0 0 10px', padding: 14, display: 'flex', alignItems: 'center', gap: 12,
            border: canClaim ? '1px solid var(--accent-border)' : '1px solid var(--border)',
            opacity: claimed ? 0.65 : 1,
          }}>
            <div className="icon-tile" style={reached && !claimed ? { background: 'var(--accent-dim)' } : undefined}>
              {claimed
                ? <Check size={17} color="var(--success)" />
                : reached
                  ? <Gift size={17} color="var(--accent)" />
                  : <Lock size={17} color="var(--text-3)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.referrals_needed} {pluralFriends(m.referrals_needed)} → +{m.reward_amount} сом</div>
              {!reached && (
                <div className="progress" style={{ marginTop: 6, height: 4 }}><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
              )}
              {claimed && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Награда получена</div>}
            </div>
            {canClaim && (
              <button onClick={() => claim(m.referrals_needed)} disabled={claiming === m.referrals_needed}
                className="btn btn-primary"
                style={{ width: 'auto', padding: '9px 14px', fontSize: 13, flexShrink: 0 }}>
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
          background: 'var(--bg-2)', border: '1px solid var(--border-strong)',
          color: 'var(--text)', borderRadius: 12, padding: '14px 16px', zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-2)',
        }}>
          {toast.error ? <AlertCircle size={20} color="var(--danger)" /> : <Check size={20} color="var(--success)" />}
          <div style={{ fontWeight: 600, fontSize: 14 }}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}

function SecBtn({ onClick, icon, label, active }: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button onClick={onClick} className="tap" style={{
      flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
      border: active ? '1px solid var(--accent-border)' : '1px solid var(--border)',
      background: active ? 'var(--accent-dim)' : 'var(--card-strong)',
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
      <div className="numeric" style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
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
