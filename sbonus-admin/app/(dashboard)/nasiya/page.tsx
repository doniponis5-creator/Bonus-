"use client";
/**
 * NASIYA DAFTAR — admin sahifa.
 * Yangi fayl: sbonus-admin/app/(dashboard)/nasiya/page.tsx
 *
 * ⚠️ api importi: loyihangizdagi axios instance bilan moslang.
 *    named export bo'lsa:   import api from "@/lib/api";
 *    default export bo'lsa:  import api from "@/lib/api";
 *    BASE yo'llari api baseURL'ida /api/v1 bo'lishini taxmin qiladi.
 */
import { useEffect, useState, useCallback, type ReactNode } from "react";
import api from "@/lib/api";
import {
  Plus, Search, Phone, Calendar, Trash2, Send, X, Wallet,
  AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";

const BASE = "/api/v1/admin/nasiya";

type Status = "active" | "overdue" | "paid";

interface Debt {
  id: string;
  debtor_name: string;
  debtor_phone: string;
  principal_amount: number;
  paid_amount: number;
  remaining: number;
  lent_date: string | null;
  due_date: string | null;
  status: Status;
  days_left: number | null;
  note: string | null;
  last_reminder_at: string | null;
}
interface Payment { id: string; amount: number; paid_at: string | null; note: string | null; }
interface DebtDetail extends Debt { payments: Payment[]; }
interface Summary {
  outstanding: number; active_count: number; overdue_count: number;
  overdue_amount: number; total_lent: number; total_collected: number;
}

const som = (n: number) =>
  (n || 0).toLocaleString("ru-RU").replace(/,/g, " ") + " som";

const today = () => new Date().toISOString().slice(0, 10);

export default function NasiyaPage() {
  const [tab, setTab] = useState<"active" | "overdue" | "paid" | "all">("active");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Debt[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<DebtDetail | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const flash = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadSummary = useCallback(async () => {
    try { setSummary((await api.get(`${BASE}/summary`)).data); } catch {}
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE, { params: { status: tab, q: q || undefined } });
      setItems(data.items || []);
    } catch { flash("Ro'yxat yuklanmadi", false); }
    finally { setLoading(false); }
  }, [tab, q]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    const t = setTimeout(loadList, 250); // search debounce
    return () => clearTimeout(t);
  }, [loadList]);

  const openDetail = async (id: string) => {
    try { setDetail((await api.get(`${BASE}/${id}`)).data); }
    catch { flash("Ma'lumot yuklanmadi", false); }
  };

  const refreshAll = () => { loadList(); loadSummary(); };

  // ── summary cards ──
  const cards = [
    { label: "Odamlarda (qoldiq)", value: summary ? som(summary.outstanding) : "—", icon: Wallet, color: "text-emerald-400" },
    { label: "Faol nasiyalar", value: summary ? String(summary.active_count) : "—", icon: Clock, color: "text-sky-400" },
    { label: "Kechikkan", value: summary ? `${summary.overdue_count} (${som(summary.overdue_amount)})` : "—", icon: AlertTriangle, color: "text-red-400" },
    { label: "Jami yig'ilgan", value: summary ? som(summary.total_collected) : "—", icon: CheckCircle2, color: "text-violet-400" },
  ];

  return (
    <div className="p-6 space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nasiya daftar</h1>
          <p className="text-slate-400 text-sm">Shaxsiy qarzlar — kim qancha, qachon to'laydi</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl font-medium transition"
        >
          <Plus size={18} /> Yangi qarz
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">{c.label}</span>
              <c.icon size={18} className={c.color} />
            </div>
            <div className="text-xl font-bold mt-2">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-800/60 border border-slate-700 rounded-xl p-1">
          {(["active", "overdue", "paid", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${
                tab === t ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t === "active" ? "Faol" : t === "overdue" ? "Kechikkan" : t === "paid" ? "Yopilgan" : "Hammasi"}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ism yoki telefon..."
            className="bg-slate-800/60 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm w-full sm:w-64 outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/80 text-slate-400">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Ism</th>
              <th className="text-left px-4 py-3 font-medium">Telefon</th>
              <th className="text-right px-4 py-3 font-medium">Summa</th>
              <th className="text-right px-4 py-3 font-medium">Qoldiq</th>
              <th className="text-left px-4 py-3 font-medium">Srok</th>
              <th className="text-center px-4 py-3 font-medium">Holat</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-500">Yuklanmoqda...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-500">Nasiya yo'q</td></tr>
            ) : items.map((d) => (
              <tr
                key={d.id}
                onClick={() => openDetail(d.id)}
                className="border-t border-slate-700/60 hover:bg-slate-700/30 cursor-pointer transition"
              >
                <td className="px-4 py-3 font-medium">{d.debtor_name}</td>
                <td className="px-4 py-3 text-slate-400">{d.debtor_phone}</td>
                <td className="px-4 py-3 text-right">{som(d.principal_amount)}</td>
                <td className="px-4 py-3 text-right font-semibold">{som(d.remaining)}</td>
                <td className="px-4 py-3">{d.due_date}</td>
                <td className="px-4 py-3 text-center"><StatusBadge d={d} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refreshAll(); flash("Qo'shildi"); }}
          onError={(m) => flash(m, false)}
        />
      )}

      {detail && (
        <DetailModal
          debt={detail}
          onClose={() => setDetail(null)}
          reload={async () => { await openDetail(detail.id); refreshAll(); }}
          flash={flash}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ d }: { d: Debt }) {
  if (d.status === "paid")
    return <span className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs">Yopildi</span>;
  if (d.status === "overdue")
    return <span className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs">
      Kechikkan {d.days_left != null ? `${Math.abs(d.days_left)}k` : ""}
    </span>;
  return <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs">
    {d.days_left != null ? `${d.days_left} kun` : "Faol"}
  </span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-slate-400 text-sm">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
const inputCls =
  "w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-emerald-500";

function CreateModal({
  onClose, onSaved, onError,
}: { onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({
    debtor_name: "", debtor_phone: "+996", principal_amount: "",
    due_date: "", lent_date: today(), note: "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.debtor_name.trim() || !f.debtor_phone.trim() || !f.principal_amount || !f.due_date) {
      onError("Ism, telefon, summa va srok majburiy"); return;
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
      onSaved();
    } catch (e: any) {
      onError(e?.response?.data?.detail || "Saqlanmadi");
    } finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title="Yangi nasiya">
      <div className="space-y-3">
        <Field label="Ism familiya (FIO)">
          <input className={inputCls} value={f.debtor_name}
            onChange={(e) => setF({ ...f, debtor_name: e.target.value })} placeholder="Aliyev Vali" />
        </Field>
        <Field label="Telefon">
          <input className={inputCls} value={f.debtor_phone}
            onChange={(e) => setF({ ...f, debtor_phone: e.target.value })} placeholder="+996700123456" />
        </Field>
        <Field label="Summa (som)">
          <input className={inputCls} type="number" value={f.principal_amount}
            onChange={(e) => setF({ ...f, principal_amount: e.target.value })} placeholder="10000" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qarz berilgan sana">
            <input className={inputCls} type="date" value={f.lent_date}
              onChange={(e) => setF({ ...f, lent_date: e.target.value })} />
          </Field>
          <Field label="To'lov sanasi (srok)">
            <input className={inputCls} type="date" value={f.due_date}
              onChange={(e) => setF({ ...f, due_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Izoh (ixtiyoriy)">
          <input className={inputCls} value={f.note}
            onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="masalan: telefon uchun" />
        </Field>
        <button onClick={save} disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 rounded-xl font-medium transition">
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </button>
      </div>
    </Modal>
  );
}

function DetailModal({
  debt, onClose, reload, flash,
}: {
  debt: DebtDetail; onClose: () => void;
  reload: () => Promise<void>; flash: (m: string, ok?: boolean) => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const addPayment = async () => {
    const val = Number(amount);
    if (!val || val <= 0) { flash("Summani kiriting", false); return; }
    setBusy(true);
    try {
      await api.post(`${BASE}/${debt.id}/payments`, { amount: val });
      setAmount(""); await reload(); flash("To'lov qo'shildi");
    } catch (e: any) { flash(e?.response?.data?.detail || "Xato", false); }
    finally { setBusy(false); }
  };

  const remind = async () => {
    setBusy(true);
    try { await api.post(`${BASE}/${debt.id}/remind`); flash("Eslatma yuborildi"); await reload(); }
    catch (e: any) { flash(e?.response?.data?.detail || "Yuborilmadi", false); }
    finally { setBusy(false); }
  };

  const removeDebt = async () => {
    if (!confirm("Bu nasiyani o'chirasizmi?")) return;
    setBusy(true);
    try { await api.delete(`${BASE}/${debt.id}`); flash("O'chirildi"); onClose(); await reload(); }
    catch { flash("O'chirilmadi", false); }
    finally { setBusy(false); }
  };

  const delPayment = async (pid: string) => {
    setBusy(true);
    try { await api.delete(`${BASE}/${debt.id}/payments/${pid}`); await reload(); flash("To'lov o'chirildi"); }
    catch { flash("Xato", false); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title={debt.debtor_name}>
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span className="flex items-center gap-1"><Phone size={14} /> {debt.debtor_phone}</span>
          <span className="flex items-center gap-1"><Calendar size={14} /> srok {debt.due_date}</span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-900 rounded-xl p-3">
            <div className="text-xs text-slate-500">Summa</div>
            <div className="font-semibold">{som(debt.principal_amount)}</div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3">
            <div className="text-xs text-slate-500">To'langan</div>
            <div className="font-semibold text-emerald-400">{som(debt.paid_amount)}</div>
          </div>
          <div className="bg-slate-900 rounded-xl p-3">
            <div className="text-xs text-slate-500">Qoldiq</div>
            <div className="font-semibold text-amber-400">{som(debt.remaining)}</div>
          </div>
        </div>

        {debt.note && <p className="text-sm text-slate-400">📝 {debt.note}</p>}

        {debt.status !== "paid" && (
          <div className="flex gap-2">
            <input
              className={inputCls} type="number" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="To'lov summasi (som)"
            />
            <button onClick={addPayment} disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 rounded-xl font-medium whitespace-nowrap">
              To'lov +
            </button>
          </div>
        )}

        {/* payments */}
        <div>
          <div className="text-sm text-slate-400 mb-2">To'lovlar tarixi</div>
          {debt.payments.length === 0 ? (
            <p className="text-slate-500 text-sm">Hali to'lov yo'q</p>
          ) : (
            <div className="space-y-1">
              {debt.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2 text-sm">
                  <span>{som(p.amount)}</span>
                  <span className="text-slate-500">{p.paid_at?.slice(0, 10)}</span>
                  <button onClick={() => delPayment(p.id)} className="text-slate-500 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-slate-700">
          {debt.status !== "paid" && (
            <button onClick={remind} disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 py-2 rounded-xl">
              <Send size={16} /> WhatsApp eslatma
            </button>
          )}
          <button onClick={removeDebt} disabled={busy}
            className="flex items-center justify-center gap-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 px-4 py-2 rounded-xl">
            <Trash2 size={16} /> O'chirish
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
