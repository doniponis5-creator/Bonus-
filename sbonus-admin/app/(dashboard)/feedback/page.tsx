'use client';
import { useEffect, useState } from 'react';
import { Star, ThumbsUp, ThumbsDown, Minus, MessageCircle, TrendingUp, Users, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { feedbackAPI } from '@/lib/api';

const NPS_COLORS = { promoter: '#10b981', passive: '#f59e0b', detractor: '#ef4444' };
const SENTIMENT_COLORS = { positive: '#10b981', neutral: '#6b7280', negative: '#ef4444' };

export default function FeedbackPage() {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    feedbackAPI.dashboard(days)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Загрузка...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Ошибка загрузки</div>;

  const npsColor = data.nps_score >= 50 ? '#10b981' : data.nps_score >= 0 ? '#f59e0b' : '#ef4444';
  const npsLabel = data.nps_score >= 50 ? 'Отлично' : data.nps_score >= 0 ? 'Хорошо' : 'Нужно улучшить';

  const scoreDistData = Object.entries(data.score_distribution || {}).map(([k, v]) => ({
    score: k,
    count: v as number,
    fill: parseInt(k) >= 9 ? '#10b981' : parseInt(k) >= 7 ? '#f59e0b' : '#ef4444',
  }));

  const sentimentData = Object.entries(data.sentiment_breakdown || {}).map(([k, v]) => ({
    name: k === 'positive' ? 'Позитивные' : k === 'negative' ? 'Негативные' : 'Нейтральные',
    value: v as number,
    fill: SENTIMENT_COLORS[k as keyof typeof SENTIMENT_COLORS],
  }));

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={24} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>NPS & Обратная связь</h1>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>{data.total_responses} ответов за {days} дней</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[30, 90, 180, 365].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: days === d ? '#10b981' : '#1e293b', color: days === d ? 'white' : '#9ca3af' }}>{d}д</button>
          ))}
        </div>
      </div>

      {/* NPS Score + KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 24 }}>
        {/* NPS Gauge */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, border: '1px solid #334155', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>NPS Score</div>
          <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto 12px' }}>
            <svg viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="80" cy="80" r="70" fill="none" stroke="#374151" strokeWidth="12" />
              <circle cx="80" cy="80" r="70" fill="none" stroke={npsColor} strokeWidth="12"
                strokeDasharray={`${Math.max(0, (data.nps_score + 100) / 200 * 440)} 440`} strokeLinecap="round" />
            </svg>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: npsColor }}>{data.nps_score}</div>
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: npsColor }}>{npsLabel}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Среднее: {data.avg_score}/10</div>
        </div>

        {/* Distribution */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'Промоутеры (9-10)', value: data.promoters, pct: data.promoter_pct, color: '#10b981', icon: <ThumbsUp size={20} /> },
            { label: 'Пассивные (7-8)', value: data.passives, pct: data.passive_pct, color: '#f59e0b', icon: <Minus size={20} /> },
            { label: 'Детракторы (0-6)', value: data.detractors, pct: data.detractor_pct, color: '#ef4444', icon: <ThumbsDown size={20} /> },
          ].map((cat, i) => (
            <div key={i} style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: cat.color, marginBottom: 12 }}>{cat.icon}<span style={{ fontSize: 12, color: '#9ca3af' }}>{cat.label}</span></div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#f1f5f9' }}>{cat.value}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: cat.color }}>{cat.pct}%</div>
              <div style={{ height: 6, background: '#374151', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${cat.pct}%`, height: '100%', background: cat.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Score Distribution */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Распределение оценок</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreDistData}>
              <XAxis dataKey="score" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {scoreDistData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sentiment Pie */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Анализ тональности</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={3}>
                {sentimentData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
            {sentimentData.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.fill }} />
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{d.name}: {d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* NPS Trend */}
      {(data.monthly_trend || []).length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155', marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Тренд NPS по месяцам</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.monthly_trend}>
              <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
              <Area type="monotone" dataKey="nps" stroke="#10b981" fill="#10b98122" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Feedbacks */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={18} color="#6366f1" /> Последние отзывы
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(data.recent_feedbacks || []).slice(0, 10).map((fb: any, i: number) => {
            const scoreColor = fb.score >= 9 ? '#10b981' : fb.score >= 7 ? '#f59e0b' : '#ef4444';
            return (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', background: '#0f172a', borderRadius: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: scoreColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: scoreColor, flexShrink: 0 }}>{fb.score}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{fb.customer_name}</span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{fb.customer_phone}</span>
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: scoreColor + '22', color: scoreColor, fontWeight: 600 }}>{fb.nps_category}</span>
                  </div>
                  {fb.comment && <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.5 }}>{fb.comment}</div>}
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{fb.created_at?.slice(0, 16).replace('T', ' ')} • {fb.source}</div>
                </div>
              </div>
            );
          })}
          {(data.recent_feedbacks || []).length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#6b7280' }}>Пока нет отзывов. Они появятся после того как клиенты оценят обслуживание.</div>
          )}
        </div>
      </div>
    </div>
  );
}
