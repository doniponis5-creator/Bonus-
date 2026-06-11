'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';
import {
  Send, Save, Loader2, TestTube, Eye, EyeOff,
  Bell, BellOff, ShieldAlert, Users, RotateCcw,
  ShoppingCart, BarChart3, CheckCircle2, AlertCircle,
} from 'lucide-react';

interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  bot_token_masked?: string;
  chat_id: string;
  daily_report: boolean;
  notify_new_customers: boolean;
  notify_large_spend: boolean;
  notify_large_spend_threshold: number;
  notify_large_purchase: boolean;
  notify_large_purchase_threshold: number;
  notify_reversals: boolean;
}

const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  bot_token: '',
  chat_id: '',
  daily_report: true,
  notify_new_customers: true,
  notify_large_spend: true,
  notify_large_spend_threshold: 5000,
  notify_large_purchase: true,
  notify_large_purchase_threshold: 50000,
  notify_reversals: true,
};

// ═══════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════

function ToggleSwitch({ checked, onChange, label, description, icon: Icon }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description: string; icon: any;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px', borderRadius: 16,
        background: checked ? 'rgba(34,197,94,0.06)' : 'rgba(136,153,170,0.04)',
        border: `1px solid ${checked ? 'rgba(34,197,94,0.2)' : 'var(--bg3)'}`,
        cursor: 'pointer', transition: 'all 0.2s',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: checked ? 'rgba(34,197,94,0.12)' : 'rgba(136,153,170,0.08)',
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

function InputField({ label, value, onChange, placeholder, type = 'text', suffix }: {
  label: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; type?: string; suffix?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, display: 'block' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '10px 14px', paddingRight: suffix ? 50 : 14,
            background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10,
            color: 'var(--text)', fontSize: 14, outline: 'none',
            transition: 'border-color 0.15s', boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--bg3)')}
        />
        {suffix && (
          <span style={{
            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text3)', fontSize: 12,
          }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function TelegramPage() {
  const [config, setConfig] = useState<TelegramConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tokenEdited, setTokenEdited] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const { data } = await adminAPI.telegramConfig();
      setConfig({ ...DEFAULT_CONFIG, ...data });
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { bot_token_masked, ...payload } = config;
      if (!tokenEdited) payload.bot_token = '';
      await adminAPI.updateTelegramConfig(payload);
      toast('success', 'Конфигурация Telegram сохранена');
      setTokenEdited(false);
      load();
    } catch {
      toast('error', 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await adminAPI.testTelegram();
      toast('success', 'Тестовое сообщение отправлено!');
    } catch (e: any) {
      toast('error', e?.response?.data?.detail || 'Ошибка отправки');
    } finally { setTesting(false); }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 700 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--info)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Send size={20} color="#fff" />
          </div>
          Telegram бот
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 6 }}>
          Уведомления для владельца: статистика, алерты, команды
        </p>
      </div>

      {/* Master toggle */}
      <div style={{
        padding: '20px', borderRadius: 16, marginBottom: 20,
        background: config.enabled ? 'rgba(34,197,94,0.06)' : 'var(--bg2)',
        border: `1px solid ${config.enabled ? 'rgba(34,197,94,0.2)' : 'var(--bg3)'}`,
      }}>
        <ToggleSwitch
          checked={config.enabled}
          onChange={(v) => setConfig({ ...config, enabled: v })}
          label="Telegram бот активен"
          description="Включить уведомления и команды"
          icon={config.enabled ? Bell : BellOff}
        />
      </div>

      {/* Connection settings */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
        padding: 24, marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 18, color: 'var(--text)' }}>
          Подключение
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Bot token */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, display: 'block' }}>
              Bot Token (от @BotFather)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tokenEdited ? config.bot_token : (config.bot_token_masked || '')}
                  onChange={(e) => {
                    setTokenEdited(true);
                    setConfig({ ...config, bot_token: e.target.value });
                  }}
                  placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                  style={{
                    width: '100%', padding: '10px 42px 10px 14px',
                    background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10,
                    color: 'var(--text)', fontSize: 13, fontFamily: 'monospace', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  }}
                >
                  {showToken ? <EyeOff size={16} color="var(--text3)" /> : <Eye size={16} color="var(--text3)" />}
                </button>
              </div>
            </div>
          </div>

          {/* Chat ID */}
          <InputField
            label="Chat ID владельца"
            value={config.chat_id}
            onChange={(v) => setConfig({ ...config, chat_id: v })}
            placeholder="Отправьте /start боту — ID сохранится автоматически"
          />

          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)',
            fontSize: 12, color: 'var(--info)', lineHeight: 1.6,
          }}>
            <strong>Как подключить:</strong><br />
            1. Создайте бота через @BotFather в Telegram<br />
            2. Скопируйте токен сюда и сохраните<br />
            3. Отправьте <code style={{ background: 'rgba(96,165,250,0.12)', padding: '1px 5px', borderRadius: 10 }}>/start</code> вашему боту — Chat ID сохранится автоматически
          </div>
        </div>
      </div>

      {/* Notification settings */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
        padding: 24, marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 18, color: 'var(--text)' }}>
          Уведомления
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ToggleSwitch
            checked={config.daily_report}
            onChange={(v) => setConfig({ ...config, daily_report: v })}
            label="Ежедневный отчёт"
            description="Утром в 09:00 и вечером в 21:00"
            icon={BarChart3}
          />

          <ToggleSwitch
            checked={config.notify_new_customers}
            onChange={(v) => setConfig({ ...config, notify_new_customers: v })}
            label="Новые клиенты"
            description="Уведомление при регистрации нового клиента"
            icon={Users}
          />

          <ToggleSwitch
            checked={config.notify_large_spend}
            onChange={(v) => setConfig({ ...config, notify_large_spend: v })}
            label="Крупные списания"
            description="Алерт при списании бонусов выше порога"
            icon={ShieldAlert}
          />

          {config.notify_large_spend && (
            <div style={{ paddingLeft: 54 }}>
              <InputField
                label="Порог списания"
                value={config.notify_large_spend_threshold}
                onChange={(v) => setConfig({ ...config, notify_large_spend_threshold: Number(v) || 5000 })}
                type="number"
                suffix="сом"
              />
            </div>
          )}

          <ToggleSwitch
            checked={config.notify_large_purchase}
            onChange={(v) => setConfig({ ...config, notify_large_purchase: v })}
            label="Крупные покупки"
            description="Уведомление при покупке выше порога"
            icon={ShoppingCart}
          />

          {config.notify_large_purchase && (
            <div style={{ paddingLeft: 54 }}>
              <InputField
                label="Порог покупки"
                value={config.notify_large_purchase_threshold}
                onChange={(v) => setConfig({ ...config, notify_large_purchase_threshold: Number(v) || 50000 })}
                type="number"
                suffix="сом"
              />
            </div>
          )}

          <ToggleSwitch
            checked={config.notify_reversals}
            onChange={(v) => setConfig({ ...config, notify_reversals: v })}
            label="Возвраты транзакций"
            description="Алерт при отмене/возврате транзакции"
            icon={RotateCcw}
          />
        </div>
      </div>

      {/* Commands info */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 16,
        padding: 24, marginBottom: 24,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'var(--text)' }}>
          Команды бота
        </h3>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, /* mobile: handled by form-grid class */
        }}>
          {[
            { cmd: '/stats', desc: 'Полная статистика' },
            { cmd: '/today', desc: 'Сводка за сегодня' },
            { cmd: '/week', desc: 'Сводка за неделю' },
            { cmd: '/top', desc: 'TOP-5 клиентов' },
          ].map((c) => (
            <div key={c.cmd} style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(136,153,170,0.04)', border: '1px solid var(--bg3)',
            }}>
              <code style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700 }}>{c.cmd}</code>
              <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>{c.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{ padding: '12px 28px' }}
        >
          {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>

        <button
          onClick={handleTest}
          disabled={testing || !config.enabled}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: 'rgba(59,130,246,0.12)', color: 'var(--info)',
            border: '1px solid rgba(0,136,204,0.2)', cursor: testing || !config.enabled ? 'not-allowed' : 'pointer',
            opacity: !config.enabled ? 0.4 : 1,
          }}
        >
          {testing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <TestTube size={16} />}
          Тест
        </button>
      </div>
    </div>
  );
}
