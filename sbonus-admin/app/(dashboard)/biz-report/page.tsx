'use client';
/**
 * Бизнес-отчёт — исполнительная сводка владельца.
 * Одна страница = что произошло + что КОНКРЕТНО сделать на этой неделе.
 * Использует только существующие API (1С-данные: товары, чеки, клиенты).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Printer, ShoppingCart, PackageX, Flame,
  Users, Sparkles, ChevronRight, AlertTriangle, Package, Trophy,
  Megaphone, Layers, RefreshCw, Loader2, Wallet, Receipt, UserCheck,
} from 'lucide-react';
import { analyticsProAPI, productAPI } from '@/lib/api';

const fmt = (n: any) => Number(n || 0).toLocaleString('ru-RU');

// ── Дельта к прошлому периоду ──
function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (!isFinite(pct) || pct === 0) return <span className="caption">без изменений</span>;
  const up = pct > 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: up ? 'var(--success)' : 'var(--danger)' }}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? '+' : ''}{pct}%
    </span>
  );
}

function Stat({ label, value, unit, cur, prev, icon: Icon }: any) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="stat-label" style={{ marginBottom: 0 }}>{label}</span>
        <Icon size={15} color="var(--text3)" />
      </div>
      <div className="stat-value">{value}{unit && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text3)', marginLeft: 5 }}>{unit}</span>}</div>
      <div style={{ marginTop: 4 }}><Delta cur={cur} prev={prev} /></div>
    </div>
  );
}

// ── Карточка действия недели ──
function ActionRow({ icon: Icon, tone, title, reason, impact, href, cta }: any) {
  const tones: Record<string, string> = {
    danger: 'var(--danger)', warn: 'var(--warn)', success: 'var(--success)', accent: 'var(--accent)', info: 'var(--info)',
  };
  const c = tones[tone] || 'var(--accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="icon-tile" style={{ background: 'var(--bg2)' }}>
        <Icon size={17} color={c} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div className="caption" style={{ marginTop: 2 }}>{reason}</div>
        {impact && <div style={{ fontSize: 12, fontWeight: 600, color: c, marginTop: 2 }}>{impact}</div>}
      </div>
      {href && (
        <Link href={href} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: 12, flexShrink: 0 }}>
          {cta || 'Открыть'} <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

export default function BizReportPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [biz, setBiz] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [deadStock, setDeadStock] = useState<any>(null);
  const [topSellers, setTopSellers] = useState<any[]>([]);
  const [recos, setRecos] = useState<any>(null);
  const [rfm, setRfm] = useState<any>(null);

  const load = (d = days) => {
    setLoading(true);
    Promise.allSettled([
      analyticsProAPI.business(d),
      productAPI.summary(),
      productAPI.lowStock(true),
      productAPI.deadStock(d),
      productAPI.topSellers(d, 5),
      productAPI.smartRecommendations(90),
      analyticsProAPI.rfm(),
    ]).then(([b, s, ls, ds, ts, rc, rf]) => {
      if (b.status === 'fulfilled') setBiz(b.value.data);
      if (s.status === 'fulfilled') setSummary(s.value.data);
      if (ls.status === 'fulfilled') setLowStock(ls.value.data?.alerts || ls.value.data?.items || []);
      if (ds.status === 'fulfilled') setDeadStock(ds.value.data);
      if (ts.status === 'fulfilled') setTopSellers(ts.value.data?.items || ts.value.data?.products || []);
      if (rc.status === 'fulfilled') setRecos(rc.value.data);
      if (rf.status === 'fulfilled') setRfm(rf.value.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(days); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── План действий недели (генерируется из данных) ──
  const actions = useMemo(() => {
    const out: any[] = [];
    const critical = lowStock.filter((a: any) => (a.urgency === 'critical') || (a.days_until_stockout != null && a.days_until_stockout <= 3));
    if (critical.length > 0) {
      out.push({
        icon: ShoppingCart, tone: 'danger',
        title: `Закупить срочно: ${critical.length} товар(ов) на исходе`,
        reason: critical.slice(0, 3).map((a: any) => a.name).filter(Boolean).join(', ') + (critical.length > 3 ? '…' : ''),
        impact: 'Пустая полка = потерянные продажи каждый день',
        href: '/product-analytics', cta: 'Список',
      });
    }
    const frozen = Number(deadStock?.frozen_capital?.total ?? deadStock?.frozen_capital ?? 0);
    const deadItems = deadStock?.items || deadStock?.products || [];
    if (frozen > 0 || deadItems.length > 0) {
      out.push({
        icon: PackageX, tone: 'warn',
        title: `Распродажа: разморозить ${fmt(frozen)} сом`,
        reason: `${deadItems.length || '—'} товаров без продаж ${days}+ дней — скидка 15-30% вернёт деньги в оборот`,
        impact: `+${fmt(Math.round(frozen * 0.6))} сом живых денег (при распродаже 60%)`,
        href: '/product-analytics', cta: 'Мёртвый товар',
      });
    }
    const seg = rfm?.segments || {};
    const winback = (seg.at_risk?.count || 0) + (seg.sleeping?.count || 0);
    if (winback > 0) {
      const avgRev = Number(seg.at_risk?.avg_revenue || seg.sleeping?.avg_revenue || 0);
      out.push({
        icon: Megaphone, tone: 'accent',
        title: `Win-back кампания: ${winback} клиентов уходят`,
        reason: 'Сегменты «В зоне риска» + «Спящие» — бонус 100-200 сом возвращает 10-20% из них',
        impact: avgRev ? `Потенциал: ~${fmt(Math.round(winback * 0.15 * avgRev))} сом выручки` : undefined,
        href: '/smart-campaigns', cta: 'Запустить',
      });
    }
    const combos = (recos?.combos || recos?.recommendations || []).filter((r: any) => r.type === 'combo').slice(0, 1);
    combos.forEach((c: any) => {
      out.push({
        icon: Layers, tone: 'info',
        title: `Комплект: ${c.product_a?.name} + ${c.product_b?.name}`,
        reason: c.reason || `Покупают вместе ${c.times_together} раз`,
        impact: c.potential_revenue ? `+${fmt(c.potential_revenue)} сом доп. выручки` : undefined,
        href: '/product-analytics', cta: 'Связки',
      });
    });
    if (seg.champions?.count > 0) {
      out.push({
        icon: Trophy, tone: 'success',
        title: `Поблагодарить чемпионов: ${seg.champions.count} VIP-клиентов`,
        reason: `Дают максимум выручки (ср. ${fmt(seg.champions.avg_revenue)} сом) — личное «спасибо» + бонус удерживает их навсегда`,
        href: '/smart-campaigns', cta: 'Кампания',
      });
    }
    return out;
  }, [lowStock, deadStock, rfm, recos, days]);

  // ── RFM сегменты для блока «Клиенты» ──
  const RFM_META: Record<string, { label: string; tone: string; idea: string }> = {
    champions:       { label: 'Чемпионы',        tone: 'var(--success)', idea: 'VIP-бонус + ранний доступ к акциям' },
    loyal:           { label: 'Лояльные',         tone: 'var(--info)',    idea: 'Порог-бонус: подталкивать к большему чеку' },
    potential_loyal: { label: 'Потенциальные',    tone: 'var(--accent)',  idea: 'Купон на 3-ю покупку' },
    new_customers:   { label: 'Новички',          tone: 'var(--text2)',   idea: 'Welcome-серия + знакомство с бонусами' },
    sleeping:        { label: 'Спящие',           tone: 'var(--warn)',    idea: 'Comeback: «мы скучаем» + 100 сом' },
    at_risk:         { label: 'В зоне риска',     tone: 'var(--danger)',  idea: 'Win-back: персональный купон сейчас' },
    lost:            { label: 'Потерянные',       tone: 'var(--text3)',   idea: 'Последний шанс: сильное предложение' },
  };

  if (loading && !biz) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Loader2 className="spinner" size={28} color="var(--accent)" />
    </div>
  );

  return (
    <div className="page-root" style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="h1">Бизнес-отчёт</h1>
          <p className="caption" style={{ marginTop: 3 }}>Сводка по данным 1С + план действий на неделю</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="seg period-selector">
            {[7, 30, 90].map(d => (
              <button key={d} className={`seg-item ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>{d} дн</button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={() => load(days)} style={{ padding: '9px 12px' }} aria-label="Обновить">
            <RefreshCw size={15} />
          </button>
          <button className="btn btn-secondary no-print" onClick={() => window.print()} style={{ padding: '9px 14px' }}>
            <Printer size={15} /> Печать
          </button>
        </div>
      </div>

      {/* ── 1. Сводка ── */}
      {biz && (
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <Stat label="Выручка" value={fmt(biz.revenue)} unit="сом" cur={biz.revenue} prev={biz.prev_revenue} icon={Wallet} />
          <Stat label="Чеков" value={fmt(biz.tx_count)} cur={biz.tx_count} prev={biz.prev_tx_count} icon={Receipt} />
          <Stat label="Средний чек" value={fmt(biz.avg_check)} unit="сом" cur={biz.avg_check} prev={biz.prev_avg_check} icon={TrendingUp} />
          <Stat label="Активных покупателей" value={fmt(biz.active_buyers)} cur={biz.active_buyers} prev={biz.prev_active_buyers} icon={UserCheck} />
        </div>
      )}

      {/* ── 2. План действий недели ── */}
      <div className="card card-accent" style={{ marginBottom: 16 }}>
        <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sparkles size={17} color="var(--accent)" /> План действий на неделю
        </h2>
        <p className="caption" style={{ marginBottom: 6 }}>Сформирован автоматически из ваших данных — по приоритету</p>
        {actions.length === 0 ? (
          <p style={{ color: 'var(--text2)', fontSize: 14, padding: '12px 0' }}>Критичных действий нет — система не нашла проблем. Отличная неделя.</p>
        ) : actions.map((a, i) => <ActionRow key={i} {...a} />)}
      </div>

      {/* ── 3. Товары ── */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {/* Хиты */}
        <div className="card">
          <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <Trophy size={15} color="var(--accent)" /> Хиты продаж
          </h3>
          {topSellers.length === 0 ? <p className="caption">Нет данных</p> : topSellers.slice(0, 5).map((p: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {p.name}</span>
              <span className="numeric" style={{ fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>{fmt(p.revenue ?? p.total_revenue)} сом</span>
            </div>
          ))}
          <p className="caption" style={{ marginTop: 10 }}>Не допускайте их отсутствия на складе — это ядро выручки.</p>
        </div>

        {/* Закупить */}
        <div className="card">
          <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <ShoppingCart size={15} color="var(--danger)" /> Закупить
          </h3>
          {lowStock.length === 0 ? <p className="caption">Все запасы в норме</p> : lowStock.slice(0, 5).map((a: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span style={{ flexShrink: 0 }}>
                {a.days_until_stockout != null
                  ? <span className={`badge ${a.days_until_stockout <= 3 ? 'badge-red' : 'badge-yellow'}`}>{a.days_until_stockout} дн</span>
                  : <span className="badge badge-yellow">{fmt(a.current_stock)} шт</span>}
              </span>
            </div>
          ))}
          {lowStock.length > 5 && <Link href="/product-analytics" className="caption" style={{ display: 'block', marginTop: 10, color: 'var(--accent)' }}>Ещё {lowStock.length - 5} → все товары</Link>}
        </div>

        {/* Заморожено */}
        <div className="card">
          <h3 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <PackageX size={15} color="var(--warn)" /> Заморожено денег
          </h3>
          <div className="numeric" style={{ fontSize: 24, fontWeight: 700, color: 'var(--warn)', marginBottom: 4 }}>
            {fmt(deadStock?.frozen_capital?.total ?? deadStock?.frozen_capital ?? 0)} <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>сом</span>
          </div>
          <p className="caption" style={{ marginBottom: 10 }}>в товарах без продаж {days}+ дней</p>
          {(deadStock?.items || deadStock?.products || []).slice(0, 4).map((p: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span className="caption" style={{ flexShrink: 0 }}>{p.days_without_sale} дн</span>
            </div>
          ))}
          <p className="caption" style={{ marginTop: 10 }}>Скидка 20-30% лучше, чем мёртвый склад.</p>
        </div>
      </div>

      {/* ── 4. Клиенты (RFM) + готовые кампании ── */}
      {rfm?.segments && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={17} color="var(--text2)" /> Клиентская база — что запустить
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {Object.entries(RFM_META).map(([key, meta]) => {
              const s = rfm.segments[key];
              if (!s || !s.count) return null;
              return (
                <div key={key} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: meta.tone }}>{meta.label}</span>
                    <span className="numeric" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(s.count)}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, s.percent)}%`, background: meta.tone, borderRadius: 999 }} />
                  </div>
                  <div className="caption" style={{ lineHeight: 1.45 }}>{meta.idea}</div>
                </div>
              );
            })}
          </div>
          <Link href="/smart-campaigns" className="btn btn-primary no-print" style={{ marginTop: 14, width: 'auto', padding: '10px 18px' }}>
            <Megaphone size={15} /> Запустить кампанию по сегменту
          </Link>
        </div>
      )}

      {/* ── 5. Умные рекомендации системы ── */}
      {(recos?.recommendations?.length > 0 || recos?.combos?.length > 0) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={17} color="var(--violet)" /> Рекомендации системы
          </h2>
          {[...(recos.recommendations || []), ...(recos.combos || [])].slice(0, 8).map((r: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
              <span className={`badge ${r.priority === 'high' ? 'badge-red' : r.priority === 'medium' ? 'badge-yellow' : 'badge-gray'}`} style={{ flexShrink: 0, marginTop: 1 }}>
                {r.priority === 'high' ? 'Важно' : r.priority === 'medium' ? 'Средне' : 'Можно'}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.action}</div>
                {r.reason && <div className="caption" style={{ marginTop: 2 }}>{r.reason}</div>}
                {r.potential_revenue ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)', marginTop: 2 }}>Потенциал: +{fmt(r.potential_revenue)} сом</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Сноска */}
      <p className="caption" style={{ textAlign: 'center', paddingBottom: 12 }}>
        Отчёт строится из данных 1С и бонусной системы автоматически. Обновляется при каждом открытии.
      </p>

      <style>{`
        @media print {
          .no-print, aside, nav { display: none !important; }
          body { background: #fff !important; color: #111 !important; }
          .card, .stat-card { border-color: #ddd !important; background: #fff !important; break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
