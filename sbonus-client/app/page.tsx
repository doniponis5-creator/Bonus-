'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LogOut, QrCode, Loader2, RefreshCw, Home, History, User, Gift,
  PlusCircle, MinusCircle, Clock, Users, Ticket, RefreshCcw,
  Pencil, Share2, Copy, Check, ChevronLeft, ChevronRight, Disc3, Trophy,
  CheckCircle2, XCircle, Smartphone, Link2,
} from 'lucide-react';
import BalanceCard from '@/components/BalanceCard';
import DebtCard from '@/components/DebtCard';
import QRModal from '@/components/QRModal';
import TransactionList from '@/components/TransactionList';
import BonusWheel from '@/components/BonusWheel';
import Leaderboard from '@/components/Leaderboard';
import MyCoupons from '@/components/MyCoupons';
import ReviewBonus from '@/components/ReviewBonus';
import PWAInstall from '@/components/PWAInstall';
import { customerAPI, type CabinetMe } from '@/lib/api';
import { clearToken, getToken, isTokenValid } from '@/lib/auth';

type Tab = 'home' | 'history' | 'wheel' | 'promo' | 'rank' | 'profile';

const TX_META: Record<string, { label: string; color: string; sign: '+' | '-' }> = {
  earn:     { label: 'Начисление',    color: '#FFE600', sign: '+' },
  spend:    { label: 'Списание',      color: '#ff4d4d', sign: '-' },
  birthday: { label: 'День рождения', color: '#ffd700', sign: '+' },
  referral: { label: 'Реферал',       color: '#60a5fa', sign: '+' },
  promo:    { label: 'Промокод',      color: '#c084fc', sign: '+' },
  expire:   { label: 'Истёк',         color: '#8899aa', sign: '-' },
  refund:   { label: 'Возврат',       color: '#fb923c', sign: '+' },
  campaign: { label: 'Кампания',      color: '#22c55e', sign: '+' },
};

export default function Page() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: 40, color: '#8899aa' }}>Загрузка...</div>}>
      <DashboardPage />
    </Suspense>
  );
}

function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (['home', 'history', 'wheel', 'promo', 'rank', 'profile'] as Tab[]).includes(searchParams.get('tab') as Tab)
    ? (searchParams.get('tab') as Tab)
    : 'home';
  const [data, setData] = useState<CabinetMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);

  // Transaction history
  const [txns, setTxns] = useState<any[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [txType, setTxType] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const txLimit = 20;

  // Profile edit
  const [editName, setEditName] = useState('');
  const [editBirth, setEditBirth] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Promo
  const [promoCode, setPromoCode] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  // Referral
  const [referralInfo, setReferralInfo] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = () => {
    if (!isTokenValid(getToken())) { router.replace('/login'); return; }
    setRefreshing(true);
    customerAPI.me()
      .then((res) => { setData(res.data); setError(null); })
      .catch(() => setError('Не удалось загрузить данные.'))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [router]);

  // Load transactions when tab=history
  const loadTxns = (p = txPage, type = txType) => {
    setTxLoading(true);
    customerAPI.transactions(p, txLimit, type)
      .then(r => { setTxns(r.data.items); setTxTotal(r.data.total); })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  };

  useEffect(() => {
    if (tab === 'history') loadTxns(txPage, txType);
  }, [tab, txPage, txType]);

  // Load referral info
  useEffect(() => {
    if (tab === 'promo') {
      customerAPI.referralInfo().then(r => setReferralInfo(r.data)).catch(() => {});
    }
  }, [tab]);

  // Init profile edit form
  useEffect(() => {
    if (tab === 'profile' && data) {
      setEditName(data.full_name);
      setEditBirth(data.birth_date || '');
      setSaveMsg('');
    }
  }, [tab, data]);

  const handleLogout = () => { clearToken(); router.replace('/login'); };

  const handleSaveProfile = async () => {
    setSaving(true); setSaveMsg('');
    try {
      await customerAPI.updateProfile({ full_name: editName, birth_date: editBirth || null });
      setSaveMsg('Профиль сохранён!');
      fetchData();
    } catch (err: any) {
      setSaveMsg(err?.response?.data?.detail?.message || 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  const handlePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true); setPromoMsg('');
    try {
      const { data: r } = await customerAPI.applyPromo(promoCode.trim());
      setPromoMsg(`[ok]${r.message}`);
      setPromoCode('');
      fetchData();
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      setPromoMsg(`[err]${typeof d === 'string' ? d : d?.message || 'Ошибка'}`);
    } finally { setPromoLoading(false); }
  };

  const copyRef = () => {
    if (data?.referral_code) {
      navigator.clipboard.writeText(data.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (error) return (
    <div className="center">
      <p className="muted" style={{ marginBottom: 16 }}>{error}</p>
      <button className="btn btn-primary" style={{ maxWidth: 200 }} onClick={() => location.reload()}>Обновить</button>
    </div>
  );

  if (!data) return (
    <div className="center"><Loader2 className="spinner" size={32} color="var(--accent)" /></div>
  );

  const txTotalPages = Math.ceil(txTotal / txLimit);

  return (
    <div className="app">
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px 12px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src="/icon-32.png" alt="S" width={24} height={24} style={{ borderRadius: 4 }} />
          S Bonus
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={fetchData} disabled={refreshing} aria-label="Обновить"
            style={{ background: 'transparent', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 8, display: 'flex', opacity: refreshing ? 0.4 : 1, animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
            <RefreshCw size={18} />
          </button>
          <button onClick={handleLogout} aria-label="Выйти"
            style={{ background: 'transparent', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 8, display: 'flex' }}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Tab Content */}
      {tab === 'home' && (
        <>
          <BalanceCard
            fullName={data.full_name}
            balance={Number(data.balance)}
            tierName={data.tier_name}
            tierPercent={Number(data.tier_percent)}
            nextTierName={data.next_tier_name}
            nextTierRemaining={data.next_tier_remaining != null ? Number(data.next_tier_remaining) : null}
            progressPercent={Number(data.tier_progress_percent)}
          />
          <DebtCard amount={Number(data.debt_amount)} updatedAt={data.debt_updated_at} />
          <button className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={() => setQrOpen(true)}>
            <QrCode size={18} /> Показать QR кассиру
          </button>

          {/* Quick stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Получено</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{Number(data.total_earned).toLocaleString('ru-RU')}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>KGS</div>
            </div>
            <div className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Потрачено</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316' }}>{Number(data.total_spent).toLocaleString('ru-RU')}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>KGS</div>
            </div>
          </div>

          <TransactionList items={data.recent_transactions} />

          {/* Referral code */}
          <div className="card" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Ваш реферальный код</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2 }}>{data.referral_code}</div>
            </div>
            <button onClick={copyRef} style={{ background: 'none', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              {copied ? <><Check size={14} /> Скопировано</> : <><Copy size={14} /> Копировать</>}
            </button>
          </div>
        </>
      )}

      {tab === 'history' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} /> История операций
          </h2>

          {/* Type filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {[
              { value: '', label: 'Все' },
              { value: 'earn', label: 'Начисления' },
              { value: 'spend', label: 'Списания' },
              { value: 'promo', label: 'Промо' },
              { value: 'referral', label: 'Реферал' },
            ].map(f => (
              <button key={f.value} onClick={() => { setTxType(f.value); setTxPage(1); }}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                  background: txType === f.value ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                  color: txType === f.value ? '#000' : 'var(--text2)',
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {txLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 className="spinner" size={24} color="var(--accent)" /></div>
          ) : txns.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Операций не найдено</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {txns.map(t => {
                const meta = TX_META[t.type] || { label: t.type, color: '#8899aa', sign: '+' };
                return (
                  <div key={t.id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${meta.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                      {t.note && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.note}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {new Date(t.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: meta.color, whiteSpace: 'nowrap' }}>
                      {meta.sign}{Math.abs(t.amount).toLocaleString('ru-RU')} KGS
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {txTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16 }}>
              <button onClick={() => setTxPage(p => Math.max(1, p - 1))} disabled={txPage <= 1}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'var(--text2)', opacity: txPage <= 1 ? 0.3 : 1 }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{txPage} / {txTotalPages}</span>
              <button onClick={() => setTxPage(p => Math.min(txTotalPages, p + 1))} disabled={txPage >= txTotalPages}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'var(--text2)', opacity: txPage >= txTotalPages ? 0.3 : 1 }}>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'profile' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={18} /> Мой профиль
          </h2>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>ФИО</label>
                <input className="input" style={{ width: '100%' }} value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Дата рождения</label>
                <input className="input" type="date" style={{ width: '100%' }} value={editBirth} onChange={e => setEditBirth(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Телефон</label>
                <input className="input" style={{ width: '100%', opacity: 0.5 }} value={data.phone} disabled />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Телефон нельзя изменить</span>
              </div>
              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              {saveMsg && <p style={{ fontSize: 13, color: saveMsg.startsWith('Профиль') ? '#22c55e' : '#ff4d4d', textAlign: 'center' }}>{saveMsg}</p>}
            </div>
          </div>

          {/* Stats */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text2)' }}>Статистика</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Уровень', value: `${data.tier_name} (${Number(data.tier_percent)}%)`, color: 'var(--accent)' },
                { label: 'Баланс', value: `${Number(data.balance).toLocaleString('ru-RU')} KGS`, color: 'var(--accent)' },
                { label: 'Получено всего', value: `${Number(data.total_earned).toLocaleString('ru-RU')} KGS`, color: '#22c55e' },
                { label: 'Потрачено', value: `${Number(data.total_spent).toLocaleString('ru-RU')} KGS`, color: '#f97316' },
                { label: 'QR код', value: data.qr_code, color: 'var(--text2)' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text3)' }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'promo' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gift size={18} /> Бонусы и акции
          </h2>

          {/* Promo code */}
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ticket size={14} /> Ввести промокод
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input className="input" style={{ flex: 1, minWidth: 0, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, fontSize: 16 }}
                value={promoCode} onChange={e => setPromoCode(e.target.value)}
                placeholder="PROMO2024" maxLength={30}
                onKeyDown={e => e.key === 'Enter' && handlePromo()} />
              <button className="btn btn-primary" style={{ width: 'auto', flexShrink: 0, padding: '14px 20px' }} onClick={handlePromo} disabled={promoLoading || !promoCode.trim()}>
                {promoLoading ? '...' : 'Применить'}
              </button>
            </div>
            {promoMsg && (
              <p style={{ fontSize: 13, marginTop: 8, color: promoMsg.startsWith('[ok]') ? '#22c55e' : '#ff4d4d', display: 'flex', alignItems: 'center', gap: 4 }}>
                {promoMsg.startsWith('[ok]') ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {promoMsg.replace(/^\[(ok|err)\]/, '')}
              </p>
            )}
          </div>

          {/* Referral - My code */}
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Share2 size={14} /> Пригласи друга — получи бонус!
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
              Поделитесь вашим кодом с другом. Вы получите <strong style={{ color: 'var(--accent)' }}>100 KGS</strong>, а друг — <strong style={{ color: 'var(--accent)' }}>50 KGS</strong>!
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,230,0,0.06)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Ваш код:</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', letterSpacing: 3 }}>{data.referral_code}</div>
              </div>
              <button onClick={copyRef}
                style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                {copied ? <><Check size={14} /> Скопировано</> : <><Copy size={14} /> Копировать</>}
              </button>
            </div>

            {/* Share buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => {
                const text = `🎁 Смарт Центр: Получи 50 KGS бонус! Мой код: ${data.referral_code}\n📱 https://cabinet.smartcentr.store`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
              }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Smartphone size={14} /> WhatsApp
              </button>
              <button onClick={() => {
                const text = `🎁 Смарт Центр: Получи 50 KGS бонус! Мой код: ${data.referral_code} 📱 https://cabinet.smartcentr.store`;
                if (navigator.share) {
                  navigator.share({ title: 'Смарт Центр — Бонус', text });
                } else {
                  navigator.clipboard.writeText(text);
                }
              }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.08)', color: '#e2eaf6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Link2 size={14} /> Поделиться
              </button>
            </div>

            {referralInfo && (
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Приглашено друзей: <strong style={{ color: 'var(--accent)' }}>{referralInfo.invited_count}</strong></span>
                <span>Заработано: <strong style={{ color: '#22c55e' }}>{(referralInfo.invited_count || 0) * 100} KGS</strong></span>
              </div>
            )}
          </div>

          {/* Referral code input removed — referral applies only during registration */}

          {/* Coupons */}
          <MyCoupons onBalanceChange={fetchData} />

          {/* Review bonus */}
          <ReviewBonus onBalanceChange={fetchData} />
        </div>
      )}

      {tab === 'wheel' && <BonusWheel />}

      {tab === 'rank' && <Leaderboard />}

      {/* QR Modal */}
      <QRModal open={qrOpen} qrCode={data.qr_code} fullName={data.full_name} onClose={() => setQrOpen(false)} />

      {/* Bottom Tab Bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(10,15,26,0.95)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-around', padding: '8px 0 env(safe-area-inset-bottom, 8px)',
        zIndex: 100,
      }}>
        {([
          { id: 'home', icon: Home, label: 'Главная' },
          { id: 'wheel', icon: Disc3, label: 'Удача' },
          { id: 'rank', icon: Trophy, label: 'Рейтинг' },
          { id: 'promo', icon: Gift, label: 'Бонусы' },
          { id: 'profile', icon: User, label: 'Профиль' },
        ] as const).map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 12px',
                color: active ? 'var(--accent)' : 'var(--text3)',
                transition: 'color 0.2s',
              }}>
              <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* PWA Install Banner */}
      <PWAInstall />

      {/* Bottom padding for tab bar */}
      <div style={{ height: 80 }} />
    </div>
  );
}
