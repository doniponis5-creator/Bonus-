'use client';

import { useEffect, useState } from 'react';
import { customerAPI } from '@/lib/api';

interface Coupon {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  bonus_amount: number;
  min_purchase: number;
  is_personal: boolean;
  expires_at?: string | null;
}

export default function MyCoupons({ onBalanceChange }: { onBalanceChange?: () => void }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; amount: number } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await customerAPI.coupons();
      setCoupons(data.coupons || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  const activate = async (code: string) => {
    if (activating) return;
    setActivating(code);
    setResult(null);
    try {
      const { data } = await customerAPI.activateCoupon(code);
      setResult({ message: data.message, amount: data.bonus_amount });
      // Remove activated coupon from list
      setCoupons(prev => prev.filter(c => c.code !== code));
      onBalanceChange?.();
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.response?.data?.detail || 'Ошибка активации';
      setResult({ message: msg, amount: 0 });
    } finally {
      setActivating(null);
    }
  };

  const formatExpiry = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Истёк';
    if (days === 1) return 'Осталось 1 день';
    if (days <= 7) return `Осталось ${days} дней`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  return (
    <div style={{ padding: '20px 0' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        🎟 Мои купоны
      </h2>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px' }}>
        Активируйте купон и получите бонус на счёт
      </p>

      {/* Result toast */}
      {result && (
        <div style={{
          padding: '14px 18px', borderRadius: 12, marginBottom: 16,
          background: result.amount > 0
            ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))'
            : 'rgba(239,68,68,0.1)',
          border: result.amount > 0
            ? '1px solid rgba(34,197,94,0.3)'
            : '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, color: result.amount > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
            {result.message}
          </span>
          <button onClick={() => setResult(null)} style={{
            background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', padding: '0 0 0 12px',
          }}>×</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8899aa' }}>Загрузка...</div>
      ) : coupons.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 16,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
            Нет доступных купонов
          </div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Следите за акциями — новые купоны появляются регулярно!
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {coupons.map((c) => (
            <div key={c.id} style={{
              borderRadius: 14, overflow: 'hidden',
              background: 'rgba(255,255,255,0.04)',
              border: c.is_personal
                ? '1px solid rgba(255,230,0,0.25)'
                : '1px solid rgba(255,255,255,0.06)',
              transition: 'all 0.2s',
            }}>
              {/* Header */}
              <div style={{
                padding: '14px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#e2eaf6' }}>
                      {c.title}
                    </span>
                    {c.is_personal && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: 'rgba(255,230,0,0.15)', color: '#FFE600',
                      }}>Для вас</span>
                    )}
                  </div>
                  {c.description && (
                    <div style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.4 }}>
                      {c.description}
                    </div>
                  )}
                </div>
                <div style={{
                  textAlign: 'right', flexShrink: 0, marginLeft: 12,
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>
                    +{c.bonus_amount.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: '#8899aa' }}>KGS</div>
                </div>
              </div>

              {/* Info row */}
              <div style={{
                padding: '0 16px 10px', display: 'flex', gap: 12, flexWrap: 'wrap',
              }}>
                {c.min_purchase > 0 && (
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    от {c.min_purchase.toLocaleString()} KGS
                  </span>
                )}
                {c.expires_at && (
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: new Date(c.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000
                      ? '#f59e0b' : '#64748b',
                  }}>
                    ⏳ {formatExpiry(c.expires_at)}
                  </span>
                )}
              </div>

              {/* Dashed separator + activate */}
              <div style={{
                borderTop: '1px dashed rgba(255,255,255,0.08)',
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <code style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
                  color: '#FFE600', background: 'rgba(255,230,0,0.08)',
                  padding: '4px 10px', borderRadius: 6,
                }}>
                  {c.code}
                </code>
                <button
                  onClick={() => activate(c.code)}
                  disabled={activating === c.code}
                  style={{
                    padding: '10px 24px', borderRadius: 10, border: 'none',
                    fontSize: 13, fontWeight: 700, cursor: activating === c.code ? 'wait' : 'pointer',
                    background: activating === c.code
                      ? 'rgba(255,230,0,0.3)'
                      : 'linear-gradient(135deg, #FFE600, #f59e0b)',
                    color: '#0a0f1a',
                    transition: 'all 0.2s',
                    opacity: activating === c.code ? 0.6 : 1,
                  }}
                >
                  {activating === c.code ? 'Активация...' : 'Активировать'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
