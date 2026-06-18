"use client";
/**
 * NASIYA DAFTAR — admin sahifa (Design System v3: .card / .btn / .input / .table / StatsCard).
 * Fayl: sbonus-admin/app/(dashboard)/nasiya/page.tsx
 */
import { useEffect, useState, useCallback, type ReactNode } from "react";
import api from "@/lib/api";
import { useToast } from "@/components/Toast";
import StatsCard from "@/components/StatsCard";
import {
  Plus, Phone, Calendar, Trash2, Send, X,
  Wallet, AlertTriangle, CheckCircle2, Clock, Loader2,
} from "lucide-react";

const BASE = "/api/v1/admin/nasiya";

const money = (v: any) =>
  (Number(v) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " сом";
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("ru-RU") : "—";
const todayISO = () => new Date().toISOString().slice(0, 10);

type Status = "active" | "overdue" | "paid";
interface Debt {
  id: string; debtor_name: string; debtor_phone: string;
  principal_amount: number; paid_amount: number; remaining: number;
  lent_date: string | null; due_date: string | null;
  status: Status; days_left: number | null; note: string | null;
  last_reminder_at: string | null;
}
interface Payment { id: string; amount: number; paid_at: string | null; note: string | null; }
interface DebtDetail extends Debt { payments: Payment[]; }
interface Summary {
  outstanding: number; active_count: number; overdue_count: number;
  overdue_amount: number; total_lent: number; total_collected: number;
}

const TABS: { k: "active" | "overdue" | "paid" | "all"; label: string }[] = [
  { k: "active", label: "Активные" },
  { k: "overdue", label: "Просроченные" },
  { k: "paid", label: "Закрытые" },
  { k: "all", label: "Все" },
];

function StatusBadge({ d }: { d: Debt }) {
  if (d.status === "paid") return <span className="badge badge-gray">Закрыт</span>;
  if (d.status === "overdue")
    return <span className="badge badge-red">Просрочен {Math.abs(d.days_left ?? 0)} дн.</span>;
  return <span className="badge badge-green">{d.days_left ?? 0} дн.</span>;
}

export default function NasiyaPage() {
  const { toast, confirm } = useToast();
  const [tab, setTab] = useState<"active" | "overdue" | "paid" | "all">("active");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Debt[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<DebtDetail | null>(null);

  const loadSummary = useCallback(async () => {
    try { setSummary((await api.get(`${BASE}/summary`)).data); } catch {}
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE, { params: { status: tab, q: q || undefined } });
      setItems(data.items || []);
    } catch { toast("error", "Не удалось загрузить список"); }
    finally { setLoading(false); }
  }, [tab, q, toast]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    const t = setTimeout(loadList, 250);
    return () => clearTimeout(t);
  }, [loadList]);

  const openDetail = async (id: string) => {
    try { setDetail((await api.get(`${BASE}/${id}`)).data); }
    catch { toast("error", "Не удалось открыть"); }
  };
  const refreshAll = () => { loadList(); loadSummary(); };

  return (
    <>
      <div className="fade-up">
      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="h1">Насия <span style={{ color: "var(--text3)" }}>— долги</span></h1>
          <div className="caption">Личные долги — кто сколько должен и когда платит</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Новый долг
        </button>
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatsCard icon={<Wallet size={18} />} label="На руках (остаток)" value={money(summary?.outstanding ?? 0)} color="var(--accent)" />
        <StatsCard icon={<Clock size={18} />} label="Активные" value={summary?.active_count ?? 0} color="var(--info)" />
        <StatsCard icon={<AlertTriangle size={18} />} label="Просрочено" value={summary ? `${summary.overdue_count} · ${money(summary.overdue_amount)}` : "—"} color="var(--danger)" />
        <StatsCard icon={<CheckCircle2 size={18} />} label="Всего собрано" value={money(summary?.total_collected ?? 0)} color="var(--success)" />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="seg">
          {TABS.map((t) => (
            <button key={t.k} className={`seg-item ${tab === t.k ? "active" : ""}`} onClick={() => setTab(t.k)}>
              {t.label}
            </button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Имя или телефон..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Телефон</th>
              <th style={{ textAlign: "right" }}>Сумма</th>
              <th style={{ textAlign: "right" }}>Остаток</th>
              <th>Срок</th>
              <th style={{ textAlign: "center" }}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 44 }}><Loader2 size={22} className="spinner" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 44, color: "var(--text2)" }}>Долгов нет</td></tr>
            ) : items.map((d) => (
              <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => openDetail(d.id)}>
                <td style={{ fontWeight: 600 }}>{d.debtor_name}</td>
                <td style={{ color: "var(--text2)" }}>{d.debtor_phone}</td>
                <td style={{ textAlign: "right" }} className="numeric">{money(d.principal_amount)}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }} className="numeric">{money(d.remaining)}</td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(d.due_date)}</td>
                <td style={{ textAlign: "center" }}><StatusBadge d={d} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refreshAll(); }} />
      )}
      {detail && (
        <DetailModal
          debt={detail}
          onClose={() => setDetail(null)}
          reload={async () => { await openDetail(detail.id); refreshAll(); }}
          onClosed={() => { setDetail(null); refreshAll(); }}
        />
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div className="card scale-in" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--card)", zIndex: 2 }}>
          <h2 className="h2">{title}</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ debtor_name: "", debtor_phone: "+996", principal_amount: "", due_date: "", lent_date: todayISO(), note: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.debtor_name.trim() || !f.debtor_phone.trim() || !f.principal_amount || !f.due_date) {
      toast("warning", "Заполните Ф.И.О., телефон, сумму и срок"); return;
    }
    setSaving(true);
    try {
      await api.post(BASE, {
        debtor_name: f.debtor_name.trim(),
        debtor_phone: f.debtor_phone.trim(),
        principal_amount: Number(f.principal_amount),
        due_date: f.due_date,
        lent_date: f.lent_date || undefined,
        note: f.note || undefined,
      });
      toast("success", "Долг добавлен");
      onSaved();
    } catch (e: any) {
      toast("error", e?.response?.data?.detail || "Не сохранилось");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Новый долг" onClose={onClose}>
      <Field label="Ф.И.О."><input className="input" value={f.debtor_name} onChange={(e) => setF({ ...f, debtor_name: e.target.value })} placeholder="Алиев Вали" /></Field>
      <Field label="Телефон"><input className="input" value={f.debtor_phone} onChange={(e) => setF({ ...f, debtor_phone: e.target.value })} placeholder="+996700123456" /></Field>
      <Field label="Сумма (сом)"><input className="input numeric" type="number" value={f.principal_amount} onChange={(e) => setF({ ...f, principal_amount: e.target.value })} placeholder="10000" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Дата выдачи"><input className="input" type="date" value={f.lent_date} onChange={(e) => setF({ ...f, lent_date: e.target.value })} /></Field>
        <Field label="Срок оплаты"><input className="input" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
      </div>
      <Field label="Комментарий (необязательно)"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="например: за телефон" /></Field>
      <button className="btn btn-primary" style={{ width: "100%", marginTop: 4 }} onClick={save} disabled={saving}>
        {saving ? <Loader2 size={16} className="spinner" /> : null} Сохранить
      </button>
    </Modal>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="numeric" style={{ fontSize: 15, fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

function DetailModal({ debt, onClose, reload, onClosed }: {
  debt: DebtDetail; onClose: () => void; reload: () => Promise<void>; onClosed: () => void;
}) {
  const { toast, confirm } = useToast();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const addPayment = async () => {
    const val = Number(amount);
    if (!val || val <= 0) { toast("warning", "Введите сумму платежа"); return; }
    setBusy(true);
    try {
      await api.post(`${BASE}/${debt.id}/payments`, { amount: val });
      setAmount(""); await reload(); toast("success", "Платёж добавлен");
    } catch (e: any) { toast("error", e?.response?.data?.detail || "Ошибка"); }
    finally { setBusy(false); }
  };

  const remind = async () => {
    setBusy(true);
    try { await api.post(`${BASE}/${debt.id}/remind`); toast("success", "Напоминание отправлено"); await reload(); }
    catch (e: any) { toast("error", e?.response?.data?.detail || "Не отправлено"); }
    finally { setBusy(false); }
  };

  const removeDebt = async () => {
    if (!(await confirm("Удалить этот долг?"))) return;
    setBusy(true);
    try { await api.delete(`${BASE}/${debt.id}`); toast("success", "Удалено"); onClosed(); }
    catch { toast("error", "Не удалось удалить"); }
    finally { setBusy(false); }
  };

  const delPayment = async (pid: string) => {
    setBusy(true);
    try { await api.delete(`${BASE}/${debt.id}/payments/${pid}`); await reload(); toast("success", "Платёж удалён"); }
    catch { toast("error", "Ошибка"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={debt.debtor_name} onClose={onClose}>
      <div style={{ display: "flex", gap: 16, color: "var(--text2)", fontSize: 13, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Phone size={14} /> {debt.debtor_phone}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Calendar size={14} /> срок {fmtDate(debt.due_date)}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <MiniStat label="Сумма" value={money(debt.principal_amount)} />
        <MiniStat label="Оплачено" value={money(debt.paid_amount)} color="var(--success)" />
        <MiniStat label="Остаток" value={money(debt.remaining)} color="var(--warn)" />
      </div>

      {debt.note && <div className="caption" style={{ marginBottom: 16 }}>📝 {debt.note}</div>}

      {debt.status !== "paid" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <input className="input numeric" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сумма платежа (сом)" />
          <button className="btn btn-primary" style={{ whiteSpace: "nowrap" }} onClick={addPayment} disabled={busy}>Платёж +</button>
        </div>
      )}

      <div className="label" style={{ marginBottom: 8 }}>История платежей</div>
      {debt.payments.length === 0 ? (
        <div className="caption" style={{ marginBottom: 16 }}>Платежей пока нет</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {debt.payments.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px" }}>
              <span className="numeric" style={{ fontWeight: 600 }}>{money(p.amount)}</span>
              <span className="caption">{fmtDate(p.paid_at)}</span>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => delPayment(p.id)} disabled={busy}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        {debt.status !== "paid" && (
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={remind} disabled={busy}>
            <Send size={16} /> Напоминание WhatsApp
          </button>
        )}
        <button className="btn btn-danger" onClick={removeDebt} disabled={busy}>
          <Trash2 size={16} /> Удалить
        </button>
      </div>
    </Modal>
  );
}
