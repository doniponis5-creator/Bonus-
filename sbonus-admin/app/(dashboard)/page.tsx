'use client';
import { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import ExportButton from '@/components/ExportButton';
import { adminAPI } from '@/lib/api';
import { LayoutDashboard, Users, Coins, CreditCard, Landmark, Calendar, Trophy, Loader2, XCircle } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Stats {
  total_customers: number; active_customers: number;
  total_bonus_issued: string; total_bonus_spent: string; total_balance: string;
  transactions_today: number; transactions_month: number;
  tier_distribution: Record<string,number>;
}

const fmt = (v: string | number) => Number(v).toLocaleString('ru-RU') + ' KGS';

const TIER_COLORS: Record<string, string> = {
  Bronze: '#CD7F32',
  Silver: '#C0C0C0',
  Gold: '#FFD700',
  Platinum: '#B9F2FF',
};
const DEFAULT_TIER_COLOR = '#FFE600';

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.stats().then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:60,color:'var(--text2)'}}><Loader2 size={16} className="animate-spin" /> Загрузка...</div>;
  if (!stats) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:60,color:'var(--danger)'}}><XCircle size={16} /> Ошибка загрузки</div>;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:800,display:'flex',alignItems:'center',gap:8}}><LayoutDashboard size={24} /> Дашборд</h1>
          <p style={{color:'var(--text2)',fontSize:14,marginTop:4}}>Смарт Центр • S Bonus</p>
        </div>
        <ExportButton />
      </div>

      <div className="grid-4" style={{marginBottom:24}}>
        <StatsCard icon={<Users size={20} />} label="Клиенты" value={stats.total_customers} sub={`Активных: ${stats.active_customers}`} />
        <StatsCard icon={<Coins size={20} />} label="Выдано бонусов" value={fmt(stats.total_bonus_issued)} color="var(--accent)" />
        <StatsCard icon={<CreditCard size={20} />} label="Использовано" value={fmt(stats.total_bonus_spent)} color="var(--accent3)" />
        <StatsCard icon={<Landmark size={20} />} label="Баланс на счетах" value={fmt(stats.total_balance)} color="var(--accent2)" />
      </div>

      <div className="grid-2" style={{marginBottom:24}}>
        <div className="card">
          <h3 style={{fontSize:14,color:'var(--text2)',marginBottom:16,display:'flex',alignItems:'center',gap:6}}><Calendar size={16} /> Транзакции</h3>
          <div style={{display:'flex',gap:24}}>
            <div><div style={{fontSize:32,fontWeight:800,color:'var(--accent)'}}>{stats.transactions_today}</div><div style={{fontSize:12,color:'var(--text3)'}}>Сегодня</div></div>
            <div><div style={{fontSize:32,fontWeight:800,color:'var(--text)'}}>{stats.transactions_month}</div><div style={{fontSize:12,color:'var(--text3)'}}>За месяц</div></div>
          </div>
        </div>
        <div className="card">
          <h3 style={{fontSize:14,color:'var(--text2)',marginBottom:16,display:'flex',alignItems:'center',gap:6}}><Trophy size={16} /> Распределение уровней</h3>
          {Object.entries(stats.tier_distribution).map(([name, count]) => (
            <div key={name} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(30,41,59,0.5)'}}>
              <span style={{fontSize:14}}>{name}</span>
              <span style={{fontSize:14,fontWeight:700,color:'var(--accent)'}}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid-2" style={{marginBottom:24}}>
        {/* Tier Distribution Donut Chart */}
        <div className="card">
          <h3 style={{fontSize:14,color:'var(--text2)',marginBottom:16,display:'flex',alignItems:'center',gap:6}}>
            <Trophy size={16} /> Распределение по уровням
          </h3>
          {(() => {
            const tierData = Object.entries(stats.tier_distribution).map(([name, value]) => ({
              name,
              value,
              color: TIER_COLORS[name] || DEFAULT_TIER_COLOR,
            }));
            const total = tierData.reduce((s, d) => s + d.value, 0);
            if (!total) return <p style={{color:'var(--text3)',fontSize:13}}>Нет данных</p>;
            return (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={tierData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {tierData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#fff',fontSize:13}}
                    formatter={(value: number, name: string) => [`${value} клиентов`, name]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => <span style={{color:'#94a3b8',fontSize:12}}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            );
          })()}
        </div>

        {/* Summary Card */}
        <div className="card">
          <h3 style={{fontSize:14,color:'var(--text2)',marginBottom:16,display:'flex',alignItems:'center',gap:6}}>
            <Coins size={16} /> Сводка по бонусам
          </h3>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {[
              {label:'Общий баланс',value:fmt(stats.total_balance),color:'var(--accent)'},
              {label:'Выдано всего',value:fmt(stats.total_bonus_issued),color:'var(--accent2)'},
              {label:'Использовано',value:fmt(stats.total_bonus_spent),color:'var(--accent3)'},
            ].map(item => (
              <div key={item.label} style={{background:'rgba(30,41,59,0.5)',borderRadius:10,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:13,color:'#94a3b8'}}>{item.label}</span>
                <span style={{fontSize:18,fontWeight:700,color:item.color}}>{item.value}</span>
              </div>
            ))}
            <div style={{background:'rgba(30,41,59,0.5)',borderRadius:10,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,color:'#94a3b8'}}>Всего клиентов</span>
              <span style={{fontSize:18,fontWeight:700,color:'#fff'}}>{stats.total_customers}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
