"use client";
import { Settings, AlertTriangle, BarChart3, MessageSquare, FileText, FlaskConical, Save, Bell, Clock, Gift, Timer, Lock, Eye, EyeOff, CheckCircle2, Users, Plus, Trash2 } from 'lucide-react';

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { authAPI } from "@/lib/api";
import { useToast } from '@/components/Toast';

// ─── Кастомный Toggle ───
const CustomToggle = ({ isEnabled, onToggle }: { isEnabled: boolean; onToggle: () => void }) => (
  <div
    style={{
      width: "52px",
      height: "28px",
      background: isEnabled ? "var(--success)" : "var(--bg3)",
      borderRadius: "16px",
      cursor: "pointer",
      position: "relative",
      transition: "background 0.2s",
      flexShrink: 0,
    }}
    onClick={onToggle}
  >
    <div
      style={{
        width: "22px",
        height: "22px",
        background: "white",
        borderRadius: "16%",
        position: "absolute",
        top: "3px",
        left: isEnabled ? "27px" : "3px",
        transition: "left 0.2s",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      }}
    />
  </div>
);

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [settings, setSettings] = useState({
    ENABLE_1C_WEBHOOK: "false",
    ENABLE_WHATSAPP_NOTIFICATIONS: "false",
    GREENAPI_INSTANCE_ID: "",
    GREENAPI_API_TOKEN: "",
    WHATSAPP_TEMPLATE_EARN: "✅ {name}, начислено +{amount} сом бонусов!\nБаланс: {balance} сом\n\n📱 Личный кабинет: {link}\n🛒 Смарт Центр",
    WHATSAPP_TEMPLATE_SPEND: "💳 {name}, списано {amount} сом бонусов.\nОстаток: {balance} сом\n\n📱 Личный кабинет: {link}\n🛒 Смарт Центр",
    WHATSAPP_TEMPLATE_EXPIRE: "⏰ {name}, у вас истекли {amount} сом бонусов.\nОстаток: {balance} сом.\n\n📱 Личный кабинет: {link}\n🛒 Смарт Центр",
    WHATSAPP_TEMPLATE_EXPIRE_WARNING: "⚠️ {name}, через {days} дней истечёт {amount} сом бонусов!\nБаланс: {balance} сом.\n\n📱 Личный кабинет: {link}\n🛒 Смарт Центр",
    WHATSAPP_TEMPLATE_BALANCE_REMINDER: "👋 {name}, у вас {balance} сом бонусов!\nНе забудьте использовать 🛍\n\n📱 Проверить баланс: {link}\n🛒 Смарт Центр",
    BALANCE_REMINDER_INACTIVE_DAYS: "14",
    BALANCE_REMINDER_MIN_BALANCE: "100",
    WA_MESSAGE_INTERVAL: "3",
    CAMPAIGN_BATCH_SIZE: "50",
    CAMPAIGN_BATCH_PAUSE: "30",
    WHEEL_FREE_SPINS_ON_REGISTER: "1",
    BONUS_EXPIRATION_DAYS: "365",
    BONUS_EXPIRATION_WARNING_DAYS: "14",
    REFERRAL_BONUS_INVITER: "50",
    REFERRAL_BONUS_INVITEE: "25",
    REFERRAL_DAILY_LIMIT: "5",
    REFERRAL_MILESTONES: "",
    BASKET_BONUS_TIERS: "",
    AUTO_COUPON_ENABLED: "false",
    AUTO_COUPON_MULTIPLIER: "1.3",
    AUTO_COUPON_BONUS_PERCENT: "7",
    AUTO_COUPON_VALIDITY_DAYS: "7",
    AUTO_COUPON_MAX_PER_RUN: "50",
    AUTO_COUPON_COOLDOWN_DAYS: "30",
    AUTO_COUPON_MIN_PURCHASES: "3",
    POST_PURCHASE_FOLLOWUP_ENABLED: "false",
    POST_PURCHASE_MIN_AMOUNT: "3000",
    POST_PURCHASE_MAX_PER_RUN: "50",
    POST_PURCHASE_FOLLOWUP_TEMPLATE: "",
    DEBT_REMINDER_ENABLED: "false",
    DEBT_REMINDER_DAYS_BEFORE: "3",
    DEBT_REMINDER_MAX_PER_RUN: "50",
  });

  const [testPhone, setTestPhone] = useState("+996");
  const [milestones, setMilestones] = useState<{ referrals_needed: number; reward_amount: number; title?: string }[]>([
    { referrals_needed: 5, reward_amount: 100 },
    { referrals_needed: 10, reward_amount: 250 },
    { referrals_needed: 20, reward_amount: 600 },
    { referrals_needed: 50, reward_amount: 1500 },
  ]);

  const updateMilestones = (arr: { referrals_needed: number; reward_amount: number; title?: string }[]) => {
    setMilestones(arr);
    setSettings((prev) => ({ ...prev, REFERRAL_MILESTONES: JSON.stringify(arr) }));
  };

  const [basketTiers, setBasketTiers] = useState<{ min: number; bonus: number }[]>([
    { min: 1000, bonus: 30 },
    { min: 2000, bonus: 80 },
    { min: 3000, bonus: 150 },
  ]);
  const [basketEnabled, setBasketEnabled] = useState(false);

  const updateBasketTiers = (arr: { min: number; bonus: number }[], enabled: boolean) => {
    setBasketTiers(arr);
    setBasketEnabled(enabled);
    setSettings((prev) => ({ ...prev, BASKET_BONUS_TIERS: enabled ? JSON.stringify(arr) : "[]" }));
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get("/api/v1/admin/settings");
      setSettings((prev) => ({ ...prev, ...data }));
      if (data.REFERRAL_MILESTONES) {
        try {
          const m = JSON.parse(data.REFERRAL_MILESTONES);
          if (Array.isArray(m) && m.length) setMilestones(m);
        } catch { /* keep defaults */ }
      }
      if (data.BASKET_BONUS_TIERS) {
        try {
          const t = JSON.parse(data.BASKET_BONUS_TIERS);
          if (Array.isArray(t) && t.length) { setBasketTiers(t); setBasketEnabled(true); }
        } catch { /* keep defaults */ }
      }
    } catch (err) {
      // error handled by toast
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/api/v1/admin/settings", settings);
      toast('success', 'Настройки успешно сохранены!');
    } catch (err) {
      // error handled by toast
      toast('error', 'Ошибка при сохранении настроек');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWhatsApp = async () => {
    if (!testPhone || testPhone === "+996") {
      toast('warning', 'Введите корректный номер телефона');
      return;
    }
    setTesting(true);
    try {
      await api.post(
        `/api/v1/admin/settings/test-whatsapp?phone=${encodeURIComponent(testPhone)}`
      );
      toast('success', 'Тестовое сообщение успешно отправлено!');
    } catch (err: any) {
      // error handled by toast
      toast('error', err.response?.data?.detail?.message || 'Ошибка при отправке тестового сообщения');
    } finally {
      setTesting(false);
    }
  };

  const handleChange = (field: keyof typeof settings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const toggleBoolean = async (field: keyof typeof settings) => {
    const newValue = settings[field] === "true" ? "false" : "true";
    setSettings((prev) => ({
      ...prev,
      [field]: newValue,
    }));
    // Auto-save toggle changes immediately (especially for 1C webhook)
    try {
      await api.post("/api/v1/admin/settings", { ...settings, [field]: newValue });
      toast('success', newValue === "true" ? 'Включено' : 'Отключено');
    } catch {
      // Revert on error
      setSettings((prev) => ({ ...prev, [field]: settings[field] }));
      toast('error', 'Ошибка сохранения');
    }
  };

  // ─── Стили ───
  const colors = {
    bg: "var(--bg)",
    cardBg: "var(--bg2)",
    border: "var(--bg3)",
    accent: "var(--accent)",
    text: "var(--text)",
    textMuted: "var(--text2)",
  };

  const styles = {
    container: {
      maxWidth: "900px",
      margin: "0 auto",
      padding: "4px 0",
      color: colors.text,
      fontFamily: "system-ui, -apple-system, sans-serif",
    },
    header: {
      marginBottom: "32px",
    },
    title: {
      fontSize: "24px",
      fontWeight: 700,
      margin: "0 0 8px 0",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: "15px",
      margin: 0,
    },
    card: {
      background: colors.cardBg,
      border: `1px solid ${colors.border}`,
      borderRadius: "16px",
      padding: "24px",
      marginBottom: "24px",
    },
    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: `1px solid ${colors.border}`,
      paddingBottom: "16px",
      marginBottom: "20px",
    },
    cardTitleWrapper: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    cardTitle: {
      fontSize: "20px",
      fontWeight: 600,
      margin: 0,
    },
    cardDesc: {
      fontSize: "13px",
      color: colors.textMuted,
      margin: "4px 0 0 0",
    },
    statusText: {
      fontSize: "14px",
      fontWeight: 600,
    },
    rowBlock: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "10px",
      padding: "16px",
      marginBottom: "20px",
    },
    inputLabel: {
      display: "block",
      fontSize: "14px",
      fontWeight: 600,
      color: colors.textMuted,
      marginBottom: "8px",
    },
    input: {
      width: "100%",
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "10px",
      color: colors.text,
      padding: "12px 16px",
      fontSize: "15px",
      outline: "none",
      boxSizing: "border-box" as const,
      transition: "border 0.2s",
    },
    textarea: {
      width: "100%",
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "10px",
      color: colors.text,
      padding: "12px 16px",
      fontSize: "15px",
      outline: "none",
      minHeight: "100px",
      boxSizing: "border-box" as const,
      resize: "vertical" as const,
    },
    grid2: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "20px",
    },
    btnSave: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      background: colors.accent,
      color: "var(--bg)",
      border: "none",
      borderRadius: "10px",
      padding: "16px 32px",
      fontSize: "16px",
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: "0 4px 20px rgba(255, 230, 0, 0.3)",
      transition: "all 0.2s",
    },
    btnTest: {
      background: "var(--bg3)",
      color: colors.text,
      border: "none",
      borderRadius: "10px",
      padding: "12px 24px",
      fontSize: "15px",
      fontWeight: 600,
      cursor: "pointer",
      height: "46px",
    },
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: colors.textMuted }}>
        Загрузка настроек...
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.title}><Settings size={24} /> Настройки интеграций</h1>
        <p style={styles.subtitle}>Управление webhook-ами 1С и уведомлениями Green API (WhatsApp)</p>
      </div>

      {/* 1C CARD */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <BarChart3 size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>Интеграция 1С</h2>
              <p style={styles.cardDesc}>Автоматическое начисление при покупке</p>
            </div>
          </div>
          <div
            style={{
              ...styles.statusText,
              color: settings.ENABLE_1C_WEBHOOK === "true" ? colors.accent : colors.textMuted,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "16%", background: settings.ENABLE_1C_WEBHOOK === "true" ? colors.accent : "var(--danger)", display: "inline-block" }} />
              {settings.ENABLE_1C_WEBHOOK === "true" ? "Включено" : "Отключено"}
            </span>
          </div>
        </div>

        <div style={styles.rowBlock}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Включить webhook 1С</div>
            <div style={{ fontSize: "13px", color: colors.textMuted }}>
              Webhook URL:{" "}
              <code
                style={{
                  background: colors.border,
                  padding: "2px 6px",
                  borderRadius: "10px",
                  color: colors.accent,
                }}
              >
                /api/v1/webhook/1c/purchase
              </code>
            </div>
          </div>
          <CustomToggle
            isEnabled={settings.ENABLE_1C_WEBHOOK === "true"}
            onToggle={() => toggleBoolean("ENABLE_1C_WEBHOOK")}
          />
        </div>
      </div>

      {/* WHATSAPP CARD */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <MessageSquare size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>WhatsApp (Green API)</h2>
              <p style={styles.cardDesc}>Уведомления клиентам об операциях</p>
            </div>
          </div>
          <div
            style={{
              ...styles.statusText,
              color: settings.ENABLE_WHATSAPP_NOTIFICATIONS === "true" ? colors.accent : colors.textMuted,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "16%", background: settings.ENABLE_WHATSAPP_NOTIFICATIONS === "true" ? colors.accent : "var(--danger)", display: "inline-block" }} />
              {settings.ENABLE_WHATSAPP_NOTIFICATIONS === "true" ? "Включено" : "Отключено"}
            </span>
          </div>
        </div>

        <div style={styles.rowBlock}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Отправлять уведомления</div>
            <div style={{ fontSize: "13px", color: colors.textMuted }}>
              Автоматически при начислении и списании
            </div>
          </div>
          <CustomToggle
            isEnabled={settings.ENABLE_WHATSAPP_NOTIFICATIONS === "true"}
            onToggle={() => toggleBoolean("ENABLE_WHATSAPP_NOTIFICATIONS")}
          />
        </div>

        <div style={{ ...styles.grid2, marginTop: "20px" }}>
          <div>
            <label style={styles.inputLabel}>Instance ID</label>
            <input
              style={styles.input}
              type="text"
              value={settings.GREENAPI_INSTANCE_ID}
              onChange={(e) => handleChange("GREENAPI_INSTANCE_ID", e.target.value)}
              placeholder="Например: 1101823456"
            />
          </div>
          <div>
            <label style={styles.inputLabel}>API Token</label>
            <input
              style={styles.input}
              type="password"
              value={settings.GREENAPI_API_TOKEN}
              onChange={(e) => handleChange("GREENAPI_API_TOKEN", e.target.value)}
              placeholder="Например: d1b1c2..."
            />
          </div>
        </div>

        <div style={{ marginTop: "16px" }}>
          <label style={styles.inputLabel}>
            <Clock size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} />
            Интервал между сообщениями (сек)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              style={{ ...styles.input, maxWidth: "120px" }}
              type="number"
              min={1}
              max={30}
              value={settings.WA_MESSAGE_INTERVAL}
              onChange={(e) => handleChange("WA_MESSAGE_INTERVAL", e.target.value)}
              placeholder="3"
            />
            <span style={{ fontSize: "13px", color: colors.textMuted }}>
              Задержка между WhatsApp сообщениями для защиты от блокировки (рекомендуется 3-5 сек)
            </span>
          </div>
        </div>

        {/* Campaign batch settings */}
        <div style={{ marginTop: "20px", padding: "16px", background: "rgba(255,230,0,0.04)", borderRadius: "10px", border: "1px solid rgba(255,230,0,0.1)" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: colors.text, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="#FFE600" strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="#FFE600" strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="#FFE600" strokeWidth="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="#FFE600" strokeWidth="1.5"/></svg>
            Батч-рассылка кампаний
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "150px" }}>
              <label style={{ fontSize: "12px", color: colors.textMuted, display: "block", marginBottom: "6px" }}>
                Размер батча (чел.)
              </label>
              <input
                style={{ ...styles.input, maxWidth: "120px" }}
                type="number"
                min={10}
                max={500}
                value={settings.CAMPAIGN_BATCH_SIZE}
                onChange={(e) => handleChange("CAMPAIGN_BATCH_SIZE", e.target.value)}
                placeholder="50"
              />
              <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "4px" }}>
                Сколько сообщений отправлять за раз (10-500)
              </div>
            </div>
            <div style={{ flex: 1, minWidth: "150px" }}>
              <label style={{ fontSize: "12px", color: colors.textMuted, display: "block", marginBottom: "6px" }}>
                Пауза между батчами (сек)
              </label>
              <input
                style={{ ...styles.input, maxWidth: "120px" }}
                type="number"
                min={10}
                max={300}
                value={settings.CAMPAIGN_BATCH_PAUSE}
                onChange={(e) => handleChange("CAMPAIGN_BATCH_PAUSE", e.target.value)}
                placeholder="30"
              />
              <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "4px" }}>
                Перерыв между группами для защиты от блокировки (рекомендуется 30 сек)
              </div>
            </div>
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted, marginTop: "10px", padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "10px" }}>
            Пример: 900 клиентов, батч 50, пауза 30с → 18 батчей → ~{Math.ceil(900 / Number(settings.CAMPAIGN_BATCH_SIZE || 50))} батчей, ~{Math.ceil(900 / Number(settings.CAMPAIGN_BATCH_SIZE || 50) * (Number(settings.CAMPAIGN_BATCH_PAUSE || 30) + Number(settings.CAMPAIGN_BATCH_SIZE || 50) * Number(settings.WA_MESSAGE_INTERVAL || 3)) / 60)} мин
          </div>
        </div>
      </div>

      {/* TEMPLATES CARD */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <FileText size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>Шаблоны сообщений</h2>
              <p style={styles.cardDesc}>
                Переменные: <span style={{ color: colors.accent }}>{"{name}"}</span> — имя,{" "}
                <span style={{ color: colors.accent }}>{"{amount}"}</span> — сумма,{" "}
                <span style={{ color: colors.accent }}>{"{balance}"}</span> — баланс,{" "}
                <span style={{ color: colors.accent }}>{"{link}"}</span> — кабинет,{" "}
                <span style={{ color: colors.accent }}>{"{days}"}</span> — дни
              </p>
            </div>
          </div>
        </div>

        <div style={styles.grid2}>
          <div>
            <label style={styles.inputLabel}>При начислении (EARN)</label>
            <textarea
              style={styles.textarea}
              value={settings.WHATSAPP_TEMPLATE_EARN}
              onChange={(e) => handleChange("WHATSAPP_TEMPLATE_EARN", e.target.value)}
            />
          </div>
          <div>
            <label style={styles.inputLabel}>При списании (SPEND)</label>
            <textarea
              style={styles.textarea}
              value={settings.WHATSAPP_TEMPLATE_SPEND}
              onChange={(e) => handleChange("WHATSAPP_TEMPLATE_SPEND", e.target.value)}
            />
          </div>
          <div>
            <label style={styles.inputLabel}>Истечение бонусов (EXPIRE)</label>
            <textarea
              style={styles.textarea}
              value={settings.WHATSAPP_TEMPLATE_EXPIRE}
              onChange={(e) => handleChange("WHATSAPP_TEMPLATE_EXPIRE", e.target.value)}
            />
          </div>
          <div>
            <label style={styles.inputLabel}>Предупреждение об истечении</label>
            <textarea
              style={styles.textarea}
              value={settings.WHATSAPP_TEMPLATE_EXPIRE_WARNING}
              onChange={(e) => handleChange("WHATSAPP_TEMPLATE_EXPIRE_WARNING", e.target.value)}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={styles.inputLabel}>Напоминание о бонусах (REMINDER)</label>
            <textarea
              style={styles.textarea}
              value={settings.WHATSAPP_TEMPLATE_BALANCE_REMINDER}
              onChange={(e) => handleChange("WHATSAPP_TEMPLATE_BALANCE_REMINDER", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* BALANCE REMINDER CARD */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <Bell size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>Авто-напоминания</h2>
              <p style={styles.cardDesc}>Ежедневно в 12:00 — напоминание неактивным клиентам с бонусами</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} color={colors.textMuted} />
            <span style={{ fontSize: 13, color: colors.textMuted }}>Каждый день 12:00</span>
          </div>
        </div>

        <div style={styles.grid2}>
          <div>
            <label style={styles.inputLabel}>Дней без покупок для напоминания</label>
            <input
              style={styles.input}
              type="number"
              min="1"
              max="90"
              value={settings.BALANCE_REMINDER_INACTIVE_DAYS}
              onChange={(e) => handleChange("BALANCE_REMINDER_INACTIVE_DAYS", e.target.value)}
            />
            <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
              Клиенты, которые не покупали больше этого срока, получат напоминание
            </p>
          </div>
          <div>
            <label style={styles.inputLabel}>Минимальный баланс (сом)</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              value={settings.BALANCE_REMINDER_MIN_BALANCE}
              onChange={(e) => handleChange("BALANCE_REMINDER_MIN_BALANCE", e.target.value)}
            />
            <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
              Напоминание только если баланс выше этой суммы
            </p>
          </div>
        </div>
      </div>

      {/* WHEEL FREE SPINS CARD */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <Gift size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>Колесо удачи — бесплатные спины</h2>
              <p style={styles.cardDesc}>Бесплатные попытки для новых клиентов при регистрации или импорте</p>
            </div>
          </div>
        </div>

        <div>
          <label style={styles.inputLabel}>Кол-во бесплатных спинов при регистрации</label>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              style={{ ...styles.input, maxWidth: "120px" }}
              type="number"
              min={0}
              max={10}
              value={settings.WHEEL_FREE_SPINS_ON_REGISTER}
              onChange={(e) => handleChange("WHEEL_FREE_SPINS_ON_REGISTER", e.target.value)}
              placeholder="1"
            />
            <span style={{ fontSize: "13px", color: colors.textMuted }}>
              0 = без бесплатных спинов. Рекомендуется 1-3.
            </span>
          </div>
        </div>
      </div>

      {/* REFERRAL SETTINGS CARD */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <Users size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>Реферальная программа</h2>
              <p style={styles.cardDesc}>Настройки бонусов за приглашение друзей</p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div>
              <label style={styles.inputLabel}>Бонус пригласившему (сом)</label>
              <input
                style={styles.input}
                type="number"
                min={0}
                value={settings.REFERRAL_BONUS_INVITER}
                onChange={(e) => handleChange("REFERRAL_BONUS_INVITER", e.target.value)}
                placeholder="100"
              />
            </div>
            <div>
              <label style={styles.inputLabel}>Бонус приглашённому (сом)</label>
              <input
                style={styles.input}
                type="number"
                min={0}
                value={settings.REFERRAL_BONUS_INVITEE}
                onChange={(e) => handleChange("REFERRAL_BONUS_INVITEE", e.target.value)}
                placeholder="50"
              />
            </div>
            <div>
              <label style={styles.inputLabel}>Лимит в день (на 1 клиента)</label>
              <input
                style={styles.input}
                type="number"
                min={1}
                max={50}
                value={settings.REFERRAL_DAILY_LIMIT}
                onChange={(e) => handleChange("REFERRAL_DAILY_LIMIT", e.target.value)}
                placeholder="5"
              />
            </div>
          </div>
          <div style={{
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-border)",
            borderRadius: "10px",
            padding: "12px 16px",
            fontSize: "13px",
            color: colors.textMuted,
            lineHeight: 1.6,
          }}>
            <strong style={{ color: colors.accent }}>Как работает:</strong> Клиент делится ссылкой с другом →
            друг регистрируется → оба получают бонус автоматически. Ссылка: <code>cabinet.smartcentr.store/register?ref=REF-XXX</code>
          </div>

          {/* ── MILESTONES EDITOR ── */}
          <div>
            <label style={styles.inputLabel}>Награды за приглашённых друзей (milestones)</label>
            <p style={{ fontSize: 12, color: colors.textMuted, margin: "4px 0 10px" }}>
              Дополнительный бонус, когда клиент пригласит N друзей. Удалите всё, чтобы отключить.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {milestones.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    style={{ ...styles.input, width: 90 }}
                    type="number" min={1} value={m.referrals_needed}
                    onChange={(e) => { const a = [...milestones]; a[i] = { ...a[i], referrals_needed: Number(e.target.value) }; updateMilestones(a); }}
                  />
                  <span style={{ color: colors.textMuted, fontSize: 13, whiteSpace: "nowrap" }}>друзей →</span>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    type="number" min={0} value={m.reward_amount}
                    onChange={(e) => { const a = [...milestones]; a[i] = { ...a[i], reward_amount: Number(e.target.value) }; updateMilestones(a); }}
                  />
                  <span style={{ color: colors.textMuted, fontSize: 13 }}>сом</span>
                  <button
                    onClick={() => updateMilestones(milestones.filter((_, j) => j !== i))}
                    title="Удалить"
                    style={{ background: "rgba(239,68,68,0.12)", border: "none", borderRadius: 10, padding: 9, cursor: "pointer", display: "flex" }}
                  >
                    <Trash2 size={16} color="var(--danger)" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateMilestones([...milestones, { referrals_needed: (milestones[milestones.length - 1]?.referrals_needed || 0) + 10, reward_amount: 0 }])}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", border: `1px dashed ${colors.accent}`, color: colors.accent, borderRadius: 10, padding: 11, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                <Plus size={16} /> Добавить уровень
              </button>
            </div>
          </div>
        </div>
      </div>

            {/* BONUS EXPIRATION CARD */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <Timer size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>Срок действия бонусов</h2>
              <p style={styles.cardDesc}>Автоматическое списание просроченных бонусов и напоминания через WhatsApp</p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={styles.inputLabel}>Срок действия бонусов (дней)</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                style={{ ...styles.input, maxWidth: "140px" }}
                type="number"
                min={30}
                max={3650}
                value={settings.BONUS_EXPIRATION_DAYS}
                onChange={(e) => handleChange("BONUS_EXPIRATION_DAYS", e.target.value)}
                placeholder="365"
              />
              <span style={{ fontSize: "13px", color: colors.textMuted }}>
                Бонусы старше этого срока будут автоматически списаны
              </span>
            </div>
          </div>

          <div>
            <label style={styles.inputLabel}>Интервал напоминаний (дней до истечения)</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                style={{ ...styles.input, maxWidth: "140px" }}
                type="number"
                min={1}
                max={90}
                value={settings.BONUS_EXPIRATION_WARNING_DAYS}
                onChange={(e) => handleChange("BONUS_EXPIRATION_WARNING_DAYS", e.target.value)}
                placeholder="14"
              />
              <span style={{ fontSize: "13px", color: colors.textMuted }}>
                WhatsApp напоминание за N дней до списания
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AVG CHECK CARD: Порог-бонусы + Auto-Coupon */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <Gift size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>Повышение среднего чека</h2>
              <p style={styles.cardDesc}>Порог-бонусы за размер чека и персональные авто-купоны</p>
            </div>
          </div>
        </div>

        {/* Порог-бонусы */}
        <div style={{ padding: "16px", background: "rgba(255,230,0,0.04)", borderRadius: "10px", border: "1px solid rgba(255,230,0,0.1)", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: colors.text }}>Порог-бонусы за размер чека</div>
            <button
              onClick={() => updateBasketTiers(basketTiers, !basketEnabled)}
              style={{ padding: "6px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "13px",
                background: basketEnabled ? "var(--success)" : "var(--bg3)",
                color: basketEnabled ? "#fff" : "var(--text2)" }}
            >
              {basketEnabled ? "Включено" : "Выключено"}
            </button>
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "12px" }}>
            Клиент получает доп. бонус при чеке выше порога. Применяется максимальный достигнутый порог.
          </div>
          {basketTiers.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", color: colors.textMuted, minWidth: "60px" }}>Чек от</span>
              <input style={{ ...styles.input, maxWidth: "110px" }} type="number" value={t.min}
                onChange={(e) => { const arr = [...basketTiers]; arr[i] = { ...arr[i], min: Number(e.target.value) }; updateBasketTiers(arr, basketEnabled); }} />
              <span style={{ fontSize: "13px", color: colors.textMuted }}>сом → бонус</span>
              <input style={{ ...styles.input, maxWidth: "100px" }} type="number" value={t.bonus}
                onChange={(e) => { const arr = [...basketTiers]; arr[i] = { ...arr[i], bonus: Number(e.target.value) }; updateBasketTiers(arr, basketEnabled); }} />
              <span style={{ fontSize: "13px", color: colors.textMuted }}>сом</span>
              <button onClick={() => updateBasketTiers(basketTiers.filter((_, j) => j !== i), basketEnabled)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: "4px" }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button onClick={() => updateBasketTiers([...basketTiers, { min: 5000, bonus: 300 }], basketEnabled)}
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: `1px dashed ${colors.border}`, borderRadius: "10px", padding: "8px 14px", cursor: "pointer", color: colors.textMuted, fontSize: "13px", marginTop: "4px" }}>
            <Plus size={14} /> Добавить порог
          </button>
        </div>

        {/* Auto-Coupon */}
        <div style={{ padding: "16px", background: "rgba(99,102,241,0.05)", borderRadius: "10px", border: "1px solid rgba(99,102,241,0.15)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: colors.text }}>Auto-Coupon Engine (Чт 11:00, еженедельно)</div>
            <button
              onClick={() => toggleBoolean("AUTO_COUPON_ENABLED")}
              style={{ padding: "6px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "13px",
                background: settings.AUTO_COUPON_ENABLED === "true" ? "var(--success)" : "var(--bg3)",
                color: settings.AUTO_COUPON_ENABLED === "true" ? "#fff" : "var(--text2)" }}
            >
              {settings.AUTO_COUPON_ENABLED === "true" ? "Включено" : "Выключено"}
            </button>
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "12px" }}>
            Персональный купон: порог = средний чек клиента × множитель. Купон активируется в кабинете только после покупки выше порога.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
            {[
              { key: "AUTO_COUPON_MULTIPLIER", label: "Множитель чека", hint: "1.3 = чек +30%" },
              { key: "AUTO_COUPON_BONUS_PERCENT", label: "Бонус, % от порога", hint: "7%" },
              { key: "AUTO_COUPON_VALIDITY_DAYS", label: "Срок купона, дней", hint: "7" },
              { key: "AUTO_COUPON_MAX_PER_RUN", label: "Макс. за запуск", hint: "50" },
              { key: "AUTO_COUPON_COOLDOWN_DAYS", label: "Пауза, дней", hint: "30" },
              { key: "AUTO_COUPON_MIN_PURCHASES", label: "Мин. покупок (90д)", hint: "3" },
            ].map((f) => (
              <div key={f.key}>
                <label style={{ fontSize: "12px", color: colors.textMuted, display: "block", marginBottom: "6px" }}>{f.label}</label>
                <input style={{ ...styles.input }} type="number" step="0.1"
                  value={settings[f.key as keyof typeof settings]}
                  onChange={(e) => handleChange(f.key as keyof typeof settings, e.target.value)}
                  placeholder={f.hint} />
              </div>
            ))}
          </div>
        </div>

        {/* Post-Purchase Follow-up */}
        <div style={{ padding: "16px", background: "rgba(16,185,129,0.05)", borderRadius: "10px", border: "1px solid rgba(16,185,129,0.15)", marginTop: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: colors.text }}>Забота после покупки (ежедневно 11:10)</div>
            <button
              onClick={() => toggleBoolean("POST_PURCHASE_FOLLOWUP_ENABLED")}
              style={{ padding: "6px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "13px",
                background: settings.POST_PURCHASE_FOLLOWUP_ENABLED === "true" ? "var(--success)" : "var(--bg3)",
                color: settings.POST_PURCHASE_FOLLOWUP_ENABLED === "true" ? "#fff" : "var(--text2)" }}
            >
              {settings.POST_PURCHASE_FOLLOWUP_ENABLED === "true" ? "Включено" : "Выключено"}
            </button>
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "12px" }}>
            На следующий день после покупки (без возврата) клиент получает WhatsApp: «Всё ли вам нравится? Если проблема — мы готовы помочь» (RU + KG). Переменные шаблона: {"{name}"}, {"{amount}"}, {"{link}"}.
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", color: colors.textMuted, display: "block", marginBottom: "6px" }}>Мин. сумма покупки (сом)</label>
              <input style={{ ...styles.input, maxWidth: "140px" }} type="number"
                value={settings.POST_PURCHASE_MIN_AMOUNT}
                onChange={(e) => handleChange("POST_PURCHASE_MIN_AMOUNT", e.target.value)} placeholder="3000" />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: colors.textMuted, display: "block", marginBottom: "6px" }}>Макс. сообщений за запуск</label>
              <input style={{ ...styles.input, maxWidth: "140px" }} type="number"
                value={settings.POST_PURCHASE_MAX_PER_RUN}
                onChange={(e) => handleChange("POST_PURCHASE_MAX_PER_RUN", e.target.value)} placeholder="50" />
            </div>
          </div>
          <label style={{ fontSize: "12px", color: colors.textMuted, display: "block", marginBottom: "6px" }}>Шаблон сообщения (пусто = стандартный RU+KG)</label>
          <textarea
            style={{ ...styles.input, width: "100%", minHeight: "90px", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
            value={settings.POST_PURCHASE_FOLLOWUP_TEMPLATE}
            onChange={(e) => handleChange("POST_PURCHASE_FOLLOWUP_TEMPLATE", e.target.value)}
            placeholder={"👋 {name}, здравствуйте! Это Смарт Центр.\nВчера вы сделали у нас покупку на {amount} сом. Всё ли работает? ..."}
          />
        </div>

        {/* Напоминания о рассрочке (1С) */}
        <div style={{ padding: "16px", background: "rgba(59,130,246,0.05)", borderRadius: "10px", border: "1px solid rgba(59,130,246,0.15)", marginTop: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: colors.text }}>Напоминания о рассрочке (ежедневно 10:40)</div>
            <button
              onClick={() => toggleBoolean("DEBT_REMINDER_ENABLED")}
              style={{ padding: "6px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "13px",
                background: settings.DEBT_REMINDER_ENABLED === "true" ? "var(--success)" : "var(--bg3)",
                color: settings.DEBT_REMINDER_ENABLED === "true" ? "#fff" : "var(--text2)" }}
            >
              {settings.DEBT_REMINDER_ENABLED === "true" ? "Включено" : "Выключено"}
            </button>
          </div>
          <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "12px" }}>
            WhatsApp клиентам по графику из 1С: за N дней до платежа, в день платежа и при просрочке
            (просрочка — не чаще 1 раза в 7 дней). RU + KG, с magic-link в кабинет. Меньше просрочек — быстрее деньги.
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: "12px", color: colors.textMuted, display: "block", marginBottom: "6px" }}>За сколько дней напоминать</label>
              <input style={{ ...styles.input, maxWidth: "140px" }} type="number"
                value={settings.DEBT_REMINDER_DAYS_BEFORE}
                onChange={(e) => handleChange("DEBT_REMINDER_DAYS_BEFORE", e.target.value)} placeholder="3" />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: colors.textMuted, display: "block", marginBottom: "6px" }}>Макс. сообщений за запуск</label>
              <input style={{ ...styles.input, maxWidth: "140px" }} type="number"
                value={settings.DEBT_REMINDER_MAX_PER_RUN}
                onChange={(e) => handleChange("DEBT_REMINDER_MAX_PER_RUN", e.target.value)} placeholder="50" />
            </div>
            <button
              onClick={async () => {
                try {
                  await api.post("/api/v1/admin/notifications/debt-reminders/run");
                  toast("success", "Напоминания запущены в фоне");
                } catch {
                  toast("error", "Не удалось запустить");
                }
              }}
              style={{ padding: "10px 18px", borderRadius: "10px", border: "1px solid var(--border)", cursor: "pointer",
                fontWeight: 600, fontSize: "13px", background: "var(--bg3)", color: "var(--text)" }}
            >
              Запустить сейчас
            </button>
          </div>
        </div>
      </div>

      {/* TEST CARD */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleWrapper}>
            <FlaskConical size={24} color={colors.accent} />
            <div>
              <h2 style={styles.cardTitle}>Тест подключения</h2>
              <p style={styles.cardDesc}>Проверьте работу WhatsApp интеграции</p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: "16px" }}>
          <div style={{ flex: 1 }}>
            <label style={styles.inputLabel}>Номер телефона для теста</label>
            <input
              style={styles.input}
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+996..."
            />
          </div>
          <button
            style={{
              ...styles.btnTest,
              opacity: testing || settings.ENABLE_WHATSAPP_NOTIFICATIONS !== "true" ? 0.5 : 1,
              cursor: testing || settings.ENABLE_WHATSAPP_NOTIFICATIONS !== "true" ? "not-allowed" : "pointer",
            }}
            onClick={handleTestWhatsApp}
            disabled={testing || settings.ENABLE_WHATSAPP_NOTIFICATIONS !== "true"}
          >
            {testing ? "Отправка..." : "Отправить тест"}
          </button>
        </div>
        {settings.ENABLE_WHATSAPP_NOTIFICATIONS !== "true" && (
          <div style={{ color: "var(--warn)", fontSize: "13px", marginTop: "12px", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} /> Для тестирования необходимо включить уведомления и сохранить настройки.
          </div>
        )}
      </div>

      {/* PASSWORD CHANGE CARD */}
      <PasswordChangeCard />

      {/* SAVE BUTTON */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "32px", position: "sticky", bottom: "24px", zIndex: 10 }}>
        <button
          style={{
            ...styles.btnSave,
            opacity: saving ? 0.7 : 1,
            cursor: saving ? "wait" : "pointer",
          }}
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={20} />
          {saving ? "Сохранение..." : "Сохранить все изменения"}
        </button>
      </div>
    </div>
  );
}


// ─── Password Change Component ───
function PasswordChangeCard() {
  const { toast } = useToast();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changing, setChanging] = useState(false);
  const [success, setSuccess] = useState(false);

  const isValid = currentPwd.length > 0 && newPwd.length >= 6 && newPwd === confirmPwd;

  const handleChange = async () => {
    if (!isValid) return;
    setChanging(true);
    try {
      await authAPI.changePassword(currentPwd, newPwd);
      toast('success', 'Пароль успешно изменён!');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.message || 'Ошибка смены пароля';
      toast('error', msg);
    } finally { setChanging(false); }
  };

  const colors = { bg: "var(--bg)", cardBg: "var(--bg2)", border: "var(--bg3)", accent: "var(--accent)", text: "var(--text)", textMuted: "var(--text2)" };

  return (
    <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${colors.border}`, paddingBottom: 16, marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Lock size={24} color={colors.accent} />
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Смена пароля</h2>
            <p style={{ fontSize: 13, color: colors.textMuted, margin: '4px 0 0 0' }}>Изменить пароль для входа в админ-панель</p>
          </div>
        </div>
        {success && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 14, fontWeight: 600 }}>
            <CheckCircle2 size={16} /> Изменён
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Current password */}
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: colors.textMuted, marginBottom: 8 }}>
            Текущий пароль
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder="Введите текущий пароль"
              style={{ width: '100%', padding: '12px 44px 12px 16px', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
            />
            <button onClick={() => setShowCurrent(!showCurrent)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              {showCurrent ? <EyeOff size={16} color="var(--text3)" /> : <Eye size={16} color="var(--text3)" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div className="grid-2 form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: colors.textMuted, marginBottom: 8 }}>
              Новый пароль
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="Минимум 6 символов"
                style={{ width: '100%', padding: '12px 44px 12px 16px', background: colors.bg, border: `1px solid ${newPwd.length > 0 && newPwd.length < 6 ? 'var(--danger)' : colors.border}`, borderRadius: 10, color: colors.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
              />
              <button onClick={() => setShowNew(!showNew)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                {showNew ? <EyeOff size={16} color="var(--text3)" /> : <Eye size={16} color="var(--text3)" />}
              </button>
            </div>
            {newPwd.length > 0 && newPwd.length < 6 && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>Минимум 6 символов</p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: colors.textMuted, marginBottom: 8 }}>
              Подтвердите пароль
            </label>
            <input
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Повторите новый пароль"
              style={{ width: '100%', padding: '12px 16px', background: colors.bg, border: `1px solid ${confirmPwd.length > 0 && confirmPwd !== newPwd ? 'var(--danger)' : colors.border}`, borderRadius: 10, color: colors.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
            />
            {confirmPwd.length > 0 && confirmPwd !== newPwd && (
              <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>Пароли не совпадают</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={handleChange}
            disabled={!isValid || changing}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: isValid ? 'var(--success)' : 'var(--bg3)',
              color: isValid ? '#fff' : 'var(--text3)', border: 'none',
              cursor: isValid && !changing ? 'pointer' : 'not-allowed',
              opacity: changing ? 0.6 : 1, transition: 'all 0.2s',
            }}
          >
            <Lock size={16} />
            {changing ? 'Сохранение...' : 'Изменить пароль'}
          </button>
        </div>
      </div>
    </div>
  );
}
