'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Target, Users, Zap, TrendingUp, Send, MessageCircle, DollarSign, Clock, Calendar, Crown, Gem, Sprout, UserPlus, AlertTriangle, Eye, Moon, BedDouble, PartyPopper, Heart, Gift, Cake, CircleDot } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { smartCampaignAPI } from '@/lib/api';

const SEG_COLORS: Record<string, string> = {
  champions: '#10b981', loyal: '#6366f1', potential_loyalists: '#22c55e',
  new_customers: '#3b82f6', at_risk: '#f59e0b', need_attention: '#f97316',
  hibernating: '#ef4444', lost: '#dc2626',
};

const SEG_ICONS: Record<string, any> = {
  champions: Crown,
  loyal: Gem,
  potential_loyalists: Sprout,
  new_customers: UserPlus,
  at_risk: AlertTriangle,
  need_attention: Eye,
  hibernating: Moon,
  lost: BedDouble,
};

const TEMPLATE_ICONS: Record<string, any> = {
  welcome: PartyPopper,
  comeback: Heart,
  vip: Crown,
  weekend: Gift,
  birthday: Cake,
  flash_sale: Zap,
};

function SegIcon({ id, size = 20 }: { id: string; size?: number }) {
  const Icon = SEG_ICONS[id] || CircleDot;
  const color = SEG_COLORS[id] || '#6b7280';
  return <div style={{ width: size + 10, height: size + 10, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={size} color={color} /></div>;
}

function TplIcon({ id }: { id: string }) {
  const Icon = TEMPLATE_ICONS[id] || Gift;
  return <div style={{ width: 30, height: 30, borderRadius: 8, background: '#6366f120', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={16} color="#6366f1" /></div>;
}

export default function SmartCampaignsPage() {
  const [data, setData] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedSeg, setSelectedSeg] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [bonusAmount, setBonusAmount] = useState(100);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<string | null>(null);
  const router = useRouter();

  const handleLaunch = async () => {
    if (!selectedSeg || !suggestion) return;
    if (!confirm(`Создать кампанию для сегмента «${suggestion.segment?.name}» (${suggestion.recipients} клиентов, ${bonusAmount} сом каждому)?`)) return;
    setLaunching(true);
    setLaunchResult(null);
    try {
      const r = await smartCampaignAPI.launch({
        segment_id: selectedSeg,
        bonus_amount: bonusAmount,
        message_template: suggestion.message_template ? suggestion.message_template + '\n{link}' : undefined,
      });
      setLaunchResult(r.data.message || 'Кампания создана');
      setTimeout(() => router.push('/campaigns'), 1500);
    } catch (e: any) {
      setLaunchResult(e?.response?.data?.detail || 'Ошибка создания кампании');
    } finally {
      setLaunching(false);
    }
  };

  useEffect(() => {
    Promise.all([
      smartCampaignAPI.segments(),
      smartCampaignAPI.templates(),
    ]).then(([seg, tmpl]) => {
      setData(seg.data);
      setTemplates(tmpl.data.templates || []);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  const handleSelectSegment = async (segId: string) => {
    setSelectedSeg(segId);
    try {
      const r = await smartCampaignAPI.suggest({ segment_id: segId, bonus_amount: bonusAmount });
      setSuggestion(r.data);
    } catch {}
  };

  const handleUpdateBonus = async (amount: number) => {
    setBonusAmount(amount);
    if (selectedSeg) {
      try {
        const r = await smartCampaignAPI.suggest({ segment_id: selectedSeg, bonus_amount: amount });
        setSuggestion(r.data);
      } catch {}
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Загрузка...</div>;

  const segments = data?.segments || [];
  const pieData = segments.filter((s: any) => s.count > 0).map((s: any) => ({
    name: s.name, value: s.count, fill: SEG_COLORS[s.id] || '#6b7280',
  }));

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Brain size={24} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Smart Campaign Builder</h1>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>AI-сегментация • {data?.total_customers || 0} клиентов</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 24 }}>
        {/* Segments Grid */}
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 12 }}>RFM Сегменты</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {segments.map((s: any) => (
              <div key={s.id} onClick={() => handleSelectSegment(s.id)}
                style={{ background: selectedSeg === s.id ? '#312e81' : '#1e293b', borderRadius: 12, padding: '14px 16px', border: selectedSeg === s.id ? '2px solid #6366f1' : '1px solid #334155', cursor: 'pointer', transition: 'all .2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <SegIcon id={s.id} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: SEG_COLORS[s.id] || '#f1f5f9' }}>{s.count}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{s.pct}%</span>
                </div>
                <div style={{ height: 4, background: '#374151', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${s.pct}%`, height: '100%', background: SEG_COLORS[s.id] || '#6b7280', borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pie Chart */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 12, textAlign: 'center' }}>Распределение</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" paddingAngle={2}>
                {pieData.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campaign Suggestion */}
      {suggestion && (
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', borderRadius: 12, padding: 24, border: '1px solid #6366f1', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Zap size={20} color="#f59e0b" />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>AI-рекомендация для <SegIcon id={suggestion.segment?.id} size={16} /> {suggestion.segment?.name}</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { icon: <Users size={16} />, label: 'Получателей', value: suggestion.recipients, color: '#6366f1' },
              { icon: <DollarSign size={16} />, label: 'Бонус', value: `${suggestion.selected_bonus} сом`, color: '#10b981' },
              { icon: <TrendingUp size={16} />, label: 'Конверсия', value: `${suggestion.expected_conversion}%`, color: '#f59e0b' },
              { icon: <Target size={16} />, label: 'ROI', value: `${suggestion.estimated_roi}%`, color: suggestion.estimated_roi > 0 ? '#10b981' : '#ef4444' },
              { icon: <DollarSign size={16} />, label: 'Затраты', value: `${suggestion.estimated_cost.toLocaleString()} сом`, color: '#ef4444' },
              { icon: <DollarSign size={16} />, label: 'Ожид. выручка', value: `${Math.round(suggestion.expected_revenue).toLocaleString()} сом`, color: '#10b981' },
            ].map((m, i) => (
              <div key={i} style={{ background: '#0f172a88', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: m.color, marginBottom: 4 }}>{m.icon}<span style={{ fontSize: 11, color: '#9ca3af' }}>{m.label}</span></div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#9ca3af' }}>Бонус:</span>
            <input type="range" min="50" max="500" step="50" value={bonusAmount} onChange={e => handleUpdateBonus(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', minWidth: 60 }}>{bonusAmount} сом</span>
          </div>

          <div style={{ background: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>Шаблон сообщения:</div>
            <div style={{ fontSize: 14, color: '#f1f5f9', lineHeight: 1.6 }}>{suggestion.message_template}</div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              <Clock size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Лучшее время: <b style={{ color: '#f1f5f9' }}>{suggestion.best_time}</b>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              <Calendar size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Лучшие дни: <b style={{ color: '#f1f5f9' }}>{suggestion.best_day}</b>
            </div>
          </div>

          <button
            onClick={handleLaunch}
            disabled={launching || suggestion.recipients === 0}
            style={{
              marginTop: 16, width: '100%', padding: '14px 20px', borderRadius: 10,
              background: launching ? '#4b5563' : 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white', fontSize: 15, fontWeight: 700, border: 'none',
              cursor: launching || suggestion.recipients === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: suggestion.recipients === 0 ? 0.5 : 1,
            }}
          >
            <Send size={18} />
            {launching ? 'Создание кампании...' : `Запустить кампанию (${suggestion.recipients} клиентов)`}
          </button>
          {launchResult && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#10b981', textAlign: 'center' }}>{launchResult}</div>
          )}
        </div>
      )}

      {/* Campaign Templates */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={18} color="#6366f1" /> Готовые шаблоны кампаний
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {templates.map((t: any, i: number) => (
            <div key={i} style={{ background: '#0f172a', borderRadius: 10, padding: '14px 16px', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <TplIcon id={t.id} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{t.name}</div>
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 1.5 }}>{t.template}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Цель: {t.target}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>{t.recommended_bonus} сом</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
