'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '@/lib/api';
import {
  FileSearch, Loader2, ChevronDown, ChevronRight, Filter,
  Shield, UserCog, CreditCard, Gift, Star, Settings,
  Trash2, RotateCcw, Upload, RefreshCw, Globe, Clock,
  User, Briefcase, Store, Trophy, Tag, Ticket, Disc3, Flame,
} from 'lucide-react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface LogItem {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════
// ACTION CONFIG — colors, labels, icons
// ═══════════════════════════════════════════

const ACTION_META: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  tier_create:          { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Уровень создан',       icon: Trophy },
  tier_update:          { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Уровень обновлён',     icon: Trophy },
  promo_create:         { color: '#f472b6', bg: 'rgba(244,114,182,0.12)', label: 'Промокод создан',      icon: Ticket },
  branch_create:        { color: '#34d399', bg: 'rgba(52,211,153,0.12)', label: 'Филиал создан',         icon: Store },
  cashier_create:       { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: 'Кассир создан',         icon: Briefcase },
  cashier_update:       { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: 'Кассир обновлён',       icon: Briefcase },
  bulk_bonus:           { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: 'Массовый бонус',        icon: Gift },
  customer_update:      { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', label: 'Клиент обновлён',       icon: User },
  admin_earn:           { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Начисление',            icon: CreditCard },
  admin_spend:          { color: '#f87171', bg: 'rgba(248,113,113,0.12)',label: 'Списание',              icon: CreditCard },
  gift_spin:            { color: '#e879f9', bg: 'rgba(232,121,249,0.12)',label: 'Подарочный спин',       icon: Disc3 },
  transaction_reverse:  { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',label: 'Возврат транзакции',     icon: RotateCcw },
  settings_update:      { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)',label: 'Настройки обновлены',   icon: Settings },
  coupon_create:        { color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)', label: 'Купон создан',          icon: Tag },
  coupon_delete:        { color: '#f87171', bg: 'rgba(248,113,113,0.12)',label: 'Купон удалён',          icon: Trash2 },
  review_approve:       { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Отзыв одобрен',         icon: Star },
  review_reject:        { color: '#f87171', bg: 'rgba(248,113,113,0.12)',label: 'Отзыв отклонён',        icon: Star },
  wheel_config_update:  { color: '#c084fc', bg: 'rgba(192,132,252,0.12)',label: 'Колесо обновлено',      icon: Disc3 },
  wheel_config_reset:   { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',label: 'Колесо сброшено',       icon: Disc3 },
  customer_import:      { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', label: 'Импорт клиентов',       icon: Upload },
  cashier_bonus_config: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: 'Конфиг мотивации',      icon: Flame },
};

const ENTITY_TYPES = [
  'tier', 'promo_code', 'branch', 'cashier', 'customer',
  'bonus', 'transaction', 'settings', 'coupon', 'review',
  'wheel', 'import', 'cashier_bonus',
];

function getActionMeta(action: string) {
  if (ACTION_META[action]) return ACTION_META[action];
  // fallback
  return { color: '#8899aa', bg: 'rgba(136,153,170,0.1)', label: action, icon: Shield };
}

// ═══════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════

function ActionBadge({ action }: { action: string }) {
  const meta = getActionMeta(action);
  const Icon = meta.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: meta.bg, color: meta.color,
      padding: '5px 12px', borderRadius: 100,
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      border: `1px solid ${meta.color}20`,
    }}>
      <Icon size={13} />
      {meta.label}
    </span>
  );
}

function DetailsPanel({ details }: { details: any }) {
  if (!details || Object.keys(details).length === 0) return <span style={{ color: '#556677' }}>—</span>;

  return (
    <div style={{
      background: '#0a0f18', border: '1px solid #1c2a3a', borderRadius: 10,
      padding: '12px 16px', marginTop: 8, fontSize: 12, fontFamily: 'monospace',
      color: '#8899aa', lineHeight: 1.7, maxHeight: 200, overflowY: 'auto',
    }}>
      {Object.entries(details).map(([k, v]) => (
        <div key={k}>
          <span style={{ color: '#60a5fa' }}>{k}</span>
          <span style={{ color: '#556677' }}>: </span>
          <span style={{ color: '#e2eaf6' }}>
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function FilterDropdown({
  label, value, options, onChange,
}: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 10,
          padding: '9px 36px 9px 14px', fontSize: 13, color: value ? '#e2eaf6' : '#556677',
          cursor: 'pointer', fontWeight: 500, minWidth: 180,
          outline: 'none', transition: 'border-color 0.15s',
        }}
        onFocus={(e) => (e.target.style.borderColor = '#ffd60a')}
        onBlur={(e) => (e.target.style.borderColor = '#1c2a3a')}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        color: '#556677', pointerEvents: 'none',
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function AuditLogsPage() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');

  const perPage = 50;

  const load = useCallback(async (p: number, action?: string, entity?: string) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.auditLogs(p, action || undefined, entity || undefined);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, filterAction, filterEntity);
  }, [page, filterAction, filterEntity, load]);

  const totalPages = Math.ceil(total / perPage);

  const handleFilterAction = (v: string) => { setFilterAction(v); setPage(1); };
  const handleFilterEntity = (v: string) => { setFilterEntity(v); setPage(1); };
  const resetFilters = () => { setFilterAction(''); setFilterEntity(''); setPage(1); };

  const actionOptions = Object.entries(ACTION_META).map(([k, v]) => ({ value: k, label: v.label }));
  const entityOptions = ENTITY_TYPES.map((e) => ({ value: e, label: e }));

  const hasFilters = filterAction || filterEntity;

  // ── Pagination range ──
  const getPageRange = () => {
    const range: number[] = [];
    const delta = 2;
    const start = Math.max(1, page - delta);
    const end = Math.min(totalPages, page + delta);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #ffd60a 0%, #ff9500 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileSearch size={20} color="#000" />
            </div>
            Журнал аудита
          </h1>
          <div style={{
            background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 10,
            padding: '8px 16px', fontSize: 13, color: '#8899aa',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Clock size={14} />
            Всего: <strong style={{ color: '#e2eaf6' }}>{total.toLocaleString('ru-RU')}</strong> записей
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#556677', fontSize: 13, fontWeight: 600 }}>
          <Filter size={14} /> Фильтры:
        </div>
        <FilterDropdown
          label="Все действия"
          value={filterAction}
          options={actionOptions}
          onChange={handleFilterAction}
        />
        <FilterDropdown
          label="Все сущности"
          value={filterEntity}
          options={entityOptions}
          onChange={handleFilterEntity}
        />
        {hasFilters && (
          <button
            onClick={resetFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(248,113,113,0.1)', color: '#f87171',
              border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8,
              padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RotateCcw size={13} /> Сбросить
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{
        background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16,
        overflow: 'hidden', overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '240px 130px 1fr 140px 130px 50px', minWidth: 900,
          padding: '14px 20px',
          borderBottom: '1px solid #1c2a3a',
          background: '#080c14',
        }}>
          {['Действие', 'Сущность', 'Пользователь', 'IP-адрес', 'Дата', ''].map((h) => (
            <div key={h} style={{ color: '#556677', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {h}
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding: 48, textAlign: 'center', color: '#556677' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: 8 }} />
            Загрузка...
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Empty */}
        {!loading && items.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: '#556677', fontSize: 14 }}>
            <Shield size={32} style={{ marginBottom: 8, opacity: 0.4 }} /><br />
            Записей не найдено
          </div>
        )}

        {/* Rows */}
        {!loading && items.map((l) => {
          const isExpanded = expandedId === l.id;
          const hasDetails = l.details && Object.keys(l.details).length > 0;
          const meta = getActionMeta(l.action);
          const date = new Date(l.created_at);
          const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
          const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

          return (
            <div key={l.id}>
              <div
                onClick={() => hasDetails && setExpandedId(isExpanded ? null : l.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '240px 130px 1fr 140px 130px 50px', minWidth: 900,
                  padding: '14px 20px',
                  borderBottom: '1px solid #111827',
                  cursor: hasDetails ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  background: isExpanded ? '#111827' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = '#0f1520'; }}
                onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Action */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ActionBadge action={l.action} />
                </div>

                {/* Entity */}
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: '#8899aa' }}>
                  {l.entity_type || '—'}
                </div>

                {/* User */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: l.user_name ? 'rgba(96,165,250,0.12)' : 'rgba(136,153,170,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <UserCog size={14} color={l.user_name ? '#60a5fa' : '#556677'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: l.user_name ? '#e2eaf6' : '#556677' }}>
                      {l.user_name || 'Система'}
                    </div>
                    {l.entity_id && (
                      <div style={{ fontSize: 11, color: '#445566', fontFamily: 'monospace' }}>
                        ID: {l.entity_id.slice(0, 8)}…
                      </div>
                    )}
                  </div>
                </div>

                {/* IP */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#556677', fontFamily: 'monospace' }}>
                  <Globe size={12} />
                  {l.ip_address || '—'}
                </div>

                {/* Date */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#8899aa', fontWeight: 500 }}>{dateStr}</div>
                    <div style={{ fontSize: 11, color: '#445566' }}>{timeStr}</div>
                  </div>
                </div>

                {/* Expand */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {hasDetails && (
                    <div style={{
                      width: 26, height: 26, borderRadius: 6,
                      background: isExpanded ? 'rgba(255,214,10,0.12)' : 'rgba(136,153,170,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {isExpanded
                        ? <ChevronDown size={14} color="#ffd60a" />
                        : <ChevronRight size={14} color="#556677" />
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && hasDetails && (
                <div style={{
                  padding: '0 20px 16px 20px',
                  background: '#111827',
                  borderBottom: '1px solid #1c2a3a',
                }}>
                  <DetailsPanel details={l.details} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4,
          marginTop: 24,
        }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(1)}
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid #1c2a3a', color: page <= 1 ? '#333' : '#8899aa',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            «
          </button>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid #1c2a3a', color: page <= 1 ? '#333' : '#8899aa',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ‹
          </button>

          {getPageRange().map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: p === page ? 700 : 500,
                background: p === page ? 'rgba(255,214,10,0.12)' : 'transparent',
                border: p === page ? '1px solid rgba(255,214,10,0.3)' : '1px solid transparent',
                color: p === page ? '#ffd60a' : '#8899aa',
                cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ))}

          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid #1c2a3a', color: page >= totalPages ? '#333' : '#8899aa',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            ›
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid #1c2a3a', color: page >= totalPages ? '#333' : '#8899aa',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}
