'use client';

import { useEffect, useState } from 'react';
import { Ticket, Clock, X } from 'lucide-react';
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
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.022em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Ticket size={20} color="var(--accent)" /> Мои купоны
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px' }}>
        Активируйте купон — бонус будет начислен на счёт
      </p>

      {/* Result banner */}
      {result && (
        <div style={{
          padding: '14px 16px', borderRadius: 12, marginBottom: 16,
          background: 'var(--bg-2)',
          border: '1px solid var(--border-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, color: result.amount > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            {result.message}
          </span>
          <button onClick={() => setResult(null)} aria-label="Закрыть" style={{
            background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 0 0 12px', display: 'flex',
          }}><X size={17} /></button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-2)', fontSize: 14 }}>Загрузка...</div>
      ) : coupons.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
        }}>
          <div style={{ marginBottom: 12 }}><Ticket size={32} color="var(--text-3)" /></div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
            Нет доступных купонов
          </div>
          <div className="caption">
            Новые купоны появляются в рамках акций
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {coupons.map((c) => (
            <div key={c.id} style={{
              borderRadius: 16, overflow: 'hidden',
              background: 'var(--card)',
              border: c.is_personal
                ? '1px solid var(--accent-border)'
                : '1px solid var(--border)',
              transition: 'border-color 0.2s',
            }}>
              {/* Header */}
              <div style={{
                padding: '14px 16px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                      {c.title}
                    </span>
                    {c.is_personal && (
                      <span className="badge badge-accent">Для вас</span>
                    )}
                  </div>
                  {c.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
                      {c.description}
                    </div>
                  )}
                </div>
                <div style={{
                  textAlign: 'right', flexShrink: 0, marginLeft: 12,
                }}>
                  <div className="numeric" style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>
                    +{c.bonus_amount.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>сом</div>
                </div>
              </div>

              {/* Info row */}
              <div style={{
                padding: '0 16px 10px', display: 'flex', gap: 12, flexWrap: 'wrap',
              }}>
                {c.min_purchase > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    от {c.min_purchase.toLocaleString()} сом
                  </span>
                )}
                {c.expires_at && (
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: new Date(c.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000
                      ? 'var(--warn)' : 'var(--text-3)',
                  }}>
                    <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> {formatExpiry(c.expires_at)}
                  </span>
                )}
              </div>

              {/* Dashed perforation + activate */}
              <div style={{
                borderTop: '1px dashed var(--border-strong)',
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <code style={{
                  fontSize: 13, fontWeight: 600, letterSpacing: 1.5,
                  color: 'var(--accent)', background: 'var(--accent-dim)',
                  padding: '4px 10px', borderRadius: 12,
                }}>
                  {c.code}
                </code>
                <button
                  onClick={() => activate(c.code)}
                  disabled={activating === c.code}
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '10px 24px', fontSize: 13 }}
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
