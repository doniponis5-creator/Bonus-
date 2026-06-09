'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LogOut, QrCode, Loader2, RefreshCw, Home, History, User, Gift,
  PlusCircle, MinusCircle, Clock, Users, Ticket, RefreshCcw,
  Pencil, Share2, Copy, Check, ChevronLeft, ChevronRight, Disc3, Trophy,
  CheckCircle2, XCircle, Smartphone, Link2, Target, Lightbulb,
  Flame, Crown, Receipt,
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
import Gamification from '@/components/Gamification';
import Referral from '@/components/Referral';
import { customerAPI, customerAuthAPI, wheelAPI, type CabinetMe } from '@/lib/api';
import { clearToken, getToken, isTokenValid, setToken } from '@/lib/auth';
import { isNativeShell, syncNativeTab, onNativeTabChange } from '@/lib/nativeBridge';

type Tab = 'home' | 'history' | 'wheel' | 'promo' | 'rank' | 'profile' | 'game';

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

function pluralSpins(n: number): string {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'попытка';
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'попытки';
  return 'попыток';
}

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
  const initialTab = (['home', 'history', 'wheel', 'promo', 'rank', 'profile', 'game'] as Tab[]).includes(searchParams.get('tab') as Tab)
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  // Promo
  const [promoCode, setPromoCode] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  // Referral
  const [copied, setCopied] = useState(false);

  // Spin prompt (показать «у вас есть вращение» при входе)
  const [spinPrompt, setSpinPrompt] = useState(0);
  const spinCheckedRef = useRef(false);

  // PRO UI: tier sheet, tx detail sheet, coupon badge
  const [tierSheet, setTierSheet] = useState(false);
  const [tiersList, setTiersList] = useState<{ name: string; min_total: number; bonus_percent: number; max_spend_pct: number }[]>([]);
  const [txDetail, setTxDetail] = useState<any | null>(null);
  const [hasNewCoupons, setHasNewCoupons] = useState(false);
  const couponCheckedRef = useRef(false);

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

  const goToWheel = () => { setSpinPrompt(0); setTab('wheel'); };

  // ── Native iOS shell (Liquid Glass) integration ──
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeShell());
    // Слушаем смену вкладки из нативного tab bar
    const off = onNativeTabChange((t) => setTab(t as Tab));
    return off;
  }, []);
  // Синхронизируем текущую вкладку с нативной оболочкой
  useEffect(() => { syncNativeTab(tab); }, [tab]);

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
          // Token invalid/expired — try existing JWT
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
      setSaveMsg('Профиль сохранён!');
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

  const copyRef = () => {
    if (data?.referral_code) {
      const link = `${window.location.origin}/register?ref=${data.referral_code}`;
      navigator.clipboard.writeText(link);
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
    <div className="app">
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px 12px' }}>
        <div className="skeleton" style={{ width: 90, height: 24 }} />
        <div className="skeleton" style={{ width: 40, height: 24, borderRadius: 999 }} />
      </div>
      <div className="skeleton" style={{ height: 180, marginBottom: 12, borderRadius: 16 }} />
      <div className="skeleton" style={{ height: 48, marginBottom: 12, borderRadius: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div className="skeleton" style={{ height: 76, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 76, borderRadius: 12 }} />
      </div>
      <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />
    </div>
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
            style={{ background: 'transparent', border: 'none', color: 'var(--text2)', cursor: 'pointer', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: refreshing ? 0.4 : 1, animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
            <RefreshCw size={18} />
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
            onTierClick={openTierSheet}
          />

          {/* Сгорающие бонусы */}
          {Number(data.expiring_amount || 0) > 0 && data.expiring_date && (
            <div className="card fade-up" style={{
              animationDelay: '60ms',
              borderColor: 'rgba(251,191,36,0.3)',
              background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.01)), var(--card)',
              display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                background: 'rgba(251,191,36,0.13)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Flame size={19} color="var(--warn)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn)' }} className="numeric">
                  {Number(data.expiring_amount).toLocaleString('ru-RU')} сом сгорит {new Date(data.expiring_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
                  Успейте использовать бонусы в Смарт Центр
                </div>
              </div>
            </div>
          )}

          <DebtCard amount={Number(data.debt_amount)} updatedAt={data.debt_updated_at} />
          <button className="btn btn-secondary fade-up" style={{ marginBottom: 12, animationDelay: '100ms' }} onClick={() => setQrOpen(true)}>
            <QrCode size={18} /> Показать QR кассиру
          </button>

          {/* Quick stats */}
          <div className="fade-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, animationDelay: '140ms' }}>
            <div className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Получено</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{Number(data.total_earned).toLocaleString('ru-RU')}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>сом</div>
            </div>
            <div className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Потрачено</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316' }}>{Number(data.total_spent).toLocaleString('ru-RU')}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>сом</div>
            </div>
          </div>

          <div className="fade-up" style={{ animationDelay: '180ms' }}>
            <TransactionList
              items={data.recent_transactions}
              onShowAll={() => setTab('history')}
              onSelect={(t) => setTxDetail(t)}
            />
          </div>

          {/* Referral code */}
          <div className="card fade-up" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', animationDelay: '220ms' }}>
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
                  <div key={t.id} className="card tap" onClick={() => setTxDetail(t)} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
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
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Телефон</label>
                <input className="input" style={{ width: '100%', opacity: 0.5 }} value={data.phone} disabled />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Телефон нельзя изменить</span>
              </div>
              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
                {saving ? (<><Loader2 size={16} className="spinner" /> Сохранение...</>) : 'Сохранить'}
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
                { label: 'Баланс', value: `${Number(data.balance).toLocaleString('ru-RU')} сом`, color: 'var(--accent)' },
                { label: 'Получено всего', value: `${Number(data.total_earned).toLocaleString('ru-RU')} сом`, color: '#22c55e' },
                { label: 'Потрачено', value: `${Number(data.total_spent).toLocaleString('ru-RU')} сом`, color: '#f97316' },
                { label: 'QR код', value: data.qr_code, color: 'var(--text2)' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text3)' }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Конфиденциальность и аккаунт */}
          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text2)' }}>Конфиденциальность и аккаунт</h3>
            <a
              href="/privacy"
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                color: 'var(--text2)', fontSize: 14, textDecoration: 'none',
              }}
            >
              <span>Политика конфиденциальности</span>
              <ChevronRight size={16} color="var(--text3)" />
            </a>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text2)', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LogOut size={15} /> Выйти из аккаунта</span>
              <ChevronRight size={16} color="var(--text3)" />
            </button>
            <button
              onClick={() => { setDeleteErr(''); setShowDeleteModal(true); }}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
                color: '#ff4d4d', fontSize: 14, fontFamily: 'inherit',
              }}
            >
              <span>Удалить аккаунт</span>
              <ChevronRight size={16} color="#ff4d4d" />
            </button>
          </div>
        </div>
      )}

      {/* Модалка удаления аккаунта */}
      {showDeleteModal && (
        <div
          onClick={() => !deleting && setShowDeleteModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(7,8,13,0.88)',
            backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="float-up"
            style={{
              background: 'var(--bg-2)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: 24,
              padding: '28px 24px 24px', textAlign: 'center', maxWidth: 360, width: '100%',
            }}
          >
            <div style={{
              width: 72, height: 72, borderRadius: 22, margin: '0 auto 16px',
              background: 'rgba(255,77,77,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <XCircle size={38} color="#ff4d4d" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>Удалить аккаунт?</h3>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 20 }}>
              Ваши персональные данные (имя, телефон, дата рождения) будут удалены без возможности восстановления.
              Бонусный баланс будет аннулирован. Это действие необратимо.
            </p>
            {deleteErr && (
              <p style={{ fontSize: 13, color: '#ff4d4d', marginBottom: 14 }}>{deleteErr}</p>
            )}
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="btn"
              style={{ background: '#ff4d4d', color: '#fff', marginBottom: 8, width: '100%' }}
            >
              {deleting ? (<><Loader2 size={16} className="spinner" /> Удаление...</>) : 'Да, удалить навсегда'}
            </button>
            <button onClick={() => setShowDeleteModal(false)} disabled={deleting} className="btn btn-ghost">
              Отмена
            </button>
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

          {/* Referral — приглашай друзей */}
          <Referral referralCode={data.referral_code} onBalanceChange={fetchData} />

          {/* Coupons */}
          <MyCoupons onBalanceChange={fetchData} />

          {/* Review bonus */}
          <ReviewBonus onBalanceChange={fetchData} />
        </div>
      )}

      {tab === 'wheel' && <BonusWheel />}

      {tab === 'rank' && <Leaderboard />}

      {tab === 'game' && <Gamification />}

      {/* Spin prompt — «у вас есть вращение!» при входе */}
      {spinPrompt > 0 && (
        <div
          onClick={() => setSpinPrompt(0)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(7,8,13,0.88)',
            backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="float-up"
            style={{
              background: 'var(--bg-2)', border: '1px solid rgba(255,230,0,0.3)', borderRadius: 24,
              padding: '32px 24px 24px', textAlign: 'center', maxWidth: 340, width: '100%', position: 'relative',
            }}
          >
            <div
              className="pulse"
              style={{
                width: 92, height: 92, borderRadius: 26, margin: '0 auto 18px',
                background: 'linear-gradient(135deg, #FFE600, #f59e0b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 44px rgba(255,230,0,0.5)',
              }}
            >
              <Disc3 size={46} color="#0a0a0a" />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Вас ждёт удача!</h3>
            <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 22 }}>
              У вас <b style={{ color: '#FFE600' }}>{spinPrompt}</b> {pluralSpins(spinPrompt)} крутить Колесо Удачи!
            </p>
            <button onClick={goToWheel} className="btn btn-primary" style={{ marginBottom: 8 }}>
              <Disc3 size={18} /> Крутить сейчас!
            </button>
            <button onClick={() => setSpinPrompt(0)} className="btn btn-ghost">
              Позже
            </button>
          </div>
        </div>
      )}

      {/* QR Modal */}
      <QRModal open={qrOpen} qrCode={data.qr_code} fullName={data.full_name} onClose={() => setQrOpen(false)} />

      {/* Bottom Tab Bar — скрыт в нативной оболочке (там нативный iOS 26 Liquid Glass tab bar) */}
      {!native && (
      <nav style={{
        position: 'fixed', left: 10, right: 10,
        bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        maxWidth: 460, margin: '0 auto',
        background: 'rgba(14,16,22,0.72)',
        backdropFilter: 'blur(36px) saturate(180%)', WebkitBackdropFilter: 'blur(36px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 26,
        boxShadow: '0 16px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10)',
        display: 'flex', alignItems: 'center', padding: 6, gap: 2,
        zIndex: 100,
      }}>
        {([
          { id: 'home', icon: Home, label: 'Главная' },
          { id: 'game', icon: Target, label: 'Цели' },
          { id: 'wheel', icon: Disc3, label: 'Удача' },
          { id: 'rank', icon: Trophy, label: 'Рейтинг' },
          { id: 'promo', icon: Gift, label: 'Бонусы' },
          { id: 'profile', icon: User, label: 'Профиль' },
        ] as const).map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} aria-label={t.label} className="tap"
              style={{
                flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer',
                position: 'relative', borderRadius: 16,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0',
                color: active ? 'var(--accent)' : 'var(--text-3)',
                transition: 'color 0.25s var(--ease-out)',
              }}>
              {active && (
                <span style={{
                  position: 'absolute', inset: '2px 4px', borderRadius: 15, zIndex: 0,
                  background: 'rgba(255,230,0,0.10)', border: '1px solid rgba(255,230,0,0.16)',
                  boxShadow: '0 0 16px rgba(255,220,0,0.18)',
                }} />
              )}
              <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>
                <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
                {t.id === 'promo' && hasNewCoupons && (
                  <span style={{
                    position: 'absolute', top: -2, right: -4, width: 8, height: 8,
                    background: '#f87171', borderRadius: '50%',
                    border: '2px solid rgba(20,23,32,1)',
                  }} />
                )}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: active ? 800 : 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap', position: 'relative', zIndex: 1 }}>{t.label}</span>
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
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Crown size={18} color="var(--accent)" /> Уровни лояльности
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
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
                  const tierColor = ({ Bronze: 'var(--bronze)', Silver: 'var(--silver)', Gold: 'var(--gold)', Platinum: 'var(--platinum)' } as Record<string, string>)[t.name] || 'var(--text2)';
                  return (
                    <div key={t.name} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      borderRadius: 14,
                      background: isCurrent ? 'rgba(255,230,0,0.07)' : 'rgba(255,255,255,0.03)',
                      border: isCurrent ? '1px solid rgba(255,230,0,0.3)' : '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                        background: 'rgba(255,255,255,0.05)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Crown size={18} color={tierColor} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: tierColor }}>
                          {t.name} {isCurrent && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>— вы здесь</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }} className="numeric">
                          от {t.min_total.toLocaleString('ru-RU')} сом покупок
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: tierColor }} className="numeric">{t.bonus_percent}%</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>бонус</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {data.next_tier_name && data.next_tier_remaining != null && (
              <div style={{
                padding: '11px 14px', borderRadius: 12, marginBottom: 12,
                background: 'rgba(255,230,0,0.06)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5,
              }}>
                💡 Ещё <strong style={{ color: 'var(--accent)' }} className="numeric">{Number(data.next_tier_remaining).toLocaleString('ru-RU')} сом</strong> покупок — и вы <strong style={{ color: 'var(--text)' }}>{data.next_tier_name}</strong>
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
              const meta = TX_META[txDetail.type] || { label: txDetail.type, color: '#8899aa', sign: '+' as const };
              return (
                <>
                  <div style={{ textAlign: 'center', marginBottom: 18 }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: 18, margin: '0 auto 10px',
                      background: `${meta.color}18`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Receipt size={26} color={meta.color} />
                    </div>
                    <div className="numeric" style={{ fontSize: 30, fontWeight: 800, color: meta.color }}>
                      {meta.sign}{Math.abs(Number(txDetail.amount)).toLocaleString('ru-RU')} сом
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{meta.label}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '4px 14px', marginBottom: 14 }}>
                    {txDetail.purchase_amount != null && Number(txDetail.purchase_amount) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text3)' }}>Сумма покупки</span>
                        <span className="numeric" style={{ fontWeight: 600 }}>{Number(txDetail.purchase_amount).toLocaleString('ru-RU')} сом</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: txDetail.note ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: 13 }}>
                      <span style={{ color: 'var(--text3)' }}>Дата и время</span>
                      <span style={{ fontWeight: 600 }}>
                        {new Date(txDetail.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {txDetail.note && (
                      <div style={{ padding: '11px 0', fontSize: 13 }}>
                        <div style={{ color: 'var(--text3)', marginBottom: 4 }}>Комментарий</div>
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
