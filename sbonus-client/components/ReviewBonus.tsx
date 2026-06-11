'use client';

import { useEffect, useState } from 'react';
import { Star, X } from 'lucide-react';
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

const STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  pending: { label: 'На проверке', badge: 'badge badge-warn' },
  approved: { label: 'Одобрен', badge: 'badge badge-success' },
  rejected: { label: 'Отклонён', badge: 'badge badge-danger' },
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
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.022em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Star size={20} color="var(--accent)" /> Бонус за отзыв
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px', lineHeight: 1.5 }}>
        Оставьте отзыв о Смарт Центр на Google Maps или 2GIS — бонус будет начислен после проверки
      </p>

      {/* How it works */}
      <div style={{
        background: 'var(--card)', borderRadius: 16, padding: 16, marginBottom: 16,
        border: '1px solid var(--border)',
      }}>
        <div className="h3" style={{ marginBottom: 10 }}>Как получить бонус</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { num: '1', text: 'Оставьте отзыв на Google Maps или 2GIS' },
            { num: '2', text: 'Скопируйте ссылку на ваш отзыв' },
            { num: '3', text: 'Вставьте ссылку ниже и отправьте' },
            { num: '4', text: 'После проверки бонус будет начислен' },
          ].map(step => (
            <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                background: 'var(--accent-dim)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>{step.num}</div>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{step.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div style={{
          padding: '14px 16px', borderRadius: 12, marginBottom: 16,
          background: 'var(--bg-2)',
          border: '1px solid var(--border-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: result.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            {result.message}
          </span>
          <button onClick={() => setResult(null)} aria-label="Закрыть" style={{
            background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 0 0 12px', display: 'flex',
          }}><X size={17} /></button>
        </div>
      )}

      {/* Submit form */}
      {(canGoogle || can2gis) && (
        <div className="card card-accent" style={{ marginBottom: 16 }}>
          {/* Platform selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => setPlatform('google')} disabled={!canGoogle}
              className="btn btn-secondary"
              style={{
                flex: 1, width: 'auto', padding: '12px 0', fontSize: 13,
                borderColor: platform === 'google' ? 'var(--accent-border)' : 'var(--border)',
                background: platform === 'google' ? 'var(--accent-dim)' : 'var(--card-strong)',
                color: platform === 'google' ? 'var(--accent)' : 'var(--text-2)',
              }}>
              Google Maps
            </button>
            <button onClick={() => setPlatform('2gis')} disabled={!can2gis}
              className="btn btn-secondary"
              style={{
                flex: 1, width: 'auto', padding: '12px 0', fontSize: 13,
                borderColor: platform === '2gis' ? 'var(--accent-border)' : 'var(--border)',
                background: platform === '2gis' ? 'var(--accent-dim)' : 'var(--card-strong)',
                color: platform === '2gis' ? 'var(--accent)' : 'var(--text-2)',
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
                className="input"
                style={{ marginBottom: 12 }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
              <button
                onClick={handleSubmit}
                disabled={submitting || !link.trim()}
                className="btn btn-primary"
                style={{ fontSize: 14 }}>
                {submitting ? 'Отправка...' : 'Отправить на проверку'}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-3)', fontSize: 13 }}>
              Вы уже отправили отзыв для этой платформы
            </div>
          )}
        </div>
      )}

      {/* My reviews history */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-2)', fontSize: 14 }}>Загрузка...</div>
      ) : reviews.length > 0 && (
        <div>
          <div className="h3" style={{ marginBottom: 10 }}>Мои заявки</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reviews.map(r => {
              const st = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
              return (
                <div key={r.id} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {r.platform === 'google' ? 'Google Maps' : '2GIS'}
                    </div>
                    <div className="caption" style={{ marginTop: 2 }}>
                      {new Date(r.created_at).toLocaleDateString('ru-RU')}
                    </div>
                    {r.admin_note && r.status === 'rejected' && (
                      <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{r.admin_note}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={st.badge}>
                      {st.label}
                    </span>
                    {r.status === 'approved' && (
                      <div className="numeric" style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>
                        +{r.bonus_amount} сом
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
