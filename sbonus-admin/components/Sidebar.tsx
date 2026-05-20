'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, CreditCard, Store, Briefcase, Trophy, Ticket,
  Settings, LogOut, FileSearch, Gift, Tag, Star, BarChart3, Disc3,
  Flame, Send, MessageCircle, Menu, X, ChevronRight,
} from 'lucide-react';

const NAV = [
  { href: '/', icon: LayoutDashboard, label: 'Дашборд' },
  { href: '/customers', icon: Users, label: 'Клиенты' },
  { href: '/transactions', icon: CreditCard, label: 'Транзакции' },
  { href: '/campaigns', icon: Gift, label: 'Бонус-кампании' },
  { href: '/branches', icon: Store, label: 'Филиалы' },
  { href: '/cashiers', icon: Briefcase, label: 'Кассиры' },
  { href: '/cashier-bonuses', icon: Flame, label: 'Мотивация' },
  { href: '/tiers', icon: Trophy, label: 'Уровни' },
  { href: '/promo-codes', icon: Ticket, label: 'Промокоды' },
  { href: '/coupons', icon: Tag, label: 'Купоны' },
  { href: '/reviews', icon: Star, label: 'Отзывы' },
  { href: '/wheel-settings', icon: Disc3, label: 'Колесо удачи' },
  { href: '/wa-broadcast', icon: MessageCircle, label: 'Рассылки WA' },
  { href: '/telegram', icon: Send, label: 'Telegram бот' },
  { href: '/analytics', icon: BarChart3, label: 'Аналитика' },
  { href: '/audit-logs', icon: FileSearch, label: 'Журнал аудита' },
  { href: '/settings', icon: Settings, label: 'Настройки' },
];

// Bottom nav tabs for mobile
const BOTTOM_TABS = [
  { href: '/', icon: LayoutDashboard, label: 'Главная' },
  { href: '/customers', icon: Users, label: 'Клиенты' },
  { href: '/transactions', icon: CreditCard, label: 'Операции' },
  { href: '/__more__', icon: Menu, label: 'Ещё' },
];

function logout() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_refresh');
  localStorage.removeItem('admin_user');
  document.cookie = 'admin_token=; path=/; max-age=0';
  document.cookie = 'admin_refresh=; path=/; max-age=0';
  window.location.href = '/login';
}

export default function Sidebar() {
  const path = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close "more" menu on route change
  useEffect(() => { setMoreOpen(false); }, [path]);

  if (isMobile) {
    return <MobileNav path={path} moreOpen={moreOpen} setMoreOpen={setMoreOpen} />;
  }

  return <DesktopSidebar path={path} />;
}


// ═══════════════════════════════════════
// DESKTOP SIDEBAR (unchanged look)
// ═══════════════════════════════════════
function DesktopSidebar({ path }: { path: string }) {
  return (
    <aside style={{
      width: 240, minHeight: '100vh', background: 'var(--bg2)',
      borderRight: '1px solid var(--border)', padding: '24px 12px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 32 }}>
        <img src="/icon-192.png" alt="S" width={38} height={38} style={{ borderRadius: 12 }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>S Bonus</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>Смарт Центр</div>
        </div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {NAV.map(n => {
          const active = path === n.href || (n.href !== '/' && path.startsWith(n.href));
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 10, fontSize: 14, fontWeight: active ? 700 : 500,
              color: active ? 'var(--accent)' : 'var(--text2)',
              background: active ? 'rgba(255,230,0,0.08)' : 'transparent',
              transition: 'all 0.15s',
            }}>
              <Icon size={20} />{n.label}
            </Link>
          );
        })}
      </nav>
      <button onClick={logout} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        borderRadius: 10, fontSize: 13, color: 'var(--danger)', background: 'transparent',
        border: 'none', cursor: 'pointer', fontWeight: 600,
      }}>
        <LogOut size={16} /> Выход
      </button>
    </aside>
  );
}


// ═══════════════════════════════════════
// MOBILE BOTTOM NAV + "MORE" SHEET
// ═══════════════════════════════════════
function MobileNav({ path, moreOpen, setMoreOpen }: {
  path: string; moreOpen: boolean; setMoreOpen: (v: boolean) => void;
}) {
  const router = useRouter();
  // Pages shown in bottom tabs (first 3)
  const mainPaths = BOTTOM_TABS.slice(0, 3).map(t => t.href);
  const isOnMore = !mainPaths.some(p => p === path || (p !== '/' && path.startsWith(p)));

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        height: 64, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {BOTTOM_TABS.map(tab => {
          const isMore = tab.href === '/__more__';
          const active = isMore
            ? (moreOpen || isOnMore)
            : (path === tab.href || (tab.href !== '/' && path.startsWith(tab.href)));
          const Icon = tab.icon;

          return (
            <button
              key={tab.href}
              onClick={() => {
                if (isMore) { setMoreOpen(!moreOpen); }
                else { setMoreOpen(false); router.push(tab.href); }
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? 'var(--accent)' : 'var(--text3)',
                fontSize: 10, fontWeight: active ? 700 : 500,
                padding: '6px 12px', transition: 'color 0.15s',
                position: 'relative',
              }}
            >
              {active && (
                <span style={{
                  position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                  width: 20, height: 3, borderRadius: 2,
                  background: 'var(--accent)',
                }} />
              )}
              <Icon size={22} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* "More" overlay sheet */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 998,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed', bottom: 64, left: 0, right: 0, zIndex: 999,
            background: 'var(--bg2)', borderTop: '1px solid var(--border)',
            borderRadius: '20px 20px 0 0', maxHeight: '70vh', overflowY: 'auto',
            padding: '12px 8px 20px',
            animation: 'slideUp 0.25s ease',
          }}>
            {/* Handle bar */}
            <div style={{
              width: 36, height: 4, borderRadius: 2, background: 'var(--border)',
              margin: '0 auto 12px',
            }} />

            {/* Logo */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8,
            }}>
              <img src="/icon-192.png" alt="S" width={32} height={32} style={{ borderRadius: 10 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>S Bonus</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>Смарт Центр</div>
              </div>
            </div>

            {/* All nav items (except first 3 already in bottom bar) */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {NAV.filter(n => !mainPaths.includes(n.href)).map(n => {
                const active = path === n.href || (n.href !== '/' && path.startsWith(n.href));
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href} onClick={() => setMoreOpen(false)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 14px', borderRadius: 12,
                    background: active ? 'rgba(255,230,0,0.08)' : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: active ? 'rgba(255,230,0,0.12)' : 'rgba(136,153,170,0.06)',
                      }}>
                        <Icon size={18} color={active ? 'var(--accent)' : 'var(--text2)'} />
                      </div>
                      <span style={{
                        fontSize: 15, fontWeight: active ? 700 : 500,
                        color: active ? 'var(--accent)' : 'var(--text)',
                      }}>
                        {n.label}
                      </span>
                    </div>
                    <ChevronRight size={16} color="var(--text3)" />
                  </Link>
                );
              })}
            </nav>

            {/* Logout */}
            <button onClick={logout} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 14px', borderRadius: 12, marginTop: 8,
              background: 'rgba(239,68,68,0.06)', border: 'none',
              cursor: 'pointer', width: '100%',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(239,68,68,0.12)',
              }}>
                <LogOut size={18} color="var(--danger)" />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>Выйти</span>
            </button>
          </div>
        </>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
