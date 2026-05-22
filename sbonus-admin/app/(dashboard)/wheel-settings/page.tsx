"use client";
import { useEffect, useState, useCallback } from "react";
import { Disc3, Plus, Trash2, RotateCcw, Save, AlertTriangle, Eye, GripVertical } from "lucide-react";
import { adminAPI } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface Segment {
  id: number;
  label: string;
  value: number;
  color: string;
  probability: number;
  prize_type: "bonus" | "physical" | "none";
}

const PRESET_COLORS = [
  "#FFE600", "#22c55e", "#3b82f6", "#a855f7", "#f97316",
  "#06b6d4", "#ec4899", "#64748b", "#ef4444", "#14b8a6",
  "#f59e0b", "#8b5cf6",
];

export default function WheelSettingsPage() {
  const { toast, confirm } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [source, setSource] = useState("default");
  const [showPreview, setShowPreview] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await adminAPI.wheelConfig();
      // Ensure prize_type exists for each segment (backward compat)
      const segs = (data.segments || []).map((s: any) => ({
        ...s,
        prize_type: s.prize_type || (s.value > 0 ? "bonus" : "none"),
      }));
      setSegments(segs);
      setSource(data.source);
    } catch (err) {
      // error handled by toast
      toast("error", "Ошибка загрузки конфигурации");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const totalProbability = segments.reduce((s, seg) => s + seg.probability, 0);
  const isValid = segments.length >= 2 && segments.length <= 12 && Math.abs(totalProbability - 1.0) < 0.01;

  const handleSave = async () => {
    if (!isValid) {
      toast("error", `Сумма вероятностей: ${(totalProbability * 100).toFixed(1)}% (должна быть 100%)`);
      return;
    }
    setSaving(true);
    try {
      await adminAPI.updateWheelConfig(segments);
      toast("success", "Конфигурация колеса сохранена!");
      setSource("database");
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || err.response?.data?.detail || "Ошибка сохранения";
      toast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!await confirm("Сбросить к значениям по умолчанию?")) return;
    try {
      await adminAPI.resetWheelConfig();
      toast("success", "Конфигурация сброшена");
      await fetchConfig();
    } catch (err) {
      toast("error", "Ошибка сброса");
    }
  };

  const addSegment = () => {
    if (segments.length >= 12) { toast("warning", "Максимум 12 сегментов"); return; }
    const usedColors = segments.map(s => s.color);
    const freeColor = PRESET_COLORS.find(c => !usedColors.includes(c)) || "#999999";
    setSegments([...segments, {
      id: segments.length + 1,
      label: "Новый",
      value: 0,
      color: freeColor,
      probability: 0,
      prize_type: "bonus",
    }]);
  };

  const removeSegment = (index: number) => {
    if (segments.length <= 2) { toast("warning", "Минимум 2 сегмента"); return; }
    setSegments(segments.filter((_, i) => i !== index));
  };

  const updateSegment = (index: number, field: keyof Segment, value: string | number) => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const autoBalance = () => {
    const avg = +(1 / segments.length).toFixed(4);
    const balanced = segments.map((s, i) => ({
      ...s,
      probability: i === segments.length - 1 ? +(1 - avg * (segments.length - 1)).toFixed(4) : avg,
    }));
    setSegments(balanced);
    toast("success", "Вероятности выровнены");
  };

  // ─── Styles ───
  const colors = {
    bg: "#07090f", cardBg: "#0d1117", border: "#1c2a3a",
    accent: "#FFE600", text: "#e2eaf6", textMuted: "#8899aa",
    danger: "#ef4444", success: "#22c55e",
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.textMuted }}>Загрузка...</div>;
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20, color: colors.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 10 }}>
          <Disc3 size={24} /> Колесо удачи — Настройки
        </h1>
        <p style={{ color: colors.textMuted, fontSize: 15, margin: 0 }}>
          Управление сегментами, вероятностями и бонусами
          <span style={{
            marginLeft: 12, padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: source === "database" ? "rgba(34,197,94,0.15)" : "rgba(255,230,0,0.12)",
            color: source === "database" ? colors.success : colors.accent,
          }}>
            {source === "database" ? "Из базы данных" : "По умолчанию"}
          </span>
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showPreview ? "1fr 340px" : "1fr", gap: 24 }}>
        {/* Left: Segments table */}
        <div>
          {/* Toolbar */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 16, flexWrap: "wrap", gap: 8,
          }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={addSegment} style={btnStyle(colors.accent, "#0a0f1a")}>
                <Plus size={16} /> Добавить
              </button>
              <button onClick={autoBalance} style={btnStyle("#1c2a3a", colors.text)}>
                Авто-баланс
              </button>
              <button onClick={handleReset} style={btnStyle("#1c2a3a", colors.textMuted)}>
                <RotateCcw size={14} /> Сброс
              </button>
            </div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              style={{ ...btnStyle("#1c2a3a", colors.text), opacity: 0.8 }}
            >
              <Eye size={14} /> {showPreview ? "Скрыть" : "Показать"} превью
            </button>
          </div>

          {/* Probability bar */}
          <div style={{
            background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12,
            padding: 16, marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: colors.textMuted }}>Распределение вероятностей</span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: Math.abs(totalProbability - 1.0) < 0.01 ? colors.success : colors.danger,
              }}>
                {(totalProbability * 100).toFixed(1)}% / 100%
              </span>
            </div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "#1c2a3a" }}>
              {segments.map((seg, i) => (
                <div key={i} style={{
                  width: `${seg.probability * 100}%`, background: seg.color,
                  transition: "width 0.3s",
                }} />
              ))}
            </div>
          </div>

          {/* Segments list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {segments.map((seg, idx) => (
              <div key={idx} style={{
                display: "grid",
                gridTemplateColumns: "36px 40px 1fr 90px 90px 100px 36px",
                minWidth: 540, /* scroll on mobile */
                gap: 8, alignItems: "center",
                background: colors.cardBg, border: `1px solid ${colors.border}`,
                borderRadius: 12, padding: "12px 14px",
              }}>
                {/* Index */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: colors.textMuted }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>#{idx + 1}</span>
                </div>

                {/* Color picker */}
                <div style={{ position: "relative" }}>
                  <input
                    type="color"
                    value={seg.color}
                    onChange={e => updateSegment(idx, "color", e.target.value)}
                    style={{
                      width: 36, height: 36, borderRadius: 8, border: "2px solid " + colors.border,
                      cursor: "pointer", padding: 0, background: "transparent",
                    }}
                  />
                </div>

                {/* Label */}
                <input
                  value={seg.label}
                  onChange={e => updateSegment(idx, "label", e.target.value)}
                  placeholder="Название"
                  style={inputStyle(colors)}
                />

                {/* Bonus value */}
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    min={0}
                    value={seg.value}
                    onChange={e => updateSegment(idx, "value", parseInt(e.target.value) || 0)}
                    style={{ ...inputStyle(colors), paddingRight: 36 }}
                  />
                  <span style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    fontSize: 11, color: colors.textMuted, fontWeight: 600,
                  }}>KGS</span>
                </div>

                {/* Prize type */}
                <select
                  value={seg.prize_type || (seg.value > 0 ? "bonus" : "none")}
                  onChange={e => updateSegment(idx, "prize_type", e.target.value)}
                  style={{
                    ...inputStyle(colors),
                    cursor: "pointer", fontSize: 12, padding: "8px 6px",
                    appearance: "auto",
                    color: seg.prize_type === "physical" ? "#a855f7"
                      : seg.prize_type === "bonus" || (!seg.prize_type && seg.value > 0) ? colors.success
                      : colors.textMuted,
                  }}
                >
                  <option value="bonus">💰 Бонус</option>
                  <option value="physical">🎁 Приз</option>
                  <option value="none">— Пусто</option>
                </select>

                {/* Probability */}
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={+(seg.probability * 100).toFixed(1)}
                    onChange={e => {
                      const pct = parseFloat(e.target.value) || 0;
                      updateSegment(idx, "probability", +(pct / 100).toFixed(4));
                    }}
                    style={{ ...inputStyle(colors), paddingRight: 24 }}
                  />
                  <span style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    fontSize: 12, color: colors.textMuted, fontWeight: 600,
                  }}>%</span>
                </div>

                {/* Delete */}
                <button
                  onClick={() => removeSegment(idx)}
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: "none",
                    background: "rgba(239,68,68,0.1)", color: colors.danger,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {/* Validation warning */}
          {!isValid && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              marginTop: 16, padding: "12px 16px", borderRadius: 10,
              background: "rgba(239,68,68,0.08)", color: colors.danger, fontSize: 13,
            }}>
              <AlertTriangle size={16} />
              {segments.length < 2
                ? "Минимум 2 сегмента"
                : segments.length > 12
                  ? "Максимум 12 сегментов"
                  : `Сумма вероятностей: ${(totalProbability * 100).toFixed(1)}% — должна быть ровно 100%`
              }
            </div>
          )}

          {/* Save button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, position: "sticky", bottom: 24, zIndex: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving || !isValid}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: isValid ? colors.accent : "#333",
                color: isValid ? "#0a0f1a" : "#666",
                border: "none", borderRadius: 12, padding: "16px 32px",
                fontSize: 16, fontWeight: 700, cursor: isValid ? "pointer" : "not-allowed",
                boxShadow: isValid ? "0 4px 20px rgba(255,230,0,0.3)" : "none",
                opacity: saving ? 0.7 : 1, transition: "all 0.2s",
              }}
            >
              <Save size={20} />
              {saving ? "Сохранение..." : "Сохранить конфигурацию"}
            </button>
          </div>
        </div>

        {/* Right: Wheel preview */}
        {showPreview && (
          <div style={{
            background: colors.cardBg, border: `1px solid ${colors.border}`,
            borderRadius: 16, padding: 24, height: "fit-content", position: "sticky", top: 24,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 16, textAlign: "center" }}>
              Превью колеса
            </h3>
            <WheelPreview segments={segments} />
            <div style={{ marginTop: 16 }}>
              {segments.map((seg, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 0", fontSize: 13,
                  borderBottom: i < segments.length - 1 ? `1px solid ${colors.border}` : "none",
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: colors.text }}>{seg.label}</span>
                  <span style={{ color: seg.prize_type === "physical" ? "#a855f7" : colors.textMuted, fontWeight: 600 }}>
                    {seg.prize_type === "physical" ? "🎁" : seg.value > 0 ? `+${seg.value}` : "—"}
                  </span>
                  <span style={{ color: colors.accent, fontWeight: 700, width: 45, textAlign: "right" }}>
                    {(seg.probability * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{`
        @media (max-width: 767px) {
          [style*="1fr 340px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Wheel SVG Preview ───
function WheelPreview({ segments }: { segments: Segment[] }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const total = segments.reduce((s, seg) => s + seg.probability, 0) || 1;

  let startAngle = -Math.PI / 2;
  const paths: JSX.Element[] = [];
  const labels: JSX.Element[] = [];

  segments.forEach((seg, i) => {
    const sweep = (seg.probability / total) * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const large = sweep > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    paths.push(
      <path
        key={`p-${i}`}
        d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
        fill={seg.color}
        stroke="#0d1117"
        strokeWidth={2}
      />
    );

    // Label
    const midAngle = startAngle + sweep / 2;
    const lr = r * 0.62;
    const lx = cx + lr * Math.cos(midAngle);
    const ly = cy + lr * Math.sin(midAngle);
    const rotation = (midAngle * 180) / Math.PI + 90;

    if (sweep > 0.15) {
      labels.push(
        <text
          key={`t-${i}`}
          x={lx} y={ly}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${rotation}, ${lx}, ${ly})`}
          style={{ fontSize: 10, fontWeight: 700, fill: "#000", pointerEvents: "none" }}
        >
          {seg.label.length > 10 ? seg.label.slice(0, 9) + "…" : seg.label}
        </text>
      );
    }

    startAngle = endAngle;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      {labels}
      {/* Center circle */}
      <circle cx={cx} cy={cy} r={22} fill="#0d1117" stroke="#1c2a3a" strokeWidth={2} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 10, fontWeight: 700, fill: "#FFE600" }}>
        SPIN
      </text>
      {/* Pointer */}
      <polygon points={`${cx - 8},6 ${cx + 8},6 ${cx},22`} fill="#FFE600" stroke="#0d1117" strokeWidth={1} />
    </svg>
  );
}

// ─── Shared styles ───
function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6,
    background: bg, color, border: "none", borderRadius: 8,
    padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  };
}

function inputStyle(colors: { bg: string; border: string; text: string }): React.CSSProperties {
  return {
    width: "100%", background: colors.bg, border: `1px solid ${colors.border}`,
    borderRadius: 8, color: colors.text, padding: "8px 12px", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };
}
