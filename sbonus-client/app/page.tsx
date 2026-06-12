'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LogOut, Loader2, RefreshCw, Home, History, User, Gift,
  Clock, Ticket, ChevronLeft, ChevronRight, ArrowLeft, Disc3, Trophy,
  CheckCircle2, XCircle, Crown, Receipt, CreditCard, Flame, Sparkles,
} from 'lucide-react';
import BalanceCard from '@/components/BalanceCard';
import DebtCard from '@/components/DebtCard';
import QRModal from '@/components/QRModal';
import TransactionList, { TX_META, txAmountColor } from '@/components/TransactionList';
import BonusWheel from '@/components/BonusWheel';
import Leaderboard from '@/components/Leaderboard';
import MyCoupons from '@/components/MyCoupons';
import ReviewBonus from '@/components/ReviewBonus';
import PWAInstall from '@/components/PWAInstall';
import Gamification from '@/components/Gamification';
import Referral from '@/components/Referral';
import { customerAPI, customerAuthAPI, wheelAPI, type CabinetMe } from '@/lib/api';
import { clearToken, getToken, isTokenValid, setToken } from '@/lib/auth';
import { isNativeShell, syncNativeTab, onNativeTabChange } from '@/lib/nativeBridge';

type Tab = 'home' | 'history' | 'club' | 'promo' | 'profile';
type ClubSeg = 'goals' | 'wheel' | 'rank';

/** Маппинг старых значений вкладок (URL ?tab=, нативный мост) на новую структуру. */
function normalizeTab(raw: string | null): { tab: Tab; seg: ClubSeg | null } {
  switch (raw) {
    case 'home': case 'history': case 'promo': case 'profile':
      return { tab: raw, seg: null };
    case 'club':
      return { tab: 'club', seg: null };
    case 'game':  return { tab: 'club', seg: 'goals' };
    case 'wheel': return { tab: 'club', seg: 'wheel' };
    case 'rank':  return { tab: 'club', seg: 'rank' };
    default:
      return { tab: 'home', seg: null };
  }
}

/** Обратный маппинг для нативной оболочки (она знает старые id вкладок). */
function legacyTab(tab: Tab, seg: ClubSeg): string {
  if (tab !== 'club') return tab;
  return seg === 'goals' ? 'game' : seg === 'wheel' ? 'wheel' : 'rank';
}

function pluralSpins(n: number): string {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'попытка';
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'попытки';
  return 'попыток';
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: 40, color: 'var(--text-2)' }}>Загрузка...</div>}>
      <DashboardPage />
    </Suspense>
  );
}

function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = normalizeTab(searchParams.get('tab'));
  const [data, setData] = useState<CabinetMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [clubSeg, setClubSeg] = useState<ClubSeg>(initial.seg || 'goals');

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  // Promo
  const [promoCode, setPromoCode] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  // Spin banner («у вас есть вращение» при входе)
  const [spinPrompt, setSpinPrompt] = useState(0);
  const spinCheckedRef = useRef(false);

  // PRO UI: tier sheet, tx detail sheet, coupon badge
  const [tierSheet, setTierSheet] = useState(false);
  const [tiersList, setTiersList] = useState<{ name: string; min_total: number; bonus_percent: number; max_spend_pct: number }[]>([]);
  const [txDetail, setTxDetail] = useState<any | null>(null);
  const [hasNewCoupons, setHasNewCoupons] = useState(false);
  const couponCheckedRef = useRef(false);

  // «Подобрано для вас» — персональные рекомендации (загружаем при первом открытии Бонусов)
  const [recs, setRecs] = useState<{ name: string; price: number; category?: string }[]>([]);
  const recsLoadedRef = useRef(false);
  useEffect(() => {
    if (tab !== 'promo' || recsLoadedRef.current) return;
    recsLoadedRef.current = true;
    customerAPI.recommendations()
      .then(r => setRecs(r.data?.items || []))
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (!data || couponCheckedRef.current) return;
    couponCheckedRef.current = true;
    customerAPI.coupons()
      .then(r => {
        const list = r.data?.coupons || [];
        setHasNewCoupons(list.some((c: any) => !c.is_used));
      })
      .catch(() => {});
  }, [data]);

  const openTierSheet = () => {
    setTierSheet(true);
    if (tiersList.length === 0) {
      customerAPI.tiers().then(r => setTiersList(r.data?.tiers || [])).catch(() => {});
    }
  };

  useEffect(() => {
    if (!data || spinCheckedRef.current) return;
    spinCheckedRef.current = true;
    try {
      if (sessionStorage.getItem('sbonus_spin_prompt_shown')) return;
    } catch { /* ignore */ }
    wheelAPI.status()
      .then(r => {
        const n = r.data?.spins_available || 0;
        if (n > 0) {
          setSpinPrompt(n);
          try { sessionStorage.setItem('sbonus_spin_prompt_shown', '1'); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [data]);

  const goToWheel = () => { setSpinPrompt(0); setTab('club'); setClubSeg('wheel'); };

  // ── Native iOS shell integration ──
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeShell());
    const off = onNativeTabChange((t) => {
      const m = normalizeTab(t);
      setTab(m.tab);
      if (m.seg) setClubSeg(m.seg);
    });
    return off;
  }, []);
  useEffect(() => { syncNativeTab(legacyTab(tab, clubSeg)); }, [tab, clubSeg]);

  const fetchData = () => {
    if (!isTokenValid(getToken())) { router.replace('/login'); return; }
    setRefreshing(true);
    customerAPI.me()
      .then((res) => { setData(res.data); setError(null); })
      .catch(() => setError('Не удалось загрузить данные.'))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    const magicToken = searchParams.get('token');
    if (magicToken) {
      // Magic-link: verify token, auto-login, then load data
      setRefreshing(true);
      customerAuthAPI.verify(magicToken)
        .then((res) => {
          setToken(res.data.access_token);
          window.history.replaceState({}, '', '/');
          fetchData();
        })
        .catch(() => {
          if (isTokenValid(getToken())) {
            window.history.replaceState({}, '', '/');
            fetchData();
          } else {
            router.replace('/login');
          }
        })
        .finally(() => setRefreshing(false));
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [router, searchParams]);

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
      setSaveMsg('Профиль сохранён');
      fetchData();
    } catch (err: any) {
      setSaveMsg(err?.response?.data?.detail?.message || 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true); setDeleteErr('');
    try {
      await customerAPI.deleteAccount();
      clearToken();
      router.replace('/login?deleted=1');
    } catch (err: any) {
      setDeleteErr(err?.response?.data?.detail?.message || 'Не удалось удалить аккаунт. Попробуйте позже.');
      setDeleting(false);
    }
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

  if (error) return (
    <div className="center">
      <p className="muted" style={{ marginBottom: 16 }}>{error}</p>
      <button className="btn btn-primary" style={{ maxWidth: 200 }} onClick={() => location.reload()}>Обновить</button>
    </div>
  );

  if (!data) return (
    <div className="app">
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px 12px' }}>
        <div className="skeleton" style={{ width: 90, height: 24 }} />
        <div className="skeleton" style={{ width: 40, height: 24, borderRadius: 999 }} />
      </div>
      <div className="skeleton" style={{ height: 240, marginBottom: 12, borderRadius: 16 }} />
      <div className="skeleton" style={{ height: 56, marginBottom: 12, borderRadius: 16 }} />
      <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />
    </div>
  );

  const txTotalPages = Math.ceil(txTotal / txLimit);

  return (
    <div className="app">
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/icon-32.png" alt="S" width={24} height={24} style={{ borderRadius: 6 }} />
          S Bonus
        </div>
        <button onClick={fetchData} disabled={refreshing} aria-label="Обновить"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: refreshing ? 0.4 : 1 }}>
          <RefreshCw size={18} className={refreshing ? 'spinner' : undefined} />
        </button>
      </header>

      {/* ── Главная ── */}
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
            onTierClick={openTierSheet}
            onQrClick={() => setQrOpen(true)}
          />

          {/* Доступны вращения колеса — спокойный баннер вместо модалки */}
          {spinPrompt > 0 && (
            <button
              onClick={goToWheel}
              className="card tap fade-up full"
              style={{
                animationDelay: '40ms', display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 15px', cursor: 'pointer', textAlign: 'left',
                borderColor: 'var(--accent-border)', fontFamily: 'inherit',
              }}
            >
              <div className="icon-tile" style={{ background: 'var(--accent-dim)' }}>
                <Disc3 size={17} color="var(--accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  Доступно колесо удачи
                </div>
                <div className="caption" style={{ marginTop: 1 }}>
                  {spinPrompt} {pluralSpins(spinPrompt)} — крутите и выигрывайте
                </div>
              </div>
              <ChevronRight size={16} color="var(--text-3)" />
            </button>
          )}

          {/* Сгорающие бонусы */}
          {Number(data.expiring_amount || 0) > 0 && data.expiring_date && (
            <div className="card fade-up" style={{
              animationDelay: '60ms', display: 'flex', alignItems: 'center', gap: 12,
              padding: '13px 15px', borderColor: 'rgba(251,191,36,0.25)',
            }}>
              <div className="icon-tile" style={{ background: 'rgba(251,191,36,0.12)' }}>
                <Flame size={17} color="var(--warn)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }} className="numeric">
                  {Number(data.expiring_amount).toLocaleString('ru-RU')} сом сгорит {new Date(data.expiring_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                </div>
                <div className="caption" style={{ marginTop: 1 }}>Успейте использовать бонусы</div>
              </div>
            </div>
          )}

          <div className="fade-up" style={{ animationDelay: '80ms' }}>
            <DebtCard amount={Number(data.debt_amount)} updatedAt={data.debt_updated_at} />
          </div>

          <div className="fade-up" style={{ animationDelay: '120ms' }}>
            <TransactionList
              items={data.recent_transactions}
              onShowAll={() => setTab('history')}
              onSelect={(t) => setTxDetail(t)}
            />
          </div>
        </>
      )}

      {/* ── История ── */}
      {tab === 'history' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button onClick={() => setTab('home')} aria-label="Назад" className="tap"
              style={{ background: 'var(--card-strong)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={17} />
            </button>
            <h1 className="h1" style={{ fontSize: 20 }}>История операций</h1>
          </div>

          {/* Type filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }} className="hide-scroll">
            {[
              { value: '', label: 'Все' },
              { value: 'earn', label: 'Начисления' },
              { value: 'spend', label: 'Списания' },
              { value: 'promo', label: 'Промо' },
              { value: 'referral', label: 'Реферал' },
            ].map(f => (
              <button key={f.value} onClick={() => { setTxType(f.value); setTxPage(1); }}
                className={`chip ${txType === f.value ? 'active' : ''}`}>
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
                const meta = TX_META[t.type] || { label: t.type, Icon: Clock, sign: '+' as const };
                const Icon = meta.Icon;
                return (
                  <div key={t.id} className="card tap" onClick={() => setTxDetail(t)} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 0 }}>
                    <div className="icon-tile">
                      <Icon size={17} color="var(--text-2)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{meta.label}</div>
                      {t.note && <div className="caption" style={{ marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.note}</div>}
                      <div className="caption" style={{ marginTop: 2 }}>
                        {new Date(t.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="numeric" style={{ fontSize: 14, fontWeight: 600, color: txAmountColor(meta.sign), whiteSpace: 'nowrap' }}>
                      {meta.sign}{Math.abs(t.amount).toLocaleString('ru-RU')} сом
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {txTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16 }}>
              <button onClick={() => setTxPage(p => Math.max(1, p - 1))} disabled={txPage <= 1} aria-label="Назад"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', opacity: txPage <= 1 ? 0.35 : 1 }}>
                <ChevronLeft size={18} />
              </button>
              <span className="numeric" style={{ fontSize: 13, color: 'var(--text-2)' }}>{txPage} / {txTotalPages}</span>
              <button onClick={() => setTxPage(p => Math.min(txTotalPages, p + 1))} disabled={txPage >= txTotalPages} aria-label="Вперёд"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', opacity: txPage >= txTotalPages ? 0.35 : 1 }}>
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Клуб: Цели · Колесо · Рейтинг ── */}
      {tab === 'club' && (
        <div>
          <h1 className="h1" style={{ fontSize: 20, marginBottom: 14 }}>Клуб</h1>
          <div className="seg">
            {([
              { id: 'goals', label: 'Цели' },
              { id: 'wheel', label: 'Колесо' },
              { id: 'rank', label: 'Рейтинг' },
            ] as { id: ClubSeg; label: string }[]).map(s => (
              <button key={s.id} onClick={() => setClubSeg(s.id)}
                className={`seg-item ${clubSeg === s.id ? 'active' : ''}`}>
                {s.label}
              </button>
            ))}
          </div>
          {clubSeg === 'goals' && <Gamification />}
          {clubSeg === 'wheel' && <BonusWheel />}
          {clubSeg === 'rank' && <Leaderboard />}
        </div>
      )}

      {/* ── Бонусы ── */}
      {tab === 'promo' && (
        <div>
          <h1 className="h1" style={{ fontSize: 20, marginBottom: 16 }}>Бонусы</h1>

          {/* Promo code */}
          <div className="card">
            <h3 className="h3" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ticket size={15} color="var(--text-2)" /> Промокод
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input className="input" style={{ flex: 1, minWidth: 0, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600, fontSize: 16 }}
                value={promoCode} onChange={e => setPromoCode(e.target.value)}
                placeholder="PROMO2024" maxLength={30}
                onKeyDown={e => e.key === 'Enter' && handlePromo()} />
              <button className="btn btn-primary" style={{ width: 'auto', flexShrink: 0, padding: '14px 20px' }} onClick={handlePromo} disabled={promoLoading || !promoCode.trim()}>
                {promoLoading ? '...' : 'Применить'}
              </button>
            </div>
            {promoMsg && (
              <p style={{ fontSize: 13, marginTop: 10, color: promoMsg.startsWith('[ok]') ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {promoMsg.startsWith('[ok]') ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {promoMsg.replace(/^\[(ok|err)\]/, '')}
              </p>
            )}
          </div>

          {/* Coupons */}
          <MyCoupons onBalanceChange={fetchData} />

          {/* Подобрано для вас */}
          {recs.length > 0 && (
            <div className="card">
              <h3 className="h3" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={15} color="var(--accent)" /> Подобрано для вас
              </h3>
              <p className="caption" style={{ marginBottom: 10 }}>На основе ваших покупок в Смарт Центр</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recs.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < recs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div className="icon-tile" style={{ background: 'var(--accent-dim)' }}>
                      <Sparkles size={15} color="var(--accent)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      {p.category && <div className="caption" style={{ marginTop: 1 }}>{p.category}</div>}
                    </div>
                    {p.price > 0 && (
                      <div className="numeric" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {Math.round(p.price).toLocaleString('ru-RU')} <span style={{ fontSize: 12, color: 'var(--text-2)' }}>сом</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="caption" style={{ marginTop: 10 }}>Покажите кассиру — поможем найти в магазине</p>
            </div>
          )}

          {/* Referral — приглашай друзей */}
          <Referral referralCode={data.referral_code} onBalanceChange={fetchData} />

          {/* Review bonus */}
          <ReviewBonus onBalanceChange={fetchData} />
        </div>
      )}

      {/* ── Профиль ── */}
      {tab === 'profile' && (
        <div>
          <h1 className="h1" style={{ fontSize: 20, marginBottom: 16 }}>Профиль</h1>
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="caption" style={{ display: 'block', marginBottom: 6 }}>ФИО</label>
                <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="caption" style={{ display: 'block', marginBottom: 6 }}>Телефон</label>
                <input className="input" style={{ opacity: 0.5 }} value={data.phone} disabled />
                <span className="caption" style={{ marginTop: 4, display: 'inline-block' }}>Телефон нельзя изменить</span>
              </div>
              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
                {saving ? (<><Loader2 size={16} className="spinner" /> Сохранение...</>) : 'Сохранить'}
              </button>
              {saveMsg && <p style={{ fontSize: 13, color: saveMsg.startsWith('Профиль') ? 'var(--success)' : 'var(--danger)', textAlign: 'center' }}>{saveMsg}</p>}
            </div>
          </div>

          {/* Статистика */}
          <div className="card">
            <h3 className="h3" style={{ marginBottom: 8, color: 'var(--text-2)' }}>Статистика</h3>
            <div>
              {[
                { label: 'Уровень', value: `${data.tier_name} · ${Number(data.tier_percent)}%` },
                { label: 'Баланс', value: `${Number(data.balance).toLocaleString('ru-RU')} сом` },
                { label: 'Получено всего', value: `${Number(data.total_earned).toLocaleString('ru-RU')} сом` },
                { label: 'Потрачено', value: `${Number(data.total_spent).toLocaleString('ru-RU')} сом` },
                { label: 'Реферальный код', value: data.referral_code },
                { label: 'QR код', value: data.qr_code },
              ].map(item => (
                <div key={item.label} className="list-row" style={{ cursor: 'default' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{item.label}</span>
                  <span className="numeric" style={{ fontSize: 13, fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Рассрочка */}
          <div className="card" style={{ padding: '4px 16px' }}>
            <a href="/debts" className="list-row" style={{ textDecoration: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
                <CreditCard size={15} color="var(--text-2)" /> Мои рассрочки
              </span>
              <ChevronRight size={16} color="var(--text-3)" />
            </a>
          </div>

          {/* Конфиденциальность и аккаунт */}
          <div className="card" style={{ padding: '4px 16px' }}>
            <a href="/privacy" className="list-row" style={{ textDecoration: 'none', color: 'var(--text-2)' }}>
              <span>Политика конфиденциальности</span>
              <ChevronRight size={16} color="var(--text-3)" />
            </a>
            <button onClick={handleLogout} className="list-row" style={{ color: 'var(--text-2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LogOut size={15} /> Выйти из аккаунта</span>
              <ChevronRight size={16} color="var(--text-3)" />
            </button>
            <button onClick={() => { setDeleteErr(''); setShowDeleteModal(true); }} className="list-row" style={{ color: 'var(--danger)' }}>
              <span>Удалить аккаунт</span>
              <ChevronRight size={16} color="var(--danger)" />
            </button>
          </div>
        </div>
      )}

      {/* Модалка удаления аккаунта */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon" style={{ background: 'rgba(248,113,113,0.12)' }}>
              <XCircle size={32} color="var(--danger)" />
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>Удалить аккаунт?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 20 }}>
              Ваши персональные данные (имя, телефон, дата рождения) будут удалены без возможности восстановления.
              Бонусный баланс будет аннулирован. Это действие необратимо.
            </p>
            {deleteErr && (
              <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>{deleteErr}</p>
            )}
            <button onClick={handleDeleteAccount} disabled={deleting} className="btn btn-danger" style={{ marginBottom: 8 }}>
              {deleting ? (<><Loader2 size={16} className="spinner" /> Удаление...</>) : 'Да, удалить навсегда'}
            </button>
            <button onClick={() => setShowDeleteModal(false)} disabled={deleting} className="btn btn-ghost">
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* QR Modal */}
      <QRModal open={qrOpen} qrCode={data.qr_code} fullName={data.full_name} onClose={() => setQrOpen(false)} />

      {/* Bottom Tab Bar — скрыт в нативной оболочке */}
      {!native && (
        <nav className="tabbar">
          {([
            { id: 'home', icon: Home, label: 'Главная' },
            { id: 'club', icon: Trophy, label: 'Клуб' },
            { id: 'promo', icon: Gift, label: 'Бонусы' },
            { id: 'profile', icon: User, label: 'Профиль' },
          ] as { id: Tab; icon: typeof Home; label: string }[]).map(t => {
            const Icon = t.icon;
            const active = tab === t.id || (t.id === 'home' && tab === 'history');
            return (
              <button key={t.id} onClick={() => setTab(t.id)} aria-label={t.label}
                className={`tabbar-item ${active ? 'active' : ''}`}>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Icon size={21} strokeWidth={2} />
                  {t.id === 'promo' && hasNewCoupons && (
                    <span style={{ position: 'absolute', top: -2, right: -4, width: 6, height: 6, background: 'var(--danger)', borderRadius: '50%' }} />
                  )}
                </span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Tier Benefits Sheet ── */}
      {tierSheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setTierSheet(false)} />
          <div className="sheet">
            <div className="sheet-handle" />
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Crown size={18} color="var(--accent)" /> Уровни лояльности
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
              Чем больше покупок — тем выше уровень и процент бонуса
            </p>
            {tiersList.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <div className="skeleton" style={{ height: 64 }} />
                <div className="skeleton" style={{ height: 64 }} />
                <div className="skeleton" style={{ height: 64 }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {tiersList.map((t) => {
                  const isCurrent = t.name === data.tier_name;
                  const tierColor = ({ Bronze: 'var(--bronze)', Silver: 'var(--silver)', Gold: 'var(--gold)', Platinum: 'var(--platinum)' } as Record<string, string>)[t.name] || 'var(--text-2)';
                  return (
                    <div key={t.name} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      borderRadius: 12,
                      background: isCurrent ? 'var(--accent-dim)' : 'rgba(255,255,255,0.03)',
                      border: isCurrent ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                    }}>
                      <div className="icon-tile">
                        <Crown size={17} color={tierColor} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: tierColor }}>
                          {t.name} {isCurrent && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>— вы здесь</span>}
                        </div>
                        <div className="caption numeric">
                          от {t.min_total.toLocaleString('ru-RU')} сом покупок
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="numeric" style={{ fontSize: 16, fontWeight: 700, color: tierColor }}>{t.bonus_percent}%</div>
                        <div className="caption" style={{ fontSize: 10 }}>бонус</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {data.next_tier_name && data.next_tier_remaining != null && (
              <div style={{
                padding: '11px 14px', borderRadius: 12, marginBottom: 12,
                background: 'var(--accent-dim)', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5,
              }}>
                Ещё <strong style={{ color: 'var(--accent)', fontWeight: 600 }} className="numeric">{Number(data.next_tier_remaining).toLocaleString('ru-RU')} сом</strong> покупок — и вы <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{data.next_tier_name}</strong>
              </div>
            )}
            <button className="btn btn-secondary" onClick={() => setTierSheet(false)}>Понятно</button>
          </div>
        </>
      )}

      {/* ── Transaction Detail Sheet ── */}
      {txDetail && (
        <>
          <div className="sheet-backdrop" onClick={() => setTxDetail(null)} />
          <div className="sheet">
            <div className="sheet-handle" />
            {(() => {
              const meta = TX_META[txDetail.type] || { label: txDetail.type, Icon: Clock, sign: '+' as const };
              return (
                <>
                  <div style={{ textAlign: 'center', marginBottom: 18 }}>
                    <div className="icon-tile" style={{ width: 52, height: 52, margin: '0 auto 10px' }}>
                      <Receipt size={24} color="var(--text-2)" />
                    </div>
                    <div className="numeric" style={{ fontSize: 30, fontWeight: 700, color: txAmountColor(meta.sign) }}>
                      {meta.sign}{Math.abs(Number(txDetail.amount)).toLocaleString('ru-RU')} сом
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{meta.label}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '4px 14px', marginBottom: 14 }}>
                    {txDetail.purchase_amount != null && Number(txDetail.purchase_amount) > 0 && (
                      <div className="list-row" style={{ cursor: 'default', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-3)' }}>Сумма покупки</span>
                        <span className="numeric" style={{ fontWeight: 600 }}>{Number(txDetail.purchase_amount).toLocaleString('ru-RU')} сом</span>
                      </div>
                    )}
                    <div className="list-row" style={{ cursor: 'default', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-3)' }}>Дата и время</span>
                      <span style={{ fontWeight: 600 }}>
                        {new Date(txDetail.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {txDetail.note && (
                      <div style={{ padding: '11px 0', fontSize: 13 }}>
                        <div style={{ color: 'var(--text-3)', marginBottom: 4 }}>Комментарий</div>
                        <div style={{ lineHeight: 1.5 }}>{txDetail.note}</div>
                      </div>
                    )}
                  </div>
                  <button className="btn btn-secondary" onClick={() => setTxDetail(null)}>Закрыть</button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* PWA Install Banner — не показываем в нативном приложении */}
      {!native && <PWAInstall />}

      {/* Bottom padding for tab bar */}
      <div style={{ height: 80 }} />
    </div>
  );
}
