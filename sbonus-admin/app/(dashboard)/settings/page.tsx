"use client";
import { Settings, AlertTriangle, BarChart3, MessageSquare, FileText, FlaskConical, Save, Bell, Clock, Gift, Timer } from 'lucide-react';

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useToast } from '@/components/Toast';

// ─── Кастомный Toggle ───
const CustomToggle = ({ isEnabled, onToggle }: { isEnabled: boolean; onToggle: () => void }) => (
  <div
    style={{
      width: "52px",
      height: "28px",
      background: isEnabled ? "#22c55e" : "#1c2a3a",
      borderRadius: "14px",
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
        borderRadius: "50%",
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
    WHATSAPP_TEMPLATE_EARN: "✅ {name}, начислено +{amount} KGS бонусов!\nБаланс: {balance} KGS\n\n📱 Личный кабинет: {link}\n🛒 Смарт Центр",
    WHATSAPP_TEMPLATE_SPEND: "💳 {name}, списано {amount} KGS бонусов.\nОстаток: {balance} KGS\n\n📱 Личный кабинет: {link}\n🛒 Смарт Центр",
    WHATSAPP_TEMPLATE_EXPIRE: "⏰ {name}, у вас истекли {amount} KGS бонусов.\nОстаток: {balance} KGS.\n\n📱 Личный кабинет: {link}\n🛒 Смарт Центр",
    WHATSAPP_TEMPLATE_EXPIRE_WARNING: "⚠️ {name}, через {days} дней истечёт {amount} KGS бонусов!\nБаланс: {balance} KGS.\n\n📱 Личный кабинет: {link}\n🛒 Смарт Центр",
    WHATSAPP_TEMPLATE_BALANCE_REMINDER: "👋 {name}, у вас {balance} KGS бонусов!\nНе забудьте использовать 🛍\n\n📱 Проверить баланс: {link}\n🛒 Смарт Центр",
    BALANCE_REMINDER_INACTIVE_DAYS: "14",
    BALANCE_REMINDER_MIN_BALANCE: "100",
    WA_MESSAGE_INTERVAL: "3",
    WHEEL_FREE_SPINS_ON_REGISTER: "1",
    BONUS_EXPIRATION_DAYS: "365",
    BONUS_EXPIRATION_WARNING_DAYS: "14",
  });

  const [testPhone, setTestPhone] = useState("+996");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get("/api/v1/admin/settings");
      setSettings((prev) => ({ ...prev, ...data }));
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

  const toggleBoolean = (field: keyof typeof settings) => {
    setSettings((prev) => ({
      ...prev,
      [field]: prev[field] === "true" ? "false" : "true",
    }));
  };

  // ─── Стили ───
  const colors = {
    bg: "#07090f",
    cardBg: "#0d1117",
    border: "#1c2a3a",
    accent: "#FFE600",
    text: "#e2eaf6",
    textMuted: "#8899aa",
  };

  const styles = {
    container: {
      maxWidth: "900px",
      margin: "0 auto",
      padding: "20px",
      color: colors.text,
      fontFamily: "system-ui, -apple-system, sans-serif",
    },
    header: {
      marginBottom: "32px",
    },
    title: {
      fontSize: "28px",
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
      borderRadius: "12px",
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
      color: "#0a0f1a",
      border: "none",
      borderRadius: "12px",
      padding: "16px 32px",
      fontSize: "16px",
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: "0 4px 20px rgba(255, 230, 0, 0.3)",
      transition: "all 0.2s",
    },
    btnTest: {
      background: "#1c2a3a",
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
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: settings.ENABLE_1C_WEBHOOK === "true" ? colors.accent : "#ff4d4d", display: "inline-block" }} />
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
                  borderRadius: "4px",
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
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: settings.ENABLE_WHATSAPP_NOTIFICATIONS === "true" ? colors.accent : "#ff4d4d", display: "inline-block" }} />
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
            <label style={styles.inputLabel}>Минимальный баланс (KGS)</label>
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
          <div style={{ color: "#f59e0b", fontSize: "13px", marginTop: "12px", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} /> Для тестирования необходимо включить уведомления и сохранить настройки.
          </div>
        )}
      </div>

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
