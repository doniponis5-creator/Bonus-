'use client';

import { useEffect, useState } from 'react';
import { customerAPI } from '@/lib/api';

interface Review {
  id: string;
  platform: string;
  review_link: string;
  status: string;
  bonus_amount: number;
  admin_note?: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'На проверке', color: '#f59e0b' },
  approved: { label: 'Одобрен', color: '#22c55e' },
  rejected: { label: 'Отклонён', color: '#ff4d4d' },
};

export default function ReviewBonus({ onBalanceChange }: { onBalanceChange?: () => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [canGoogle, setCanGoogle] = useState(true);
  const [can2gis, setCan2gis] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);

  // Form
  const [platform, setPlatform] = useState<'google' | '2gis'>('google');
  const [link, setLink] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await customerAPI.myReviews();
      setReviews(data.reviews || []);
      setCanGoogle(data.can_submit_google);
      setCan2gis(data.can_submit_2gis);
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!link.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const { data } = await customerAPI.submitReview(platform, link.trim());
      setResult({ message: data.message, ok: true });
      setLink('');
      load();
      onBalanceChange?.();
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.response?.data?.detail || 'Ошибка отправки';
      setResult({ message: msg, ok: false });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitCurrent = platform === 'google' ? canGoogle : can2gis;

  return (
    <div style={{ padding: '20px 0' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        ⭐ Бонус за отзыв
      </h2>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px', lineHeight: 1.5 }}>
        Оставьте отзыв о Смарт Центр на Google Maps или 2GIS и получите бонус!
      </p>

      {/* How it works */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, marginBottom: 16,
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2eaf6', marginBottom: 10 }}>Как получить бонус:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { num: '1', text: 'Оставьте отзыв на Google Maps или 2GIS' },
            { num: '2', text: 'Скопируйте ссылку на ваш отзыв' },
            { num: '3', text: 'Вставьте ссылку ниже и отправьте' },
            { num: '4', text: 'После проверки бонус будет начислен' },
          ].map(step => (
            <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,230,0,0.12)', color: '#FFE600',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800,
              }}>{step.num}</div>
              <span style={{ fontSize: 13, color: '#8899aa' }}>{step.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Result toast */}
      {result && (
        <div style={{
          padding: '14px 18px', borderRadius: 12, marginBottom: 16,
          background: result.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: result.ok ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: result.ok ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
            {result.message}
          </span>
          <button onClick={() => setResult(null)} style={{
            background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', padding: '0 0 0 12px',
          }}>×</button>
        </div>
      )}

      {/* Submit form */}
      {(canGoogle || can2gis) && (
        <div style={{
          borderRadius: 14, padding: 16, marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(255,230,0,0.08), rgba(255,230,0,0.02))',
          border: '1px solid rgba(255,230,0,0.15)',
        }}>
          {/* Platform selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => setPlatform('google')} disabled={!canGoogle}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', cursor: canGoogle ? 'pointer' : 'not-allowed',
                fontSize: 13, fontWeight: 700,
                background: platform === 'google' ? '#4285F4' : 'rgba(255,255,255,0.06)',
                color: platform === 'google' ? '#fff' : canGoogle ? '#8899aa' : '#475569',
                opacity: canGoogle ? 1 : 0.4,
                transition: 'all 0.2s',
              }}>
              Google Maps
            </button>
            <button onClick={() => setPlatform('2gis')} disabled={!can2gis}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', cursor: can2gis ? 'pointer' : 'not-allowed',
                fontSize: 13, fontWeight: 700,
                background: platform === '2gis' ? '#2DB600' : 'rgba(255,255,255,0.06)',
                color: platform === '2gis' ? '#fff' : can2gis ? '#8899aa' : '#475569',
                opacity: can2gis ? 1 : 0.4,
                transition: 'all 0.2s',
              }}>
              2GIS
            </button>
          </div>

          {canSubmitCurrent ? (
            <>
              <input
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="https://maps.google.com/... или https://2gis.kg/..."
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(0,0,0,0.3)', color: '#e2eaf6', fontSize: 13, outline: 'none',
                  marginBottom: 12, boxSizing: 'border-box',
                }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
              <button
                onClick={handleSubmit}
                disabled={submitting || !link.trim()}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                  fontSize: 14, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
                  background: submitting ? 'rgba(255,230,0,0.3)' : 'linear-gradient(135deg, #FFE600, #f59e0b)',
                  color: '#0a0f1a', transition: 'all 0.2s',
                  opacity: !link.trim() ? 0.5 : 1,
                }}>
                {submitting ? 'Отправка...' : 'Отправить на проверку'}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px 0', color: '#64748b', fontSize: 13 }}>
              Вы уже отправили отзыв для этой платформы
            </div>
          )}
        </div>
      )}

      {/* My reviews history */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20, color: '#8899aa' }}>Загрузка...</div>
      ) : reviews.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2eaf6', marginBottom: 10 }}>Мои заявки</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reviews.map(r => {
              const st = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
              return (
                <div key={r.id} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2eaf6' }}>
                      {r.platform === 'google' ? 'Google Maps' : '2GIS'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {new Date(r.created_at).toLocaleDateString('ru-RU')}
                    </div>
                    {r.admin_note && r.status === 'rejected' && (
                      <div style={{ fontSize: 12, color: '#ff4d4d', marginTop: 4 }}>{r.admin_note}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                      background: `${st.color}18`, color: st.color,
                    }}>
                      {st.label}
                    </span>
                    {r.status === 'approved' && (
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', marginTop: 4 }}>
                        +{r.bonus_amount} KGS
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
