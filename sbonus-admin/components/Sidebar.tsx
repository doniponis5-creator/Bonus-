'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, CreditCard, Store, Briefcase, Trophy, Ticket, Settings, LogOut, FileSearch, Gift, Tag, Star, BarChart3 } from 'lucide-react';

const NAV = [
  { href: '/', icon: <LayoutDashboard size={20} />, label: 'Дашборд' },
  { href: '/customers', icon: <Users size={20} />, label: 'Клиенты' },
  { href: '/transactions', icon: <CreditCard size={20} />, label: 'Транзакции' },
  { href: '/campaigns', icon: <Gift size={20} />, label: 'Бонус-кампании' },
  { href: '/branches', icon: <Store size={20} />, label: 'Филиалы' },
  { href: '/cashiers', icon: <Briefcase size={20} />, label: 'Кассиры' },
  { href: '/tiers', icon: <Trophy size={20} />, label: 'Уровни' },
  { href: '/promo-codes', icon: <Ticket size={20} />, label: 'Промокоды' },
  { href: '/coupons', icon: <Tag size={20} />, label: 'Купоны' },
  { href: '/reviews', icon: <Star size={20} />, label: 'Отзывы' },
  { href: '/analytics', icon: <BarChart3 size={20} />, label: 'Аналитика' },
  { href: '/audit-logs', icon: <FileSearch size={20} />, label: 'Журнал аудита' },
  { href: '/settings', icon: <Settings size={20} />, label: 'Настройки' },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside style={{width:240,minHeight:'100vh',background:'var(--bg2)',borderRight:'1px solid var(--border)',padding:'24px 12px',display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'0 8px',marginBottom:32}}>
        <div style={{width:38,height:38,borderRadius:12,background:'#FFE600',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:900,color:'#0a0f1a'}}>S</div>
        <div><div style={{fontSize:15,fontWeight:800,color:'var(--text)'}}>S Bonus</div><div style={{fontSize:11,color:'var(--text2)'}}>Смарт Центр</div></div>
      </div>
      <nav style={{display:'flex',flexDirection:'column',gap:2,flex:1}}>
        {NAV.map(n => {
          const active = path === n.href || (n.href !== '/' && path.startsWith(n.href));
          return (
            <Link key={n.href} href={n.href} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,fontSize:14,fontWeight:active?700:500,color:active?'var(--accent)':'var(--text2)',background:active?'rgba(255,230,0,0.08)':'transparent',transition:'all 0.15s'}}>
              <span style={{fontSize:18}}>{n.icon}</span>{n.label}
            </Link>
          );
        })}
      </nav>
      <button onClick={() => { localStorage.removeItem('admin_token'); window.location.href = '/login'; }} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',borderRadius:10,fontSize:13,color:'var(--danger)',background:'transparent',border:'none',cursor:'pointer',fontWeight:600}}>
        <LogOut size={16} /> Выход
      </button>
    </aside>
  );
}
