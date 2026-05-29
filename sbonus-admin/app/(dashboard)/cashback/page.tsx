'use client';
import { useEffect, useState } from 'react';
import { cashbackAPI } from '@/lib/api';
import {
  Percent, Loader2, Plus, Trash2, CheckCircle2, XCircle, Zap,
  Smartphone, Shirt, Pizza, Wrench, Sparkles, Home, Car, Heart,
  ShoppingBag, Laptop, Gamepad2, BookOpen, Coffee, Gem, Gift,
  Package, ChevronDown, ChevronUp, Edit3, Save, X,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, any> = {
  electronics: Laptop, phones: Smartphone, clothing: Shirt,
  food: Pizza, services: Wrench, beauty: Sparkles, home: Home,
  auto: Car, health: Heart, bags: ShoppingBag, games: Gamepad2,
  books: BookOpen, cafe: Coffee, jewelry: Gem, gifts: Gift,
  default: Package,
};

const CATEGORY_COLORS: Record<string, string> = {
  electronics: '#6366f1', phones: '#8b5cf6', clothing: '#ec4899',
  food: '#f97316', services: '#06b6d4', beauty: '#f43f5e', home: '#10b981',
  auto: '#64748b', health: '#ef4444', bags: '#d946ef', games: '#84cc16',
  books: '#0ea5e9', cafe: '#a855f7', jewelry: '#f59e0b', gifts: '#14b8a6',
  default: '#6b7280',
};

export default function CashbackPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [promo, setPromo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // New category form
  const [showAdd, setShowAdd] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newPercent, setNewPercent] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit inline
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editPercent, setEditPercent] = useState('');

  // Global promo
  const [promoEnabled, setPromoEnabled] = useState(false);
  const [promoPercent, setPromoPercent] = useState('');
  const [promoSaving, setPromoSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [catRes, promoRes] = await Promise.all([
        cashbackAPI.categories().catch(() => ({ data: [] })),
        cashbackAPI.globalPromo().catch(() => ({ data: null })),
      ]);
      setCategories(catRes.data || []);
      if (promoRes.data) {
        setPromo(promoRes.data);
        setPromoEnabled(promoRes.data.enabled || false);
        setPromoPercent(String(promoRes.data.percent || ''));
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      await cashbackAPI.createCategory(newSlug, newName, Number(newPercent));
      setMsg('Категория добавлена!');
      setNewSlug(''); setNewName(''); setNewPercent('');
      setShowAdd(false);
      load();
    } catch (er: any) {
      setMsg('Ошибка: ' + (er?.response?.data?.detail || 'неизвестно'));
    } finally { setSaving(false); }
  };

  const handleDeleteCategory = async (slug: string) => {
    if (!confirm('Удалить категорию?')) return;
    try { await cashbackAPI.deleteCategory(slug); load(); } catch {}
  };

  const handleUpdatePercent = async (slug: string) => {
    const v = Number(editPercent);
    if (isNaN(v) || v <= 0 || v > 50) return;
    try {
      await cashbackAPI.updateCategory(slug, v);
      setEditingSlug(null);
      load();
    } catch {}
  };

  const handleSavePromo = async () => {
    setPromoSaving(true);
    try {
      await cashbackAPI.updateGlobalPromo({ enabled: promoEnabled, percent: Number(promoPercent) || undefined });
      setMsg('Глобальная акция обновлена!');
      load();
    } catch (er: any) {
      setMsg('Ошибка: ' + (er?.response?.data?.detail || 'неизвестно'));
    } finally { setPromoSaving(false); }
  };

  const getIcon = (slug: string) => {
    const Icon = CATEGORY_ICONS[slug] || CATEGORY_ICONS.default;
    return Icon;
  };
  const getColor = (slug: string) => CATEGORY_COLORS[slug] || CATEGORY_COLORS.default;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Loader2 size={18} className="animate-spin" /> Загрузка...
    </div>
  );

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Percent size={20} color="#fff" />
            </div>
            Dynamic Кешбэк
          </h1>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
            Управление кешбэком по категориям и глобальными акциями
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Добавить
        </button>
      </div>

      {/* Message */}
      {msg && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
          background: msg.startsWith('Ошибка') ? '#ef444422' : '#10b98122',
          color: msg.startsWith('Ошибка') ? '#ef4444' : '#10b981',
          border: `1px solid ${msg.startsWith('Ошибка') ? '#ef444433' : '#10b98133'}`,
        }}>
          {msg.startsWith('Ошибка') ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          {msg}
          <button onClick={() => setMsg('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Global Promo Card */}
      <div style={{
        background: promoEnabled
          ? 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(245,158,11,0.08))'
          : 'var(--bg2)',
        borderRadius: 16, padding: 20, marginBottom: 24,
        border: `1px solid ${promoEnabled ? 'rgba(249,115,22,0.3)' : 'var(--border)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: promoEnabled ? '#f9731633' : 'var(--bg3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={22} color={promoEnabled ? '#f97316' : '#6b7280'} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Глобальная акция</h3>
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>Перекрывает категорийный кешбэк для всех</p>
            </div>
          </div>
          <button type="button" onClick={() => setPromoEnabled(!promoEnabled)} style={{
            width: 52, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
            background: promoEnabled ? '#f97316' : '#333', position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: '#fff',
              position: 'absolute', top: 3, left: promoEnabled ? 25 : 3, transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {promoEnabled && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Процент</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="number" min="0" max="50" step="0.5" value={promoPercent}
                  onChange={e => setPromoPercent(e.target.value)} placeholder="10"
                  style={{
                    width: 100, padding: '10px 12px', borderRadius: 10,
                    border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(0,0,0,0.2)',
                    color: '#f97316', fontSize: 20, fontWeight: 800, textAlign: 'center', outline: 'none',
                  }} />
                <span style={{ fontSize: 20, fontWeight: 800, color: '#f97316' }}>%</span>
              </div>
            </div>
            <button onClick={handleSavePromo} disabled={promoSaving} style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: '#f97316', color: '#fff', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', opacity: promoSaving ? 0.6 : 1,
            }}>
              {promoSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
        {!promoEnabled && (
          <button onClick={handleSavePromo} disabled={promoSaving} style={{
            marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer',
          }}>
            Сохранить (выкл)
          </button>
        )}
      </div>

      {/* Add Category Form */}
      {showAdd && (
        <div style={{
          background: 'var(--bg2)', borderRadius: 16, padding: 20, marginBottom: 24,
          border: '1px solid var(--border)',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
            <Plus size={16} color="#6366f1" /> Новая категория
          </h3>
          <form onSubmit={handleCreateCategory} className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Slug (латиница)</label>
              <input className="input" value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="electronics" required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Название</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Электроника" required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>%</label>
              <input className="input" type="number" min="0.5" max="50" step="0.5" value={newPercent}
                onChange={e => setNewPercent(e.target.value)} placeholder="5" required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, fontWeight: 700, textAlign: 'center', outline: 'none' }} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{
                padding: '10px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Добавление...' : 'Добавить'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} style={{
                padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text3)', fontSize: 13, cursor: 'pointer',
              }}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {categories.length === 0 && (
          <div style={{
            gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px',
            color: 'var(--text3)', fontSize: 14,
          }}>
            <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p>Категории не настроены</p>
            <p style={{ fontSize: 12 }}>Нажмите «Добавить» чтобы создать первую категорию</p>
          </div>
        )}

        {categories.map((c: any) => {
          const Icon = getIcon(c.slug);
          const color = getColor(c.slug);
          const isEditing = editingSlug === c.slug;

          return (
            <div key={c.slug} style={{
              background: 'var(--bg2)', borderRadius: 16, padding: 20,
              border: `1px solid ${isEditing ? color + '66' : 'var(--border)'}`,
              transition: 'border-color 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: color + '22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={22} color={color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{c.slug}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {!isEditing ? (
                    <button onClick={() => { setEditingSlug(c.slug); setEditPercent(String(c.percent)); }}
                      style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text3)' }}>
                      <Edit3 size={14} />
                    </button>
                  ) : (
                    <button onClick={() => setEditingSlug(null)}
                      style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text3)' }}>
                      <X size={14} />
                    </button>
                  )}
                  <button onClick={() => handleDeleteCategory(c.slug)}
                    style={{ padding: 6, borderRadius: 8, border: '1px solid #ef444433', background: '#ef444412', cursor: 'pointer', color: '#ef4444' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Percent display / edit */}
              {!isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    flex: 1, height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', width: `${Math.min(c.percent * 5, 100)}%`,
                      background: `linear-gradient(90deg, ${color}, ${color}88)`,
                      borderRadius: 4, transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{
                    fontSize: 22, fontWeight: 800, color: color, minWidth: 60, textAlign: 'right',
                  }}>
                    {c.percent}%
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min="0.5" max="20" step="0.5" value={editPercent}
                    onChange={e => setEditPercent(e.target.value)}
                    style={{ flex: 1, accentColor: color }} />
                  <input type="number" min="0.5" max="50" step="0.5" value={editPercent}
                    onChange={e => setEditPercent(e.target.value)}
                    style={{
                      width: 70, padding: '6px 8px', borderRadius: 8,
                      border: `1px solid ${color}44`, background: 'var(--bg3)',
                      color: color, fontSize: 16, fontWeight: 800, textAlign: 'center', outline: 'none',
                    }} />
                  <span style={{ color: color, fontWeight: 800, fontSize: 16 }}>%</span>
                  <button onClick={() => handleUpdatePercent(c.slug)} style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    background: color, color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}>
                    <Save size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info card */}
      <div style={{
        marginTop: 24, background: 'var(--bg2)', borderRadius: 14, padding: 16,
        border: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)',
        lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--text)' }}>Как работает:</strong> Кешбэк по категориям применяется автоматически при начислении бонуса.
        Если товар относится к категории с повышенным кешбэком — клиент получает больше бонусов.
        Глобальная акция перекрывает все категории и действует для всех клиентов.
        Стандартный кешбэк определяется уровнем лояльности (Bronze 2%, Silver 3%, Gold 5%, Platinum 7%).
      </div>
    </div>
  );
}
