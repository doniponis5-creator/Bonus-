'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Target, Users, Zap, TrendingUp, Send, MessageCircle, DollarSign, Clock, Calendar, Crown, Gem, Sprout, UserPlus, AlertTriangle, Eye, Moon, BedDouble, PartyPopper, Heart, Gift, Cake, CircleDot } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { smartCampaignAPI } from '@/lib/api';

const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  fontSize: 13,
};

// Hex literals — used as Recharts SVG fills (CSS vars do not work in SVG attrs)
const SEG_COLORS: Record<string, string> = {
  champions: '#FFE600', loyal: '#8b5cf6', potential_loyalists: '#22c55e',
  new_customers: '#3b82f6', at_risk: '#f59e0b', need_attention: '#ec4899',
  hibernating: '#8899aa', lost: '#ef4444',
};
const SEG_FALLBACK = '#8899aa';

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
  const color = SEG_COLORS[id] || SEG_FALLBACK;
  return <div style={{ width: size + 10, height: size + 10, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={size} color={color} /></div>;
}

function TplIcon({ id }: { id: string }) {
  const Icon = TEMPLATE_ICONS[id] || Gift;
  return <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={16} color="var(--accent)" /></div>;
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
  const [recipients, setRecipients] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recLoading, setRecLoading] = useState(false);
  const [recSearch, setRecSearch] = useState('');
  const router = useRouter();

  const handleLaunch = async () => {
    if (!selectedSeg || !suggestion) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) { setLaunchResult('Выберите хотя бы одного получателя'); return; }
    if (!confirm(`Создать кампанию для «${suggestion.segment?.name}» — ${ids.length} получателей по ${bonusAmount} сом?`)) return;
    setLaunching(true);
    setLaunchResult(null);
    try {
      const r = await smartCampaignAPI.launch({
        segment_id: selectedSeg,
        bonus_amount: bonusAmount,
        message_template: suggestion.message_template ? suggestion.message_template + '\n{link}' : undefined,
        customer_ids: ids,
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
    setRecLoading(true);
    setRecSearch('');
    try {
      const [s, c] = await Promise.all([
        smartCampaignAPI.suggest({ segment_id: segId, bonus_amount: bonusAmount }),
        smartCampaignAPI.segmentCustomers(segId),
      ]);
      setSuggestion(s.data);
      const list = c.data.customers || [];
      setRecipients(list);
      setSelectedIds(new Set(list.map((x: any) => x.customer_id)));
    } catch {} finally { setRecLoading(false); }
  };

  const toggleId = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAllRec = () => setSelectedIds(new Set(recipients.map((x: any) => x.customer_id)));
  const clearRec = () => setSelectedIds(new Set());

  const handleUpdateBonus = async (amount: number) => {
    setBonusAmount(amount);
    if (selectedSeg) {
      try {
        const r = await smartCampaignAPI.suggest({ segment_id: selectedSeg, bonus_amount: amount });
        setSuggestion(r.data);
      } catch {}
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Загрузка...</div>;

  const segments = data?.segments || [];
  const pieData = segments.filter((s: any) => s.count > 0).map((s: any) => ({
    name: s.name, value: s.count, fill: SEG_COLORS[s.id] || SEG_FALLBACK,
  }));

  const recQuery = recSearch.trim().toLowerCase();
  const filteredRecipients = recQuery
    ? recipients.filter((r: any) => (r.name || '').toLowerCase().includes(recQuery) || (r.phone || '').includes(recQuery))
    : recipients;
  const pickBtn: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div className="icon-tile" style={{ width: 44, height: 44, background: 'var(--accent-dim)' }}>
          <Brain size={24} color="var(--accent)" />
        </div>
        <div>
          <h1 className="h1">Smart Campaign Builder</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>AI-сегментация • {data?.total_customers || 0} клиентов</p>
        </div>
      </div>

      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 24 }}>
        {/* Segments Grid */}
        <div>
          <h3 className="h3" style={{ color: 'var(--text)', marginBottom: 12 }}>RFM Сегменты</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {segments.map((s: any) => (
              <div key={s.id} onClick={() => handleSelectSegment(s.id)}
                style={{
                  background: selectedSeg === s.id ? 'var(--accent-dim)' : 'var(--card)',
                  borderRadius: 16, padding: '14px 16px',
                  border: selectedSeg === s.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  cursor: 'pointer', transition: 'border-color .2s, background .2s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <SegIcon id={s.id} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{s.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="numeric" style={{ fontSize: 24, fontWeight: 700, color: SEG_COLORS[s.id] || 'var(--text)' }}>{s.count}</span>
                  <span className="numeric" style={{ fontSize: 12, color: 'var(--text2)' }}>{s.pct}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${s.pct}%`, height: '100%', background: SEG_COLORS[s.id] || SEG_FALLBACK, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pie Chart */}
        <div className="card" style={{ padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12, textAlign: 'center' }}>Распределение</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" paddingAngle={2} stroke="none">
                {pieData.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campaign Suggestion */}
      {suggestion && (
        <div className="card card-accent" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Zap size={20} color="var(--accent)" />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>AI-рекомендация для <SegIcon id={suggestion.segment?.id} size={16} /> {suggestion.segment?.name}</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { icon: <Users size={16} />, label: 'Получателей', value: suggestion.recipients, color: 'var(--info)' },
              { icon: <DollarSign size={16} />, label: 'Бонус', value: `${suggestion.selected_bonus} сом`, color: 'var(--success)' },
              { icon: <TrendingUp size={16} />, label: 'Конверсия', value: `${suggestion.expected_conversion}%`, color: 'var(--warn)' },
              { icon: <Target size={16} />, label: 'ROI', value: `${suggestion.estimated_roi}%`, color: suggestion.estimated_roi > 0 ? 'var(--success)' : 'var(--danger)' },
              { icon: <DollarSign size={16} />, label: 'Затраты', value: `${suggestion.estimated_cost.toLocaleString()} сом`, color: 'var(--danger)' },
              { icon: <DollarSign size={16} />, label: 'Ожид. выручка', value: `${Math.round(suggestion.expected_revenue).toLocaleString()} сом`, color: 'var(--success)' },
            ].map((m, i) => (
              <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: m.color, marginBottom: 4 }}>{m.icon}<span style={{ fontSize: 11, color: 'var(--text2)' }}>{m.label}</span></div>
                <div className="numeric" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>Бонус:</span>
            <input type="range" min="50" max="500" step="50" value={bonusAmount} onChange={e => handleUpdateBonus(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
            <span className="numeric" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', minWidth: 60 }}>{bonusAmount} сом</span>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Шаблон сообщения:</div>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{suggestion.message_template}</div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              <Clock size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Лучшее время: <b style={{ color: 'var(--text)' }}>{suggestion.best_time}</b>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              <Calendar size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Лучшие дни: <b style={{ color: 'var(--text)' }}>{suggestion.best_day}</b>
            </div>
          </div>

          {/* Получатели — выбор вручную */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                <Users size={15} color="var(--accent)" /> Получатели
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>выбрано {selectedIds.size} из {recipients.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={selectAllRec} style={pickBtn}>Все</button>
                <button onClick={clearRec} style={pickBtn}>Снять</button>
              </div>
            </div>
            <input value={recSearch} onChange={e => setRecSearch(e.target.value)} placeholder="Поиск по имени или телефону..."
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 10, fontFamily: 'inherit' }} />
            {recLoading ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Загрузка...</div>
            ) : recipients.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Нет клиентов с телефоном в этом сегменте</div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredRecipients.map((r: any) => {
                  const on = selectedIds.has(r.customer_id);
                  return (
                    <label key={r.customer_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--accent-dim)' : 'transparent', border: `1px solid ${on ? 'var(--accent-border, var(--accent))' : 'var(--border)'}` }}>
                      <input type="checkbox" checked={on} onChange={() => toggleId(r.customer_id)} style={{ accentColor: 'var(--accent)', width: 16, height: 16, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name || 'Без имени'}</div>
                        <div className="numeric" style={{ fontSize: 11, color: 'var(--text2)' }}>{r.phone} · {Math.round(r.total_spent).toLocaleString()} сом · {r.purchases} покупок</div>
                      </div>
                    </label>
                  );
                })}
                {filteredRecipients.length === 0 && (
                  <div style={{ padding: 12, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Ничего не найдено</div>
                )}
              </div>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleLaunch}
            disabled={launching || selectedIds.size === 0}
            style={{ marginTop: 16, width: '100%', padding: '14px 20px', fontSize: 15 }}
          >
            <Send size={18} />
            {launching ? 'Создание кампании...' : `Запустить кампанию (${selectedIds.size} клиентов)`}
          </button>
          {launchResult && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--success)', textAlign: 'center' }}>{launchResult}</div>
          )}
        </div>
      )}

      {/* Campaign Templates */}
      <div className="card" style={{ padding: 20 }}>
        <h3 className="h3" style={{ color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={18} color="var(--accent)" /> Готовые шаблоны кампаний
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {templates.map((t: any, i: number) => (
            <div key={i} style={{ background: 'var(--bg2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <TplIcon id={t.id} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.5 }}>{t.template}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Цель: {t.target}</span>
                <span className="numeric" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{t.recommended_bonus} сом</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
