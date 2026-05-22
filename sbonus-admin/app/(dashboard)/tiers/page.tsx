'use client';
import { Trophy, Loader2, XCircle, CheckCircle2, Plus, Medal, Award, Gem, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';

const TIER_META: Record<string, { Icon: LucideIcon; color: string }> = {
  Bronze:   { Icon: Medal,  color: '#cd7f32' },
  Silver:   { Icon: Award,  color: '#b0b0b0' },
  Gold:     { Icon: Trophy, color: '#ffd700' },
  Platinum: { Icon: Gem,    color: '#FFE600' },
};

const DEFAULT_META = { Icon: Star, color: '#60a5fa' };

export default function TiersPage() {
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.tiers();
      setTiers(data);
    } catch {
      setTiers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 24, fontWeight: 800, marginBottom: 24, flexWrap: 'wrap' as any }}><Trophy size={24} /> Уровни бонусной программы</h1>

      {/* Карточки уровней из БД */}
      {loading ? (
        <div style={{ color: '#8899aa', marginBottom: 24 }}><Loader2 className="animate-spin" style={{marginRight: 8, display: 'inline'}} size={16} /> Загрузка...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          {tiers.map(t => {
            const meta = TIER_META[t.name] || DEFAULT_META;
            const Icon = meta.Icon;
            return (
              <div className="card" key={t.id} style={{ textAlign: 'center', borderColor: `${meta.color}30` }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  <Icon size={40} color={meta.color} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: meta.color }}>{t.name}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: meta.color, margin: '8px 0' }}>
                  {t.bonus_percent}%
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                  от {Number(t.min_total_kgs).toLocaleString('ru-RU')} KGS
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  Макс. списание: {t.max_spend_pct}%
                </div>
              </div>
            );
          })}
          {tiers.length === 0 && (
            <div style={{ color: '#8899aa', gridColumn: '1/-1' }}>Уровни не найдены</div>
          )}
        </div>
      )}

      {/* Форма добавления / обновления */}
      <div className="card" style={{ maxWidth: 520 }}>
        <h3 style={{display: 'flex', alignItems: 'center', gap: 8,  fontSize: 16, fontWeight: 700, marginBottom: 20 }}><Plus size={16} /> Добавить / обновить уровень</h3>
        <form
          onSubmit={async e => {
            e.preventDefault();
            setSaving(true); setMsg('');
            const fd = new FormData(e.currentTarget);
            try {
              await adminAPI.createTier({
                name: fd.get('name'),
                min_total_kgs: Number(fd.get('min')),
                bonus_percent: Number(fd.get('pct')),
                max_spend_pct: Number(fd.get('max_spend')) || 30,
              });
              setMsg('success:Уровень "' + fd.get('name') + '" сохранён');
              (e.target as HTMLFormElement).reset();
              load();
            } catch (er: any) {
              setMsg('error:' + (er?.response?.data?.detail?.message || 'Ошибка'));
            } finally {
              setSaving(false);
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Название *</label>
            <input className="input" name="name" placeholder="Bronze / Silver / Gold / Platinum" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Мин. сумма (KGS) *</label>
              <input className="input" name="min" type="number" min="0" placeholder="0" required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Бонус % *</label>
              <input className="input" name="pct" type="number" min="0.1" max="100" step="0.1" placeholder="3" required />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Макс. списание % (по умолч. 30)</label>
            <input className="input" name="max_spend" type="number" min="1" max="100" placeholder="30" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
            {saving ? 'Сохранение...' : 'Сохранить уровень'}
          </button>
        </form>
        {msg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 14, fontWeight: 600, color: msg.startsWith('success') ? 'var(--accent)' : 'var(--danger)' }}>
            {msg.startsWith('success') ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {msg.replace(/^(success|error):/, '')}
          </div>
        )}
      </div>
    </div>
  );
}
