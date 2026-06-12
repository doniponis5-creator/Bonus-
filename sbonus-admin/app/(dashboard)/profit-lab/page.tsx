'use client';
/**
 * Прибыль Lab — интерактивные калькуляторы решений.
 * Скидка-симулятор · Комбо-калькулятор · ROI лояльности · Автопилот.
 * Все расчёты на реальных данных 1С (цена, себестоимость, продажи).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FlaskConical, Search, Percent, Layers, Zap, Settings as SettingsIcon,
  CheckCircle2, XCircle, TrendingUp, TrendingDown, AlertTriangle,
  ChevronRight, Loader2, Gift, MessageCircle, Plug, Flame, Disc3,
} from 'lucide-react';
import api, { analyticsProAPI, productAPI } from '@/lib/api';

const fmt = (n: any) => Number(n || 0).toLocaleString('ru-RU');
const round10 = (n: number) => Math.round(n / 10) * 10;

// ── Count-up анимация чисел ──
function useCountUp(target: number, dur = 600): number {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      prev.current = target; setV(target); return;
    }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick); else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

function Verdict({ tone, text }: { tone: 'good' | 'ok' | 'bad'; text: string }) {
  const map = {
    good: { c: 'var(--success)', bg: 'rgba(34,197,94,0.1)', Icon: CheckCircle2 },
    ok:   { c: 'var(--warn)',    bg: 'rgba(245,158,11,0.1)', Icon: AlertTriangle },
    bad:  { c: 'var(--danger)',  bg: 'rgba(239,68,68,0.1)', Icon: XCircle },
  }[tone];
  const Icon = map.Icon;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: map.bg, border: `1px solid ${map.c}40`, borderRadius: 10, padding: '12px 14px', marginTop: 14 }}>
      <Icon size={18} color={map.c} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: map.c, lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span className="numeric" style={{ fontWeight: 600, color: accent || 'var(--text)' }}>{value}</span>
    </div>
  );
}

export default function ProfitLabPage() {
  const [loading, setLoading] = useState(true);
  const [margins, setMargins] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [biz, setBiz] = useState<any>(null);
  const [marketing, setMarketing] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);

  // Скидка-симулятор
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState<any>(null);
  const [discount, setDiscount] = useState(15);

  // Розничная наценка (цена в 1С — закупочная): крупная/средняя/мелкая техника
  const [mk, setMk] = useState({ large: 20, medium: 25, small: 30 });

  /** Процент наценки: по категории, иначе по ценовому классу закупки. */
  const markupPct = (purchase: number, category?: string | null): number => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('крупн')) return mk.large;
    if (cat.includes('средн')) return mk.medium;
    if (cat.includes('мелк')) return mk.small;
    if (purchase >= 30000) return mk.large;
    if (purchase >= 10000) return mk.medium;
    return mk.small;
  };

  /**
   * Экономика товара из данных 1С:
   * - если cost_price валидна (0 < cost < price) — данные настоящие: закупка=cost, розница=price
   * - иначе price = ЗАКУПКА → розница = закупка × (1 + наценка), округление до 10 вверх
   */
  const econOf = (m: any) => {
    const price = Number(m?.price || 0);
    const cost = Number(m?.cost_price || 0);
    if (cost > 0 && cost < price) {
      return { purchase: cost, retail: price, pct: Math.round((price / cost - 1) * 100), fromMarkup: false };
    }
    const purchase = price;
    const pct = markupPct(purchase, m?.category);
    const retail = Math.ceil((purchase * (1 + pct / 100)) / 10) * 10;
    return { purchase, retail, pct, fromMarkup: true };
  };

  // Комбо
  const [combo, setCombo] = useState<any>(null);
  const [comboDiscount, setComboDiscount] = useState(8);

  useEffect(() => {
    Promise.allSettled([
      productAPI.margins(90, 100, 'revenue_desc'),
      productAPI.frequentlyBought(90, 3),
      analyticsProAPI.business(30),
      analyticsProAPI.marketing(30),
      api.get('/api/v1/admin/settings'),
    ]).then(([m, fb, b, mk, st]) => {
      if (m.status === 'fulfilled') {
        const items = m.value.data?.items || m.value.data?.products || [];
        setMargins(items);
        if (items.length) setProduct(items[0]);
      }
      if (fb.status === 'fulfilled') {
        const cs = fb.value.data?.combos || fb.value.data?.items || [];
        setCombos(cs);
        if (cs.length) setCombo(cs[0]);
      }
      if (b.status === 'fulfilled') setBiz(b.value.data);
      if (mk.status === 'fulfilled') setMarketing(mk.value.data);
      if (st.status === 'fulfilled') setSettings(st.value.data);
      setLoading(false);
    });
  }, []);

  // ── Расчёт скидки (от РОЗНИЧНОЙ цены, прибыль против ЗАКУПКИ) ──
  const disc = useMemo(() => {
    if (!product) return null;
    const { purchase, retail, pct, fromMarkup } = econOf(product);
    const days = 90;
    const dailySales = Number(product.total_sold || 0) / days;
    const marginUnit = retail - purchase;
    const newPrice = retail * (1 - discount / 100);
    const newMargin = newPrice - purchase;
    const upliftNeeded = newMargin > 0 ? (marginUnit / newMargin - 1) * 100 : Infinity;
    const maxSafeDiscount = retail > 0 ? Math.floor((1 - purchase / retail) * 100) : 0;
    return { purchase, retail, pct, fromMarkup, dailySales, marginUnit, newPrice, newMargin, upliftNeeded, maxSafeDiscount };
  }, [product, discount, mk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Расчёт комбо (розница с наценкой, прибыль против закупки) ──
  const comboCalc = useMemo(() => {
    if (!combo) return null;
    // Экономика каждого товара пары: ищем в margins по имени, иначе из данных комбо
    const econFor = (p: any) => {
      const hit = margins.find((m: any) => m.name === p?.name);
      return econOf(hit || { price: p?.price, cost_price: 0, category: p?.category });
    };
    const ea = econFor(combo.product_a);
    const eb = econFor(combo.product_b);
    const full = ea.retail + eb.retail;            // розница по отдельности
    const purchase = ea.purchase + eb.purchase;    // суммарная закупка
    const bundle = round10(full * (1 - comboDiscount / 100));
    const bundleMargin = bundle - purchase;
    const fullMargin = full - purchase;
    return { full, purchase, bundle, saving: full - bundle, bundleMargin, fullMargin, times: Number(combo.times_together || 0) };
  }, [combo, comboDiscount, margins, mk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ROI лояльности ──
  const burn = Number(biz?.burn_rate || 0); // % выручки, уходящий на бонусы
  const revenue = Number(biz?.revenue || 0);
  const animRevenue = useCountUp(revenue);
  const refRoi = Number(marketing?.referral?.roi || 0);

  // ── Автопилот ──
  const AUTO_ITEMS = settings ? [
    { key: 'ENABLE_WHATSAPP_NOTIFICATIONS', label: 'WhatsApp уведомления', icon: MessageCircle, on: settings.ENABLE_WHATSAPP_NOTIFICATIONS === 'true' },
    { key: 'ENABLE_1C_WEBHOOK', label: 'Интеграция 1С', icon: Plug, on: settings.ENABLE_1C_WEBHOOK === 'true' },
    { key: 'BASKET_BONUS_TIERS', label: 'Порог-бонусы (рост чека)', icon: TrendingUp, on: !!settings.BASKET_BONUS_TIERS && settings.BASKET_BONUS_TIERS !== '[]' },
    { key: 'AUTO_COUPON_ENABLED', label: 'Авто-купоны (чт 11:00)', icon: Gift, on: settings.AUTO_COUPON_ENABLED === 'true' },
    { key: 'POST_PURCHASE_FOLLOWUP_ENABLED', label: 'Забота после покупки', icon: CheckCircle2, on: settings.POST_PURCHASE_FOLLOWUP_ENABLED === 'true' },
    { key: 'CASHIER_BONUS_ENABLED', label: 'Мотивация кассиров', icon: Flame, on: settings.CASHIER_BONUS_ENABLED === 'true' },
  ] : [];
  const offCount = AUTO_ITEMS.filter(i => !i.on).length;

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const isValid = (m: any) => {
      const p = Number(m.price || 0), c = Number(m.cost_price || 0);
      return c > 0 && c < p;
    };
    // Товары с корректной себестоимостью — первыми
    const base = margins
      .filter((m: any) => Number(m.price) > 0)
      .sort((a: any, b: any) => Number(isValid(b)) - Number(isValid(a)));
    if (!q) return base.slice(0, 8);
    return base.filter((m: any) => (m.name || '').toLowerCase().includes(q)).slice(0, 8);
  }, [margins, query]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Loader2 className="spinner" size={28} color="var(--accent)" />
    </div>
  );

  return (
    <div className="page-root" style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div className="icon-tile" style={{ width: 44, height: 44, background: 'var(--accent-dim)' }}>
          <FlaskConical size={22} color="var(--accent)" />
        </div>
        <div>
          <h1 className="h1">Прибыль Lab</h1>
          <p className="caption" style={{ marginTop: 3 }}>Посчитайте решение ДО того, как принять его. Данные: цены и себестоимость из 1С.</p>
        </div>
      </div>

      {/* Две независимые колонки — карточки прижаты друг к другу без дыр */}
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {/* ═══ 1. СКИДКА-СИМУЛЯТОР ═══ */}
        <div className="card fade-up">
          <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Percent size={17} color="var(--accent)" /> Скидка-симулятор
          </h2>
          <p className="caption" style={{ marginBottom: 10 }}>Сколько прибыли останется, если дать скидку — и сколько нужно продать, чтобы не потерять.</p>

          {/* Наценки магазина (цена в 1С = закупочная) */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <span className="caption" style={{ marginRight: 4 }}>Наценка:</span>
            {([
              { key: 'large', label: 'Крупная' },
              { key: 'medium', label: 'Средняя' },
              { key: 'small', label: 'Мелкая' },
            ] as { key: 'large' | 'medium' | 'small'; label: string }[]).map(t => (
              <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)' }}>
                {t.label}
                <input type="number" min={0} max={200} value={mk[t.key]}
                  onChange={e => setMk(prev => ({ ...prev, [t.key]: Number(e.target.value) || 0 }))}
                  style={{ width: 52, padding: '5px 7px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                <span style={{ color: 'var(--text3)' }}>%</span>
              </label>
            ))}
          </div>

          {/* Поиск товара */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={15} color="var(--text3)" style={{ position: 'absolute', left: 12, top: 13 }} />
            <input className="input" style={{ paddingLeft: 36 }} placeholder="Найти товар..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {filteredProducts.map((m: any) => (
              <button key={m.sku} onClick={() => setProduct(m)}
                className={`chip ${product?.sku === m.sku ? 'active' : ''}`}
                style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.name}
              </button>
            ))}
          </div>

          {product && disc && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Скидка</span>
                <span className="numeric" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{discount}%</span>
              </div>
              <input type="range" min={0} max={50} step={1} value={discount}
                onChange={e => setDiscount(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 12 }} />

              <Row label="Закупка (1С)" value={`${fmt(disc.purchase)} сом`} />
              <Row label={`Цена продажи (наценка ${disc.pct}%)`} value={`${fmt(disc.retail)} сом`} accent="var(--text)" />
              <Row label={`Со скидкой ${discount}%`} value={`${fmt(Math.round(disc.newPrice))} сом`} accent="var(--accent)" />
              <Row label="Прибыль с 1 шт" value={`${fmt(Math.round(disc.marginUnit))} → ${fmt(Math.round(disc.newMargin))} сом`}
                accent={disc.newMargin <= 0 ? 'var(--danger)' : disc.newMargin < disc.marginUnit * 0.5 ? 'var(--warn)' : 'var(--success)'} />
              <Row label="Продажи сейчас" value={`~${disc.dailySales.toFixed(1)} шт/день`} />
              {disc.newMargin > 0 && (
                <Row label="Чтобы не потерять прибыль" value={`+${Math.round(disc.upliftNeeded)}% продаж (≈${(disc.dailySales * (1 + disc.upliftNeeded / 100)).toFixed(1)} шт/день)`} />
              )}
              {disc.newMargin <= 0 ? (
                <Verdict tone="bad" text={`Скидка ${discount}% продаёт НИЖЕ закупки (${fmt(disc.purchase)} сом). Максимум безубыточной скидки: ${disc.maxSafeDiscount}%`} />
              ) : disc.upliftNeeded <= 30 ? (
                <Verdict tone="good" text={`Рабочая скидка: достаточно +${Math.round(disc.upliftNeeded)}% продаж — акция с WhatsApp-рассылкой обычно даёт больше. Запас до убытка: скидка ${disc.maxSafeDiscount}%.`} />
              ) : disc.upliftNeeded <= 70 ? (
                <Verdict tone="ok" text={`Осторожно: нужно +${Math.round(disc.upliftNeeded)}% продаж. Подойдёт для распродажи неликвида, но не для хитов.`} />
              ) : (
                <Verdict tone="bad" text={`Невыгодно: нужно +${Math.round(disc.upliftNeeded)}% продаж, чтобы выйти в ноль. Попробуйте меньшую скидку или бонусы вместо скидки.`} />
              )}
              {disc.fromMarkup && (
                <p className="caption" style={{ marginTop: 8, lineHeight: 1.45 }}>
                  Цена продажи рассчитана: закупка из 1С + наценка {disc.pct}% (категория/класс товара). Наценки настраиваются выше.
                </p>
              )}
            </>
          )}
        </div>

        {/* ═══ 2. КОМБО-КАЛЬКУЛЯТОР ═══ */}
        <div className="card fade-up" style={{ animationDelay: '60ms' }}>
          <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={17} color="var(--info)" /> Комбо-калькулятор
          </h2>
          <p className="caption" style={{ marginBottom: 12 }}>Пары, которые УЖЕ покупают вместе (по чекам 1С) — упакуйте в комплект.</p>

          {combos.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div className="icon-tile">
                <Layers size={17} color="var(--text3)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Собираем данные о парных покупках</div>
                <div className="caption" style={{ marginTop: 2, lineHeight: 1.45 }}>
                  Нужно минимум 3 чека, где два товара куплены вместе. Данные копятся автоматически из чеков 1С — загляните через пару недель.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {combos.slice(0, 4).map((c: any, i: number) => (
                  <button key={i} onClick={() => setCombo(c)}
                    style={{
                      textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                      background: combo === c ? 'var(--accent-dim)' : 'var(--bg2)',
                      border: `1px solid ${combo === c ? 'var(--accent-border)' : 'var(--border)'}`,
                      borderRadius: 10, padding: '10px 12px',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {c.product_a?.name} + {c.product_b?.name}
                    </div>
                    <div className="caption" style={{ marginTop: 2 }}>вместе {c.times_together} раз за 90 дней</div>
                  </button>
                ))}
              </div>

              {combo && comboCalc && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Скидка на комплект</span>
                    <span className="numeric" style={{ fontSize: 18, fontWeight: 700, color: 'var(--info)' }}>{comboDiscount}%</span>
                  </div>
                  <input type="range" min={0} max={20} step={1} value={comboDiscount}
                    onChange={e => setComboDiscount(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 12 }} />

                  <Row label="Закупка пары (1С)" value={`${fmt(Math.round(comboCalc.purchase))} сом`} />
                  <Row label="Розница по отдельности" value={`${fmt(Math.round(comboCalc.full))} сом`} />
                  <Row label="Цена комплекта" value={`${fmt(comboCalc.bundle)} сом`} accent="var(--accent)" />
                  <Row label="Клиент экономит" value={`${fmt(Math.round(comboCalc.saving))} сом`} accent="var(--success)" />
                  <Row label="Ваша прибыль с комплекта" value={`${fmt(Math.round(comboCalc.fullMargin))} → ${fmt(Math.round(comboCalc.bundleMargin))} сом`}
                    accent={comboCalc.bundleMargin <= 0 ? 'var(--danger)' : 'var(--success)'} />
                  <Verdict
                    tone={comboCalc.bundleMargin <= 0 ? 'bad' : 'good'}
                    text={comboCalc.bundleMargin <= 0
                      ? 'Комплект в убыток — уменьшите скидку.'
                      : `Спрос уже есть: ${comboCalc.times} совместных покупок. Каждая продажа комплекта = +${fmt(Math.round(comboCalc.bundleMargin))} сом чистой прибыли и +${fmt(comboCalc.bundle)} сом к чеку.`}
                  />
                </>
              )}
            </>
          )}
        </div>

        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {/* ═══ 3. ЦЕНА ЛОЯЛЬНОСТИ ═══ */}
        <div className="card fade-up" style={{ animationDelay: '120ms' }}>
          <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={17} color="var(--warn)" /> Сколько стоит ваша бонусная программа
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 14px' }}>
              <div className="caption">Выручка (30 дн)</div>
              <div className="numeric" style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{fmt(animRevenue)} <span style={{ fontSize: 12, color: 'var(--text3)' }}>сом</span></div>
            </div>
            <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 14px' }}>
              <div className="caption">Бонусы от выручки</div>
              <div className="numeric" style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: burn > 7 ? 'var(--danger)' : burn > 3 ? 'var(--warn)' : 'var(--success)' }}>{burn.toFixed(1)}%</div>
            </div>
          </div>
          {marketing?.referral && (
            Number(marketing.referral.revenue_from_referred || 0) > 0 ? (
              <Row label="Реферальная программа ROI" value={`${refRoi > 0 ? '+' : ''}${fmt(refRoi)}%`} accent={refRoi >= 0 ? 'var(--success)' : 'var(--danger)'} />
            ) : (
              <Row label="Реферальная программа" value="приглашённые ещё не покупали" accent="var(--text2)" />
            )
          )}
          <p className="caption" style={{ marginTop: 8, lineHeight: 1.5 }}>
            В «бонусы от выручки» входят и подарочные бонусы (колесо, кампании, welcome, дни рождения) —
            при активных акциях процент временно выше реального кешбэка.
          </p>
          <Verdict
            tone={burn > 12 ? 'bad' : burn > 5 ? 'ok' : 'good'}
            text={burn > 12
              ? `Бонусы составляют ${burn.toFixed(1)}% выручки — много даже с учётом акций. Проверьте проценты уровней, щедрость колеса и суммы кампаний.`
              : burn > 5
              ? `${burn.toFixed(1)}% выручки на бонусы — выше базового кешбэка из-за акций и подарков. Приемлемо, но следите за динамикой.`
              : `Программа стоит ${burn.toFixed(1)}% выручки — здоровый уровень. Есть запас для более щедрых акций.`}
          />
        </div>

        {/* ═══ 4. АВТОПИЛОТ ═══ */}
        <div className="card fade-up" style={{ animationDelay: '180ms' }}>
          <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Disc3 size={17} color="var(--success)" /> Автопилот
            {offCount > 0 && <span className="badge badge-yellow">{offCount} выключено</span>}
          </h2>
          <p className="caption" style={{ marginBottom: 8 }}>Автоматизации, которые работают без вас. Выключенные = упущенные деньги.</p>
          {AUTO_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="icon-tile" style={{ width: 32, height: 32, background: item.on ? 'rgba(34,197,94,0.1)' : 'var(--bg2)' }}>
                  <Icon size={15} color={item.on ? 'var(--success)' : 'var(--text3)'} />
                </div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: item.on ? 'var(--text)' : 'var(--text2)' }}>{item.label}</span>
                <span className={`badge ${item.on ? 'badge-green' : 'badge-gray'}`}>{item.on ? 'Работает' : 'Выкл'}</span>
              </div>
            );
          })}
          <Link href="/settings" className="btn btn-secondary" style={{ marginTop: 14, width: '100%' }}>
            <SettingsIcon size={15} /> Настроить <ChevronRight size={14} />
          </Link>
        </div>
        </div>
      </div>

      <p className="caption" style={{ textAlign: 'center', padding: '16px 0 8px' }}>
        Все расчёты — из реальных данных 1С (цены, себестоимость, чеки за 90 дней). Обновляется при открытии.
      </p>
    </div>
  );
}
