'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import {
  LayoutDashboard, Users, CreditCard, Store, Briefcase, Trophy, Ticket,
  Settings, LogOut, FileSearch, Gift, Tag, Star, BarChart3, Disc3,
  Flame, Send, MessageCircle, Menu, X, ChevronRight, FlaskConical, QrCode, Bot, Percent,
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
  { href: '/cashback', icon: Percent, label: 'Кешбэк' },
  { href: '/ab-testing', icon: FlaskConical, label: 'A/B тесты' },
  { href: '/qr-analytics', icon: QrCode, label: 'QR аналитика' },
  { href: '/customer-tg-bot', icon: Bot, label: 'TG бот клиентов' },
  { href: '/analytics', icon: BarChart3, label: 'Аналитика' },
  { href: '/audit-logs', icon: FileSearch, label: 'Журнал аудита' },
  { href: '/settings', icon: Settings, label: 'Настройки' },
];

const BOTTOM_TABS = [
  { href: '/', icon: LayoutDashboard, label: 'Главная' },
  { href: '/customers', icon: Users, label: 'Клиенты' },
  { href: '/transactions', icon: CreditCard, label: 'Операции' },
  { href: '/analytics', icon: BarChart3, label: 'Аналитика' },
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

  useEffect(() => { setMoreOpen(false); }, [path]);

  if (isMobile) {
    return <MobileNav path={path} moreOpen={moreOpen} setMoreOpen={setMoreOpen} />;
  }

  return <DesktopSidebar path={path} />;
}


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


function MobileNav({ path, moreOpen, setMoreOpen }: {
  path: string; moreOpen: boolean; setMoreOpen: (v: boolean) => void;
}) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const mainPaths = BOTTOM_TABS.slice(0, 4).map(t => t.href);
  const isOnMore = !mainPaths.some(p => p === path || (p !== '/' && path.startsWith(p)));

  // Prevent body scroll when sheet open
  useEffect(() => {
    if (moreOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [moreOpen]);

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
        height: 68,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        {BOTTOM_TABS.map(tab => {
          const isMore = tab.href === '/__more__';
          const active = isMore
            ? (moreOpen || isOnMore)
            : (path === tab.href || (tab.href !== '/' && path.startsWith(tab.href)));
          const Icon = isMore && moreOpen ? X : tab.icon;

          return (
            <button
              key={tab.href}
              onClick={() => {
                if (isMore) { setMoreOpen(!moreOpen); }
                else { setMoreOpen(false); router.push(tab.href); }
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? 'var(--accent)' : 'var(--text3)',
                fontSize: 10, fontWeight: active ? 700 : 500,
                padding: '8px 0', flex: 1,
                transition: 'color 0.2s, transform 0.15s',
                transform: active ? 'scale(1)' : 'scale(1)',
                WebkitTapHighlightColor: 'transparent',
                minWidth: 0,
              }}
            >
              <div style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 44, height: 28, borderRadius: 14,
                background: active ? 'rgba(255,230,0,0.12)' : 'transparent',
                transition: 'background 0.2s',
              }}>
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              </div>
              <span style={{ lineHeight: 1 }}>{isMore && moreOpen ? 'Закрыть' : tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* "More" overlay sheet */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 998,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              animation: 'fadeIn 0.2s ease',
            }}
          />
          <div ref={sheetRef} style={{
            position: 'fixed', bottom: 68, left: 0, right: 0, zIndex: 999,
            background: 'var(--bg2)', borderTop: '1px solid var(--border)',
            borderRadius: '20px 20px 0 0',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '8px 8px 16px',
            animation: 'sheetUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }}>
            {/* Handle */}
            <div style={{
              width: 36, height: 4, borderRadius: 2, background: 'var(--border)',
              margin: '4px auto 12px',
            }} />

            {/* Logo row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px 14px', borderBottom: '1px solid var(--border)', marginBottom: 6,
            }}>
              <img src="/icon-192.png" alt="S" width={30} height={30} style={{ borderRadius: 8 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>S Bonus Admin</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>Смарт Центр</div>
              </div>
            </div>

            {/* Grid of nav items */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
              padding: '6px 4px',
            }}>
              {NAV.filter(n => !mainPaths.includes(n.href)).map(n => {
                const active = path === n.href || (n.href !== '/' && path.startsWith(n.href));
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href} onClick={() => setMoreOpen(false)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 6, padding: '14px 6px', borderRadius: 14,
                    background: active ? 'rgba(255,230,0,0.1)' : 'rgba(255,255,255,0.02)',
                    border: active ? '1px solid rgba(255,230,0,0.2)' : '1px solid transparent',
                    transition: 'all 0.15s',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: active ? 'rgba(255,230,0,0.15)' : 'rgba(136,153,170,0.08)',
                    }}>
                      <Icon size={20} color={active ? 'var(--accent)' : 'var(--text2)'} />
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: active ? 700 : 500, textAlign: 'center',
                      color: active ? 'var(--accent)' : 'var(--text)',
                      lineHeight: 1.2,
                    }}>
                      {n.label}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Logout */}
            <button onClick={logout} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', borderRadius: 12, marginTop: 10,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
              cursor: 'pointer', width: '100%',
              WebkitTapHighlightColor: 'transparent',
            }}>
              <LogOut size={18} color="var(--danger)" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}>Выйти</span>
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
