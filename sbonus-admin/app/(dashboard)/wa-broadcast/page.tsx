'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';
import {
  MessageCircle, Send, Loader2, Save, Users, Eye,
  Moon, Cake, Crown, UserPlus, Coins, Wallet,
  AlertTriangle, CheckCircle2, ChevronDown, Zap,
  Clock,
} from 'lucide-react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface Segment {
  id: string;
  name: string;
  description: string;
  count: number;
}

interface PreviewData {
  total: number;
  preview: { full_name: string; phone: string; balance: number }[];
  example_message: string;
}

interface TriggerConfig {
  sleeping_enabled: boolean;
  sleeping_days: number;
  sleeping_template: string;
  birthday_enabled: boolean;
  birthday_template: string;
}

const DEFAULT_TRIGGERS: TriggerConfig = {
  sleeping_enabled: false,
  sleeping_days: 30,
  sleeping_template: 'Привет, {name}! Давно не виделись! У вас {balance} сом бонусов. Ждём вас! {link}',
  birthday_enabled: false,
  birthday_template: 'С днём рождения, {name}! Ваш баланс: {balance} сом. Приходите за подарком! {link}',
};

const SEGMENT_ICONS: Record<string, any> = {
  all: Users,
  sleeping: Moon,
  vip: Crown,
  new: UserPlus,
  birthday: Cake,
  high_balance: Coins,
  low_balance: Wallet,
};

const SEGMENT_COLORS: Record<string, string> = {
  all: '#3b82f6',
  sleeping: '#f59e0b',
  vip: '#8b5cf6',
  new: '#22c55e',
  birthday: '#ec4899',
  high_balance: '#FFE600',
  low_balance: '#f59e0b',
};

const VARIABLES = [
  { key: '{name}', desc: 'Имя клиента' },
  { key: '{balance}', desc: 'Баланс бонусов' },
  { key: '{link}', desc: 'Ссылка на кабинет' },
];

// ═══════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: any; label: string;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: active ? 700 : 500,
      background: active ? 'rgba(37,211,102,0.1)' : 'transparent',
      color: active ? 'var(--success)' : 'var(--text2)',
      border: `1px solid ${active ? 'rgba(37,211,102,0.25)' : 'transparent'}`,
      cursor: 'pointer', transition: 'all 0.2s',
    }}>
      <Icon size={16} /> {label}
    </button>
  );
}

function SegmentCard({ seg, selected, onClick }: {
  seg: Segment; selected: boolean; onClick: () => void;
}) {
  const Icon = SEGMENT_ICONS[seg.id] || Users;
  const color = SEGMENT_COLORS[seg.id] || '#3b82f6';
  return (
    <div onClick={onClick} style={{
      padding: '14px 16px', borderRadius: 16, cursor: 'pointer',
      background: selected ? `${color}11` : 'var(--bg2)',
      border: `1.5px solid ${selected ? `${color}44` : 'var(--bg3)'}`,
      transition: 'all 0.2s', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={16} color={color} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {seg.name}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>{seg.description}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{seg.count.toLocaleString()}</div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label, description, icon: Icon }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description: string; icon: any;
}) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 18px', borderRadius: 16,
      background: checked ? 'rgba(37,211,102,0.06)' : 'rgba(136,153,170,0.04)',
      border: `1px solid ${checked ? 'rgba(37,211,102,0.2)' : 'var(--bg3)'}`,
      cursor: 'pointer', transition: 'all 0.2s',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: checked ? 'rgba(37,211,102,0.12)' : 'rgba(136,153,170,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={checked ? 'var(--success)' : 'var(--text3)'} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{description}</div>
      </div>
      <div style={{
        width: 44, height: 24, borderRadius: 10,
        background: checked ? 'var(--success)' : 'var(--bg3)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 10,
          background: '#fff', position: 'absolute', top: 3,
          left: checked ? 23 : 3, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function WABroadcastPage() {
  const [tab, setTab] = useState<'broadcast' | 'triggers'>('broadcast');
  const { toast } = useToast();

  // ── Broadcast state ──
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loadingSegs, setLoadingSegs] = useState(true);
  const [selectedSeg, setSelectedSeg] = useState<string>('');
  const [message, setMessage] = useState('');
  const [threshold, setThreshold] = useState<string>('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  // ── Triggers state ──
  const [triggers, setTriggers] = useState<TriggerConfig>(DEFAULT_TRIGGERS);
  const [loadingTriggers, setLoadingTriggers] = useState(false);
  const [savingTriggers, setSavingTriggers] = useState(false);

  // ── Load segments ──
  const loadSegments = useCallback(async () => {
    try {
      const { data } = await adminAPI.waBroadcastSegments();
      setSegments(data);
    } catch { /* empty */ }
    finally { setLoadingSegs(false); }
  }, []);

  // ── Load triggers ──
  const loadTriggers = useCallback(async () => {
    setLoadingTriggers(true);
    try {
      const { data } = await adminAPI.waTriggersConfig();
      setTriggers({ ...DEFAULT_TRIGGERS, ...data });
    } catch { /* empty */ }
    finally { setLoadingTriggers(false); }
  }, []);

  useEffect(() => { loadSegments(); }, [loadSegments]);
  useEffect(() => { if (tab === 'triggers') loadTriggers(); }, [tab, loadTriggers]);

  // ── Preview ──
  const handlePreview = async () => {
    if (!selectedSeg || !message.trim()) {
      toast('error', 'Выберите сегмент и введите сообщение');
      return;
    }
    setLoadingPreview(true);
    setPreview(null);
    try {
      const th = threshold ? Number(threshold) : undefined;
      const { data } = await adminAPI.waBroadcastPreview(selectedSeg, message, th);
      setPreview(data);
    } catch (e: any) {
      toast('error', e?.response?.data?.detail || 'Ошибка предпросмотра');
    } finally { setLoadingPreview(false); }
  };

  // ── Send broadcast ──
  const handleSend = async () => {
    if (!selectedSeg || !message.trim()) return;
    setSending(true);
    try {
      const th = threshold ? Number(threshold) : undefined;
      const { data } = await adminAPI.waBroadcastSend(selectedSeg, message, th);
      toast('success', `Отправлено: ${data.sent} из ${data.total}`);
      setConfirmSend(false);
      setPreview(null);
      setMessage('');
      setSelectedSeg('');
      loadSegments();
    } catch (e: any) {
      toast('error', e?.response?.data?.detail || 'Ошибка рассылки');
    } finally { setSending(false); }
  };

  // ── Save triggers ──
  const handleSaveTriggers = async () => {
    setSavingTriggers(true);
    try {
      await adminAPI.updateWaTriggersConfig(triggers);
      toast('success', 'Авто-триггеры сохранены');
    } catch {
      toast('error', 'Ошибка сохранения');
    } finally { setSavingTriggers(false); }
  };

  const needsThreshold = selectedSeg === 'high_balance' || selectedSeg === 'low_balance';

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  return (
    <div style={{ maxWidth: 820 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 700 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessageCircle size={20} color="#fff" />
          </div>
          Рассылки WhatsApp
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 6 }}>
          Сегментные рассылки и автоматические триггеры
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        <TabButton active={tab === 'broadcast'} onClick={() => setTab('broadcast')} icon={Send} label="Рассылка" />
        <TabButton active={tab === 'triggers'} onClick={() => setTab('triggers')} icon={Zap} label="Авто-триггеры" />
      </div>

      {/* ═══ BROADCAST TAB ═══ */}
      {tab === 'broadcast' && (
        <>
          {/* Segments */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
            padding: 24, marginBottom: 20,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>
              Выберите сегмент
            </h3>
            {loadingSegs ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: 10,
              }}>
                {segments.map((seg) => (
                  <SegmentCard
                    key={seg.id}
                    seg={seg}
                    selected={selectedSeg === seg.id}
                    onClick={() => {
                      setSelectedSeg(seg.id);
                      setPreview(null);
                      setConfirmSend(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Threshold (if needed) */}
          {needsThreshold && (
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
              padding: 24, marginBottom: 20,
            }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, display: 'block' }}>
                Порог баланса (сом)
              </label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={selectedSeg === 'high_balance' ? '5000' : '1000'}
                style={{
                  width: '100%', padding: '10px 14px', maxWidth: 200,
                  background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10,
                  color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Message editor */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
            padding: 24, marginBottom: 20,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
              Сообщение
            </h3>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setMessage((m) => m + v.key)}
                  title={v.desc}
                  style={{
                    padding: '4px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                    background: 'rgba(37,211,102,0.08)', color: 'var(--success)',
                    border: '1px solid rgba(37,211,102,0.2)', cursor: 'pointer',
                  }}
                >
                  {v.key}
                  <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 4 }}>{v.desc}</span>
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Привет, {name}! У вас {balance} сом бонусов. Ждём вас! {link}"
              rows={5}
              maxLength={2000}
              style={{
                width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10,
                color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical',
                lineHeight: 1.6, fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                Используйте переменные для персонализации
              </span>
              <span style={{ fontSize: 11, color: message.length > 1800 ? 'var(--danger)' : 'var(--text3)' }}>
                {message.length} / 2000
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <button
              onClick={handlePreview}
              disabled={loadingPreview || !selectedSeg || !message.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: 'rgba(37,211,102,0.1)', color: 'var(--success)',
                border: '1px solid rgba(37,211,102,0.2)',
                cursor: !selectedSeg || !message.trim() ? 'not-allowed' : 'pointer',
                opacity: !selectedSeg || !message.trim() ? 0.4 : 1,
              }}
            >
              {loadingPreview
                ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                : <Eye size={16} />}
              Предпросмотр
            </button>
          </div>

          {/* Preview result */}
          {preview && (
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
              padding: 24, marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 , flexWrap: 'wrap', gap: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  Предпросмотр
                </h3>
                <div style={{
                  padding: '4px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: 'rgba(37,211,102,0.1)', color: 'var(--success)',
                }}>
                  {preview.total} получателей
                </div>
              </div>

              {/* Example message */}
              <div style={{
                padding: '16px', borderRadius: 10, marginBottom: 16,
                background: 'rgba(37,211,102,0.04)', border: '1px solid rgba(37,211,102,0.12)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>
                  Пример сообщения:
                </div>
                <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {preview.example_message}
                </div>
              </div>

              {/* Customer list */}
              {preview.preview.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                    Первые {preview.preview.length} из {preview.total}:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {preview.preview.map((c, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 10,
                        background: i % 2 === 0 ? 'rgba(136,153,170,0.03)' : 'transparent',
                      }}>
                        <div>
                          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{c.full_name}</span>
                          <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{c.phone}</span>
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                          {c.balance?.toLocaleString()} сом
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Send button */}
              {!confirmSend ? (
                <button
                  onClick={() => setConfirmSend(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    background: 'var(--success)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  <Send size={16} /> Отправить рассылку
                </button>
              ) : (
                <div style={{
                  padding: '16px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <AlertTriangle size={18} color="var(--danger)" />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}>
                      Подтвердите отправку
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
                    Сообщение будет отправлено <strong style={{ color: 'var(--text)' }}>{preview.total}</strong> клиентам через WhatsApp. Это действие нельзя отменить.
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={handleSend}
                      disabled={sending}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                        background: 'var(--danger)', color: '#fff', border: 'none',
                        cursor: sending ? 'not-allowed' : 'pointer',
                        opacity: sending ? 0.6 : 1,
                      }}
                    >
                      {sending
                        ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        : <CheckCircle2 size={14} />}
                      {sending ? 'Отправка...' : 'Да, отправить'}
                    </button>
                    <button
                      onClick={() => setConfirmSend(false)}
                      style={{
                        padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: 'transparent', color: 'var(--text2)',
                        border: '1px solid var(--bg3)', cursor: 'pointer',
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ TRIGGERS TAB ═══ */}
      {tab === 'triggers' && (
        <>
          {loadingTriggers ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)' }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* Sleeping trigger */}
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
                padding: 24, marginBottom: 20,
              }}>
                <ToggleSwitch
                  checked={triggers.sleeping_enabled}
                  onChange={(v) => setTriggers({ ...triggers, sleeping_enabled: v })}
                  label="Спящие клиенты"
                  description="Автоматическая рассылка клиентам без покупок"
                  icon={Moon}
                />

                {triggers.sleeping_enabled && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 54 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, display: 'block' }}>
                        Дней без покупок
                      </label>
                      <input
                        type="number"
                        value={triggers.sleeping_days}
                        onChange={(e) => setTriggers({ ...triggers, sleeping_days: Math.max(7, Math.min(365, Number(e.target.value) || 30)) })}
                        min={7}
                        max={365}
                        style={{
                          width: 100, padding: '8px 12px',
                          background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10,
                          color: 'var(--text)', fontSize: 14, outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, display: 'block' }}>
                        Шаблон сообщения
                      </label>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        {VARIABLES.map((v) => (
                          <button
                            key={v.key}
                            onClick={() => setTriggers((t) => ({ ...t, sleeping_template: t.sleeping_template + v.key }))}
                            style={{
                              padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                              background: 'rgba(37,211,102,0.08)', color: 'var(--success)',
                              border: '1px solid rgba(37,211,102,0.2)', cursor: 'pointer',
                            }}
                          >
                            {v.key}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={triggers.sleeping_template}
                        onChange={(e) => setTriggers({ ...triggers, sleeping_template: e.target.value })}
                        rows={3}
                        style={{
                          width: '100%', padding: '10px 14px', boxSizing: 'border-box',
                          background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10,
                          color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'vertical',
                          lineHeight: 1.5, fontFamily: 'inherit',
                        }}
                      />
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, color: 'var(--text3)',
                    }}>
                      <Clock size={12} /> Отправляется ежедневно в 11:00
                    </div>
                  </div>
                )}
              </div>

              {/* Birthday trigger */}
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
                padding: 24, marginBottom: 20,
              }}>
                <ToggleSwitch
                  checked={triggers.birthday_enabled}
                  onChange={(v) => setTriggers({ ...triggers, birthday_enabled: v })}
                  label="День рождения"
                  description="Поздравление в день рождения клиента"
                  icon={Cake}
                />

                {triggers.birthday_enabled && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 54 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, display: 'block' }}>
                        Шаблон поздравления
                      </label>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        {VARIABLES.map((v) => (
                          <button
                            key={v.key}
                            onClick={() => setTriggers((t) => ({ ...t, birthday_template: t.birthday_template + v.key }))}
                            style={{
                              padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                              background: 'rgba(37,211,102,0.08)', color: 'var(--success)',
                              border: '1px solid rgba(37,211,102,0.2)', cursor: 'pointer',
                            }}
                          >
                            {v.key}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={triggers.birthday_template}
                        onChange={(e) => setTriggers({ ...triggers, birthday_template: e.target.value })}
                        rows={3}
                        style={{
                          width: '100%', padding: '10px 14px', boxSizing: 'border-box',
                          background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10,
                          color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'vertical',
                          lineHeight: 1.5, fontFamily: 'inherit',
                        }}
                      />
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, color: 'var(--text3)',
                    }}>
                      <Clock size={12} /> Отправляется ежедневно в 09:30
                    </div>
                  </div>
                )}
              </div>

              {/* Save triggers */}
              <button
                onClick={handleSaveTriggers}
                disabled={savingTriggers}
                className="btn btn-primary"
                style={{ padding: '12px 28px' }}
              >
                {savingTriggers
                  ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Save size={16} />}
                {savingTriggers ? 'Сохранение...' : 'Сохранить триггеры'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
