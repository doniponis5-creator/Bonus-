'use client';
import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart,
  Activity, BarChart3, Loader2, RefreshCw, Calendar,
  ArrowUpRight, ArrowDownRight, Zap, Target,
} from 'lucide-react';
import { forecastAPI } from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, ComposedChart,
  Line, Legend,
} from 'recharts';

export default function ForecastPage() {
  const [summary, setSummary] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [customers, setCustomers] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'revenue' | 'customers'>('overview');

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, rRes, cRes] = await Promise.all([
        forecastAPI.summary().catch(() => ({ data: null })),
        forecastAPI.revenue(90, 30).catch(() => ({ data: null })),
        forecastAPI.customers(90, 30).catch(() => ({ data: null })),
      ]);
      setSummary(sRes.data);
      setRevenue(rRes.data);
      setCustomers(cRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
  const fmtK = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n));

  const ChangeIndicator = ({ value }: { value: number }) => {
    const isUp = value >= 0;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: 12, fontWeight: 700,
        color: isUp ? '#10b981' : '#ef4444',
      }}>
        {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Loader2 size={18} className="animate-spin" /> Прогнозирование...
    </div>
  );

  // Combine history + forecast for chart
  const revenueChartData = revenue ? [
    ...revenue.history.slice(-30).map((d: any) => ({ ...d, type: 'history' })),
    ...revenue.forecast.map((d: any) => ({
      date: d.date,
      revenue: d.predicted_revenue,
      confidence_low: d.confidence_low,
      confidence_high: d.confidence_high,
      type: 'forecast',
    })),
  ] : [];

  const customerChartData = customers ? [
    ...customers.history.slice(-30).map((d: any) => ({
      date: d.date,
      new_customers: d.new_customers,
      type: 'history',
    })),
    ...customers.forecast.map((d: any) => ({
      date: d.date,
      new_customers: d.predicted_new,
      cumulative: d.cumulative_total,
      type: 'forecast',
    })),
  ] : [];

  const tabs = [
    { id: 'overview', label: 'Обзор', icon: Target },
    { id: 'revenue', label: 'Выручка', icon: DollarSign },
    { id: 'customers', label: 'Клиенты', icon: Users },
  ];

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Activity size={20} color="#fff" />
            </div>
            Revenue Forecast
          </h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>AI-прогноз выручки и роста на 30 дней</p>
        </div>
        <button onClick={load} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text3)', fontSize: 13, cursor: 'pointer',
        }}>
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      {/* Tabs */}
      <div className="mobile-tab-bar" style={{ display: 'flex', gap: 4, marginBottom: 20, padding: 4, background: 'var(--bg2)', borderRadius: 12, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.2s',
            background: tab === t.id ? 'var(--accent)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--text3)',
          }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && summary && (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              {
                label: 'Выручка (30д)',
                value: fmt(summary.current_period.revenue) + ' сом',
                change: summary.changes.revenue_pct,
                icon: DollarSign, color: '#6366f1',
              },
              {
                label: 'Транзакций',
                value: fmt(summary.current_period.transactions),
                change: summary.changes.transactions_pct,
                icon: ShoppingCart, color: '#8b5cf6',
              },
              {
                label: 'Средний чек',
                value: fmt(summary.current_period.avg_check) + ' сом',
                change: summary.changes.avg_check_pct,
                icon: BarChart3, color: '#06b6d4',
              },
              {
                label: 'Новых клиентов',
                value: fmt(summary.current_period.new_customers),
                change: summary.changes.customers_pct,
                icon: Users, color: '#10b981',
              },
            ].map((kpi, i) => (
              <div key={i} style={{
                background: 'var(--bg2)', borderRadius: 14, padding: 18,
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: kpi.color + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <kpi.icon size={18} color={kpi.color} />
                  </div>
                  <ChangeIndicator value={kpi.change} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Forecast banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,182,212,0.06))',
            borderRadius: 16, padding: 24, marginBottom: 24,
            border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Zap size={22} color="#10b981" />
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Прогноз на 30 дней</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Выручка</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981' }}>
                  {fmtK(summary.forecast_30d.projected_revenue)} сом
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Транзакций</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#06b6d4' }}>
                  {fmt(summary.forecast_30d.projected_transactions)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ср. чек</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#8b5cf6' }}>
                  {fmt(summary.forecast_30d.projected_avg_check)} сом
                </div>
              </div>
            </div>
          </div>

          {/* Seasonality */}
          {revenue?.seasonality && (
            <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={18} color="#f59e0b" /> Сезонность (по дням недели)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {Object.entries(revenue.seasonality).map(([day, factor]: [string, any]) => {
                  const intensity = Math.min(factor / 1.5, 1);
                  const isHigh = factor > 1.1;
                  const isLow = factor < 0.9;
                  return (
                    <div key={day} style={{
                      textAlign: 'center', padding: '12px 8px', borderRadius: 10,
                      background: isHigh ? '#10b98122' : isLow ? '#ef444422' : 'var(--bg3)',
                      border: `1px solid ${isHigh ? '#10b98133' : isLow ? '#ef444433' : 'var(--border)'}`,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>{day}</div>
                      <div style={{
                        fontSize: 18, fontWeight: 800,
                        color: isHigh ? '#10b981' : isLow ? '#ef4444' : 'var(--text)',
                      }}>
                        {(factor as number).toFixed(2)}x
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Revenue Tab */}
      {tab === 'revenue' && revenue && (
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
            Выручка: факт + прогноз
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
            Прогноз: {fmt(revenue.summary.forecast_total)} сом за {revenue.summary.forecast_days} дней
            (тренд: <span style={{ color: revenue.summary.trend_direction === 'up' ? '#10b981' : '#ef4444' }}>
              {revenue.summary.trend_pct > 0 ? '+' : ''}{revenue.summary.trend_pct}%/мес
            </span>)
          </p>
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revenueChartData}>
                <defs>
                  <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="foreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} tickFormatter={(v: number) => fmtK(v)} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, n: string) => [fmt(v) + ' сом', n === 'revenue' ? 'Выручка' : 'Прогноз']}
                  labelFormatter={(l: string) => l}
                />
                <Area type="monotone" dataKey="confidence_low" stroke="none" fill="#10b98111" />
                <Area type="monotone" dataKey="confidence_high" stroke="none" fill="#10b98111" />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#histGrad)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Customers Tab */}
      {tab === 'customers' && customers && (
        <div style={{ background: 'var(--bg2)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
            Рост клиентской базы
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
            Текущих: {fmt(customers.summary.current_total)} | Прогноз через 30 дней: {fmt(customers.summary.predicted_total)}
            (+ {fmt(customers.summary.growth)})
          </p>
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={customerChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v, 'Новых клиентов']}
                />
                <Bar dataKey="new_customers" radius={[4, 4, 0, 0]}>
                  {customerChartData.map((d: any, i: number) => (
                    <Cell key={i} fill={d.type === 'forecast' ? '#10b981' : '#6366f1'} fillOpacity={d.type === 'forecast' ? 0.6 : 0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
