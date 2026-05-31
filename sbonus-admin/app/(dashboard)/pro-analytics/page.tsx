'use client';
import { useEffect, useState, useCallback } from 'react';
import { biAPI } from '@/lib/api';
import {
  Brain, Loader2, Send, Download, Shield, AlertTriangle, Users, Target,
  TrendingUp, Crown, Star, Ban, ShieldCheck, UserPlus, Search, RotateCcw, Phone,
  Zap, Eye, DollarSign, BarChart3, PieChart as PieIcon, Clock, Hash,
  Award, ChevronDown, ChevronUp, FileSpreadsheet, MessageCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';

const tooltipStyle = {
  background: '#141c2b', border: '1px solid #1e293b', borderRadius: 10,
  color: '#e2eaf6', fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  padding: '10px 14px',
};
const fmt = (v: number) => Number(v).toLocaleString('ru-RU');
const fmtMoney = (v: number) => fmt(Math.round(v)) + ' сом';
const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return fmt(v);
};

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Аренда', salary: 'Зарплата', utilities: 'Коммунальные', transport: 'Транспорт',
  marketing: 'Маркетинг', equipment: 'Оборудование', supplies: 'Расходные', taxes: 'Налоги',
  insurance: 'Страхование', communication: 'Связь', maintenance: 'Ремонт', other: 'Прочие',
};

const GRADE_COLORS: Record<string, string> = {
  'A+': '#22c55e', 'A': '#3b82f6', 'B': '#f59e0b', 'C': '#ef4444', 'D': '#64748b',
};

const RISK_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#22c55e',
};

type Tab = 'telegram' | 'excel' | 'budget' | 'debts' | 'kpi' | 'rfm';

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// ─── KPI Card ───
function KpiCard({ icon: Icon, label, value, sub, color = '#FFE600' }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14,
      padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'center',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#8899aa', fontSize: 11, marginBottom: 2 }}>{label}</div>
        <div style={{ color: '#e2eaf6', fontSize: 18, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ color: '#5e6e82', fontSize: 10, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  TELEGRAM TAB
// ═══════════════════════════════════════
function TelegramTab({ month }: { month: string }) {
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setLoading(true);
    biAPI.tgPnlPreview(month).then(r => {
      setPreview(r.data.preview);
    }).catch(() => setPreview('Ошибка загрузки')).finally(() => setLoading(false));
  }, [month]);

  const handleSend = async () => {
    setSending(true);
    try {
      await biAPI.tgPnlSend(month);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch {}
    setSending(false);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        {/* Info */}
        <div style={{
          background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14,
          padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <MessageCircle size={20} color="#3b82f6" />
            <span style={{ color: '#e2eaf6', fontWeight: 600, fontSize: 15 }}>Telegram P&L Отчёт</span>
          </div>
          <div style={{ color: '#8899aa', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
            Автоматический P&L отчёт отправляется в Telegram каждый день в <b style={{ color: '#FFE600' }}>21:30</b>.
            Вы также можете отправить его вручную прямо сейчас.
          </div>
          <button onClick={handleSend} disabled={sending} style={{
            background: sending ? '#1e293b' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            border: 'none', borderRadius: 10, padding: '12px 24px',
            color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sent ? 'Отправлено!' : (sending ? 'Отправка...' : 'Отправить сейчас')}
          </button>
        </div>

        {/* Preview */}
        <div style={{
          background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14,
          padding: 20,
        }}>
          <div style={{ color: '#8899aa', fontSize: 12, marginBottom: 10 }}>Предпросмотр сообщения:</div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Loader2 size={24} color="#FFE600" className="animate-spin" />
            </div>
          ) : (
            <div style={{
              background: '#1a2332', borderRadius: 12, padding: 16, fontFamily: 'monospace',
              fontSize: 13, lineHeight: 1.7, color: '#c8d6e5', whiteSpace: 'pre-wrap',
              border: '1px solid #2a3a4e',
            }} dangerouslySetInnerHTML={{ __html: preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>') }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  EXCEL TAB
// ═══════════════════════════════════════
function ExcelTab({ month }: { month: string }) {
  const [downloading, setDownloading] = useState(false);
  const [months, setMonths] = useState(3);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await biAPI.exportExcel(month, months);
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PnL_SmartCentr_${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setDownloading(false);
  };

  return (
    <div style={{
      background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 24,
      maxWidth: 500,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <FileSpreadsheet size={24} color="#22c55e" />
        <span style={{ color: '#e2eaf6', fontWeight: 600, fontSize: 16 }}>Экспорт P&L в Excel</span>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ color: '#8899aa', fontSize: 12, marginBottom: 8 }}>Количество месяцев:</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 3, 6, 12].map(n => (
            <button key={n} onClick={() => setMonths(n)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: months === n ? '#FFE600' : '#1e293b',
              color: months === n ? '#080e1a' : '#8899aa',
              fontWeight: 600, fontSize: 13,
            }}>{n} мес.</button>
          ))}
        </div>
      </div>

      <div style={{ color: '#5e6e82', fontSize: 12, marginBottom: 16 }}>
        Файл будет содержать P&L отчёт и расходы по категориям за {months} мес.
      </div>

      <button onClick={handleDownload} disabled={downloading} style={{
        width: '100%', padding: '14px',
        background: downloading ? '#1e293b' : 'linear-gradient(135deg, #22c55e, #16a34a)',
        border: 'none', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 14,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {downloading ? 'Скачивание...' : 'Скачать Excel'}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════
//  BUDGET TAB
// ═══════════════════════════════════════
function BudgetTab({ month }: { month: string }) {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCat, setEditCat] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    biAPI.budgets(month).then(r => setBudgets(r.data.budgets || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (cat: string) => {
    if (!editAmount || parseFloat(editAmount) <= 0) return;
    setSaving(true);
    try {
      await biAPI.setBudget({ category: cat, limit_amount: parseFloat(editAmount), month });
      setEditCat('');
      setEditAmount('');
      load();
    } catch {}
    setSaving(false);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Loader2 size={28} color="#FFE600" className="animate-spin" /></div>;

  const alerts = budgets.filter(b => b.status === 'exceeded' || b.status === 'warning');
  const totalActual = budgets.reduce((s, b) => s + (b.actual || 0), 0);
  const totalLimit = budgets.reduce((s, b) => s + (b.limit || 0), 0);

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 16, textAlign: 'center' }}>
          <div style={{ color: '#5e6e82', fontSize: 11, marginBottom: 4 }}>ФАКТ РАСХОДОВ</div>
          <div style={{ color: '#ef4444', fontSize: 20, fontWeight: 700 }}>{fmtMoney(totalActual)}</div>
        </div>
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 16, textAlign: 'center' }}>
          <div style={{ color: '#5e6e82', fontSize: 11, marginBottom: 4 }}>ОБЩИЙ ЛИМИТ</div>
          <div style={{ color: totalLimit > 0 ? '#FFE600' : '#3a4a5e', fontSize: 20, fontWeight: 700 }}>{totalLimit > 0 ? fmtMoney(totalLimit) : '—'}</div>
        </div>
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 16, textAlign: 'center' }}>
          <div style={{ color: '#5e6e82', fontSize: 11, marginBottom: 4 }}>ПРЕВЫШЕНИЯ</div>
          <div style={{ color: alerts.length > 0 ? '#ef4444' : '#22c55e', fontSize: 20, fontWeight: 700 }}>{alerts.length}</div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{
          background: '#1c1207', border: '1px solid #f59e0b33', borderRadius: 14,
          padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#f59e0b', fontWeight: 600, fontSize: 14 }}>
            <AlertTriangle size={18} /> Превышения бюджета ({alerts.length})
          </div>
          {alerts.map(a => (
            <div key={a.category} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0', borderBottom: '1px solid #2a2010',
            }}>
              <span style={{ color: '#e2eaf6', fontSize: 13 }}>{a.label}</span>
              <span style={{ color: a.status === 'exceeded' ? '#ef4444' : '#f59e0b', fontSize: 13, fontWeight: 600 }}>
                {a.percent}% ({fmtMoney(a.actual)} / {fmtMoney(a.limit)})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {budgets.length === 0 && (
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <div style={{ color: '#5e6e82', fontSize: 14, marginBottom: 8 }}>Нет расходов за этот месяц</div>
          <div style={{ color: '#3a4a5e', fontSize: 12 }}>Добавьте расходы в разделе P&L Финансы</div>
        </div>
      )}

      {/* Budget table — uses REAL categories from API */}
      {budgets.length > 0 && (
      <div style={{
        background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 50px',
          padding: '12px 16px', background: '#141c2b', gap: 8,
          fontSize: 11, color: '#5e6e82', fontWeight: 600, textTransform: 'uppercase',
        }}>
          <div>Категория</div><div style={{ textAlign: 'right' }}>Лимит</div>
          <div style={{ textAlign: 'right' }}>Факт</div><div style={{ textAlign: 'center' }}>Использовано</div><div></div>
        </div>
        {budgets.map(b => {
          const isEdit = editCat === b.category;
          return (
            <div key={b.category} style={{
              display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 50px',
              padding: '10px 16px', borderTop: '1px solid #1e293b22', gap: 8, alignItems: 'center',
            }}>
              <div style={{ color: '#e2eaf6', fontSize: 13, fontWeight: 500 }}>{b.label}</div>
              <div style={{ textAlign: 'right' }}>
                {isEdit ? (
                  <input value={editAmount} onChange={e => setEditAmount(e.target.value)}
                    type="number" placeholder="0" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(b.category); if (e.key === 'Escape') { setEditCat(''); setEditAmount(''); } }}
                    style={{
                      width: 90, background: '#1a2332', border: '1px solid #FFE600', borderRadius: 6,
                      color: '#e2eaf6', padding: '4px 6px', fontSize: 12, textAlign: 'right',
                    }} />
                ) : (
                  <span style={{ color: b.limit > 0 ? '#FFE600' : '#3a4a5e', fontSize: 13, fontWeight: b.limit > 0 ? 600 : 400 }}>
                    {b.limit > 0 ? fmtMoney(b.limit) : '—'}
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right', color: b.actual > 0 ? '#ef4444' : '#3a4a5e', fontSize: 13, fontWeight: b.actual > 0 ? 600 : 400 }}>
                {b.actual > 0 ? fmtMoney(b.actual) : '—'}
              </div>
              <div style={{ textAlign: 'center' }}>
                {b.limit > 0 ? (
                  <div style={{
                    background: '#1a2332', borderRadius: 20, height: 22, overflow: 'hidden', position: 'relative',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 20,
                      width: `${Math.min(b.percent, 100)}%`,
                      background: b.status === 'exceeded' ? '#ef4444' : (b.status === 'warning' ? '#f59e0b' : '#22c55e'),
                      transition: 'width 0.5s',
                    }} />
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center',
                      fontSize: 10, lineHeight: '22px', color: '#fff', fontWeight: 600,
                    }}>{b.percent}%</span>
                  </div>
                ) : (
                  <span style={{ color: '#3a4a5e', fontSize: 11 }}>Нет лимита</span>
                )}
              </div>
              <div style={{ textAlign: 'center' }}>
                {isEdit ? (
                  <button onClick={() => handleSave(b.category)} disabled={saving} style={{
                    background: '#22c55e', border: 'none', borderRadius: 6, color: '#fff',
                    padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                  }}>OK</button>
                ) : (
                  <button onClick={() => { setEditCat(b.category); setEditAmount(b.limit > 0 ? String(b.limit) : ''); }}
                    style={{
                      background: 'transparent', border: 'none', color: '#5e6e82', cursor: 'pointer', fontSize: 14,
                    }}>&#9998;</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
//  DEBTS TAB
// ═══════════════════════════════════════
function DebtsTab() {
  const [data, setData] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [overrideLoading, setOverrideLoading] = useState<string | null>(null);
  const [phoneCheck, setPhoneCheck] = useState('');
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  const CAT_ICONS: Record<string, any> = {
    blacklist: Ban, problematic: AlertTriangle, monitoring: Eye,
    reliable: ShieldCheck, new: UserPlus,
  };

  const loadData = useCallback(() => {
    setLoading(true);
    const params: any = { page, per_page: 30 };
    if (activeCategory) params.category = activeCategory;
    if (searchQuery) params.search = searchQuery;

    Promise.all([
      biAPI.debtsRegistry(params),
      biAPI.debtsAnalytics(),
    ]).then(([reg, ana]) => {
      setCustomers(reg.data.customers || []);
      setSummary(reg.data.summary || {});
      setTotalPages(reg.data.pages || 1);
      setTotal(reg.data.total || 0);
      setData(ana.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [page, activeCategory, searchQuery]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = () => {
    setPage(1);
    setSearchQuery(searchInput.trim());
  };

  const handleOverride = async (customerId: string, newCat: string) => {
    setOverrideLoading(customerId);
    try {
      await biAPI.debtsOverride(customerId, newCat);
      loadData();
    } catch { /* ignore */ }
    setOverrideLoading(null);
  };

  const handlePhoneCheck = async () => {
    if (!phoneCheck.trim()) return;
    setCheckLoading(true);
    try {
      const r = await biAPI.debtCheck(phoneCheck.trim());
      setCheckResult(r.data);
    } catch { setCheckResult({ found: false, message: 'Ошибка запроса' }); }
    setCheckLoading(false);
  };

  if (loading && !data) return <div style={{ textAlign: 'center', padding: 60 }}><Loader2 size={28} color="#FFE600" className="animate-spin" /></div>;

  const catOrder = ['blacklist', 'problematic', 'monitoring', 'reliable', 'new'];
  const catLabels: Record<string, string> = {
    blacklist: 'Чёрный список', problematic: 'Проблемный', monitoring: 'На контроле',
    reliable: 'Надёжный', new: 'Новый',
  };

  const scoreColor = (s: number) => s >= 70 ? '#22c55e' : s >= 45 ? '#f59e0b' : '#ef4444';
  const scoreBg = (s: number) => s >= 70 ? '#22c55e15' : s >= 45 ? '#f59e0b15' : '#ef444415';

  return (
    <div>
      {/* KPI Cards */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <KpiCard icon={DollarSign} label="Общий долг" value={fmtMoney(data.total_remaining)} color="#ef4444" />
          <KpiCard icon={Clock} label="Просрочено" value={fmtMoney(data.overdue_amount)} sub={data.overdue_count + ' дог.'} color="#f59e0b" />
          <KpiCard icon={TrendingUp} label="Оплата" value={data.paid_rate + '%'} sub={fmtMoney(data.total_paid)} color="#22c55e" />
          <KpiCard icon={Users} label="Должников" value={total} color="#3b82f6" />
        </div>
      )}

      {/* Phone Check */}
      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ color: '#e2eaf6', fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={16} /> Проверка перед рассрочкой
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={phoneCheck}
            onChange={(e) => setPhoneCheck(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePhoneCheck()}
            placeholder="Телефон или ФИО..."
            style={{
              flex: 1, background: '#141c2b', border: '1px solid #1e293b', borderRadius: 10,
              color: '#e2eaf6', padding: '10px 14px', fontSize: 14, outline: 'none',
            }}
          />
          <button onClick={handlePhoneCheck} disabled={checkLoading}
            style={{
              background: '#FFE600', color: '#000', border: 'none', borderRadius: 10,
              padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 13,
              opacity: checkLoading ? 0.5 : 1,
            }}>
            {checkLoading ? 'Проверка...' : 'Проверить'}
          </button>
        </div>

        {checkResult && (
          <div style={{
            marginTop: 12, background: '#141c2b', borderRadius: 10, padding: 14,
            border: '1px solid ' + (checkResult.recommendation?.color || '#1e293b'),
          }}>
            {!checkResult.found ? (
              <div style={{ color: '#5e6e82' }}>{checkResult.message || 'Клиент не найден'}</div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ color: '#e2eaf6', fontWeight: 600 }}>{checkResult.name}</div>
                    <div style={{ color: '#5e6e82', fontSize: 12 }}>{checkResult.phone}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      background: scoreBg(checkResult.credit_score), color: scoreColor(checkResult.credit_score),
                    }}>
                      Рейтинг: {checkResult.credit_score}/100
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#5e6e82' }}>Активных долгов<br/><span style={{ color: '#e2eaf6', fontWeight: 600, fontSize: 14 }}>{checkResult.active_debts}</span></div>
                  <div style={{ fontSize: 11, color: '#5e6e82' }}>Остаток<br/><span style={{ color: '#ef4444', fontWeight: 600, fontSize: 14 }}>{fmtMoney(checkResult.total_remaining)}</span></div>
                  <div style={{ fontSize: 11, color: '#5e6e82' }}>Просрочка<br/><span style={{ color: checkResult.max_overdue > 30 ? '#ef4444' : '#f59e0b', fontWeight: 600, fontSize: 14 }}>{checkResult.max_overdue} дн.</span></div>
                </div>
                <div style={{
                  padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: checkResult.recommendation.color + '15', color: checkResult.recommendation.color,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Shield size={14} />
                  {checkResult.recommendation.label}: {checkResult.recommendation.reason}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        <button onClick={() => { setActiveCategory(null); setPage(1); }}
          style={{
            padding: '8px 16px', borderRadius: 10, border: '1px solid ' + (!activeCategory ? '#FFE600' : '#1e293b'),
            background: !activeCategory ? '#FFE60015' : '#0d1526', color: !activeCategory ? '#FFE600' : '#5e6e82',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          Все ({Object.values(summary).reduce((s: number, c: any) => s + (c.count || 0), 0)})
        </button>
        {catOrder.map(cat => {
          const meta = summary[cat] || { count: 0, color: '#5e6e82' };
          const CatIcon = CAT_ICONS[cat] || Users;
          return (
            <button key={cat} onClick={() => { setActiveCategory(cat); setPage(1); }}
              style={{
                padding: '8px 16px', borderRadius: 10, border: '1px solid ' + (activeCategory === cat ? meta.color : '#1e293b'),
                background: activeCategory === cat ? meta.color + '15' : '#0d1526',
                color: activeCategory === cat ? meta.color : '#5e6e82',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <CatIcon size={13} />
              {catLabels[cat]} ({meta.count || 0})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#5e6e82' }} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Поиск по имени или телефону..."
            style={{
              width: '100%', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 10,
              color: '#e2eaf6', padding: '10px 14px 10px 36px', fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <button onClick={handleSearch}
          style={{
            background: '#1e293b', color: '#e2eaf6', border: 'none', borderRadius: 10,
            padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
          Найти
        </button>
      </div>

      {/* Customers table */}
      <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} color="#FFE600" className="animate-spin" /></div>
        ) : customers.length === 0 ? (
          <div style={{ color: '#5e6e82', textAlign: 'center', padding: 40 }}>Нет должников</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#5e6e82', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #1e293b' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Клиент</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Долг</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Дней</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Рейтинг</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Категория</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Рассрочка</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Действие</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: any) => {
                  const CatIcon = CAT_ICONS[c.category] || Users;
                  return (
                    <tr key={c.customer_id} style={{ borderTop: '1px solid #1e293b22' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ color: '#e2eaf6', fontWeight: 500 }}>{c.name}</div>
                        <div style={{ color: '#5e6e82', fontSize: 11 }}>{c.phone} &middot; {c.debt_count} долг(ов)</div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: '#e2eaf6', fontWeight: 600 }}>
                        {fmtMoney(c.total_remaining)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 8px', color: c.max_overdue > 60 ? '#ef4444' : c.max_overdue > 0 ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                        {c.max_overdue}
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <div style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: scoreBg(c.credit_score), color: scoreColor(c.credit_score),
                        }}>
                          {c.credit_score}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: (c.category_meta?.color || '#64748b') + '20',
                          color: c.category_meta?.color || '#64748b',
                        }}>
                          <CatIcon size={11} />
                          {c.category_meta?.label || c.category}
                          {c.admin_override && <span title="Установлено админом" style={{ fontSize: 9 }}>*</span>}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                          background: (c.recommendation?.color || '#64748b') + '15',
                          color: c.recommendation?.color || '#64748b',
                        }}>
                          {c.recommendation?.label || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <select
                          value={c.admin_override || 'auto'}
                          onChange={(e) => handleOverride(c.customer_id, e.target.value)}
                          disabled={overrideLoading === c.customer_id}
                          style={{
                            background: '#141c2b', border: '1px solid #1e293b', borderRadius: 8,
                            color: '#e2eaf6', padding: '4px 6px', fontSize: 11, cursor: 'pointer', outline: 'none',
                          }}>
                          <option value="auto">Авто</option>
                          {catOrder.map(cat => (
                            <option key={cat} value={cat}>{catLabels[cat]}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderTop: '1px solid #1e293b',
          }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{
                background: '#141c2b', border: '1px solid #1e293b', borderRadius: 8,
                color: page === 1 ? '#3a4a5e' : '#e2eaf6', padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              }}>
              Назад
            </button>
            <span style={{ color: '#5e6e82', fontSize: 12 }}>{page} из {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{
                background: '#141c2b', border: '1px solid #1e293b', borderRadius: 8,
                color: page === totalPages ? '#3a4a5e' : '#e2eaf6', padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              }}>
              Далее
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
//  CASHIER KPI TAB
// ═══════════════════════════════════════
function KpiTab({ month }: { month: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    biAPI.cashierKpi(month).then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [month]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Loader2 size={28} color="#FFE600" className="animate-spin" /></div>;
  if (!data || !data.kpis?.length) return <div style={{ color: '#5e6e82', textAlign: 'center', padding: 40 }}>Нет данных</div>;

  return (
    <div>
      {/* Team stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard icon={Users} label="Кассиров" value={data.cashier_count} color="#3b82f6" />
        <KpiCard icon={DollarSign} label="Общая выручка" value={fmtMoney(data.team_avg?.total_revenue || 0)} color="#22c55e" />
        <KpiCard icon={BarChart3} label="Средн. выручка" value={fmtMoney(data.team_avg?.avg_revenue || 0)} color="#FFE600" />
        <KpiCard icon={Hash} label="Всего чеков" value={fmt(data.team_avg?.total_txn || 0)} color="#8b5cf6" />
      </div>

      {/* Radar chart for top 5 */}
      {data.kpis.length >= 2 && (
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ color: '#e2eaf6', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
            Сравнение ТОП кассиров
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.kpis.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#5e6e82', fontSize: 11 }} domain={[0, 100]} />
              <YAxis dataKey="name" type="category" tick={{ fill: '#8899aa', fontSize: 12 }} width={100} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, 'Балл']} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="score" radius={[0, 6, 6, 0]} fill="#FFE600" name="Балл" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* KPI Table */}
      <div style={{
        background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#5e6e82', fontSize: 11, textTransform: 'uppercase', background: '#141c2b' }}>
                <th style={{ textAlign: 'center', padding: '10px 8px', width: 40 }}>#</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Кассир</th>
                <th style={{ textAlign: 'center', padding: '10px 8px' }}>Грейд</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Выручка</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Чеков</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Клиентов</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Ср. чек</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {data.kpis.map((k: any) => (
                <tr key={k.cashier_id} style={{ borderTop: '1px solid #1e293b22' }}>
                  <td style={{ textAlign: 'center', padding: '10px 8px', color: '#5e6e82' }}>
                    {k.rank <= 3 ? (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: ['linear-gradient(135deg, #FFD700, #FFA500)', 'linear-gradient(135deg, #C0C0C0, #A0A0A0)', 'linear-gradient(135deg, #CD7F32, #A0522D)'][k.rank - 1],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: '#fff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      }}>{k.rank}</div>
                    ) : <span style={{ color: '#5e6e82' }}>{k.rank}</span>}
                  </td>
                  <td style={{ padding: '10px 8px', color: '#e2eaf6', fontWeight: 500 }}>{k.name}</td>
                  <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      background: (GRADE_COLORS[k.grade] || '#64748b') + '20',
                      color: GRADE_COLORS[k.grade] || '#64748b',
                    }}>{k.grade}</span>
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px 8px', color: '#e2eaf6', fontWeight: 600 }}>
                    {fmtMoney(k.revenue)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px 8px', color: '#c8d6e5' }}>{k.txn_count}</td>
                  <td style={{ textAlign: 'right', padding: '10px 8px', color: '#c8d6e5' }}>{k.unique_customers}</td>
                  <td style={{ textAlign: 'right', padding: '10px 8px', color: '#c8d6e5' }}>{fmtMoney(k.avg_receipt)}</td>
                  <td style={{ textAlign: 'right', padding: '10px 8px' }}>
                    <span style={{
                      fontWeight: 700, fontSize: 15,
                      color: k.score >= 60 ? '#22c55e' : (k.score >= 30 ? '#f59e0b' : '#ef4444'),
                    }}>{k.score}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  RFM PRO TAB
// ═══════════════════════════════════════
function RfmTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    biAPI.rfmPro().then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Loader2 size={28} color="#FFE600" className="animate-spin" /></div>;
  if (!data?.segments) return <div style={{ color: '#5e6e82', textAlign: 'center', padding: 40 }}>Нет данных</div>;

  const segments = data.segments;
  const segOrder = ['champions', 'loyal', 'potential_loyal', 'new_customers', 'sleeping', 'at_risk', 'lost'];
  const pieData = segOrder.map(k => ({
    name: segments[k]?.label || k,
    value: segments[k]?.count || 0,
    color: segments[k]?.color || '#64748b',
  })).filter(d => d.value > 0);

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard icon={Users} label="Всего клиентов" value={fmt(data.total)} color="#3b82f6" />
        <KpiCard icon={Crown} label="Чемпионы" value={segments.champions?.count || 0}
          sub={`${segments.champions?.revenue_share || 0}% выручки`} color="#22c55e" />
        <KpiCard icon={AlertTriangle} label="Под угрозой" value={segments.at_risk?.count || 0}
          sub={`${segments.at_risk?.revenue_share || 0}% выручки`} color="#ef4444" />
        <KpiCard icon={DollarSign} label="Общая выручка" value={fmtMoney(data.total_revenue || 0)} color="#FFE600" />
      </div>

      {/* Pie chart */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16,
      }}>
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
          <div style={{ color: '#e2eaf6', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Распределение</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" name="Клиенты" cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#3a4a5e' }}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'transparent' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue share bar */}
        <div style={{ background: '#0d1526', border: '1px solid #1e293b', borderRadius: 14, padding: 20 }}>
          <div style={{ color: '#e2eaf6', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Доля выручки</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={segOrder.map(k => ({
              name: segments[k]?.label || k,
              value: segments[k]?.revenue_share || 0,
              fill: segments[k]?.color || '#64748b',
            })).filter(d => d.value > 0)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#5e6e82', fontSize: 11 }} unit="%" />
              <YAxis dataKey="name" type="category" tick={{ fill: '#8899aa', fontSize: 11 }} width={110} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`, 'Доля']} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="value" name="Доля" radius={[0, 6, 6, 0]}>
                {segOrder.map(k => <Cell key={k} fill={segments[k]?.color || '#64748b'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Segment cards */}
      {segOrder.map(key => {
        const seg = segments[key];
        if (!seg || seg.count === 0) return null;
        const isOpen = expanded === key;
        return (
          <div key={key} style={{
            background: '#0d1526', border: `1px solid ${seg.color}33`, borderRadius: 14,
            marginBottom: 10, overflow: 'hidden',
          }}>
            <div onClick={() => setExpanded(isOpen ? null : key)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer',
            }}>
              {(() => {
                const iconMap: Record<string, any> = {
                  'champions': Crown, 'loyal': Star, 'potential_loyal': Zap,
                  'new_customers': Users, 'sleeping': Clock, 'at_risk': AlertTriangle, 'lost': Eye,
                };
                const SegIcon = iconMap[key] || Target;
                return (
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: seg.color + '20', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <SegIcon size={20} color={seg.color} />
                  </div>
                );
              })()}
              <div style={{ flex: 1 }}>
                <div style={{ color: seg.color, fontWeight: 600, fontSize: 14 }}>
                  {seg.label} — {seg.count} клиентов ({seg.percent}%)
                </div>
                <div style={{ color: '#5e6e82', fontSize: 12, marginTop: 2 }}>{seg.description}</div>
              </div>
              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <div style={{ color: '#e2eaf6', fontWeight: 600, fontSize: 13 }}>{fmtMoney(seg.avg_revenue)}</div>
                <div style={{ color: '#5e6e82', fontSize: 10 }}>ср. чек</div>
              </div>
              {isOpen ? <ChevronUp size={18} color="#5e6e82" /> : <ChevronDown size={18} color="#5e6e82" />}
            </div>

            {isOpen && (
              <div style={{ padding: '0 18px 14px', borderTop: '1px solid #1e293b33' }}>
                {/* Action recommendation */}
                <div style={{
                  background: seg.color + '10', borderRadius: 10, padding: '10px 14px', marginTop: 10, marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Zap size={16} color={seg.color} />
                  <span style={{ color: seg.color, fontSize: 13, fontWeight: 500 }}>Рекомендация: {seg.action}</span>
                </div>

                {/* Top customers */}
                {seg.top_customers?.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: '#5e6e82', fontSize: 10, textTransform: 'uppercase' }}>
                          <th style={{ textAlign: 'left', padding: '6px 8px' }}>Клиент</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px' }}>Покупок</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px' }}>Сумма</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px' }}>Дней назад</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seg.top_customers.slice(0, 10).map((c: any) => (
                          <tr key={c.id} style={{ borderTop: '1px solid #1e293b22' }}>
                            <td style={{ padding: '6px 8px', color: '#e2eaf6' }}>
                              <div>{c.name}</div>
                              <div style={{ color: '#3a4a5e', fontSize: 10 }}>{c.phone}</div>
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 8px', color: '#c8d6e5' }}>{c.frequency}</td>
                            <td style={{ textAlign: 'right', padding: '6px 8px', color: '#c8d6e5' }}>{fmtMoney(c.monetary)}</td>
                            <td style={{ textAlign: 'right', padding: '6px 8px', color: c.days_ago > 60 ? '#ef4444' : '#8899aa' }}>
                              {c.days_ago ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ═══════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════
export default function ProAnalyticsPage() {
  const [tab, setTab] = useState<Tab>('rfm');
  const [month, setMonth] = useState(getCurrentMonth());

  const tabs = [
    { key: 'rfm' as const, label: 'RFM Клиенты', icon: Target },
    { key: 'kpi' as const, label: 'KPI Кассиры', icon: Award },
    { key: 'debts' as const, label: 'Долги', icon: AlertTriangle },
    { key: 'budget' as const, label: 'Бюджет', icon: Shield },
    { key: 'telegram' as const, label: 'Telegram', icon: MessageCircle },
    { key: 'excel' as const, label: 'Excel', icon: FileSpreadsheet },
  ];

  return (
    <div className="page-root" style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: '#e2eaf6', fontSize: 22, fontWeight: 700, margin: 0 }}>PRO Аналитика</h1>
            <p style={{ color: '#5e6e82', fontSize: 12, margin: 0 }}>Бизнес-аналитика для руководителя</p>
          </div>
        </div>
        {tab !== 'debts' && tab !== 'rfm' && (
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{
              background: '#141c2b', border: '1px solid #1e293b', borderRadius: 8,
              color: '#e2eaf6', padding: '8px 12px', fontSize: 13,
            }} />
        )}
      </div>

      {/* Tabs */}
      <div className="mobile-tab-bar" style={{
        display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 20,
        background: '#0d1526', borderRadius: 12, padding: 4, border: '1px solid #1e293b',
      }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
              border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
              background: active ? '#FFE60015' : 'transparent',
              color: active ? '#FFE600' : '#5e6e82',
              fontWeight: active ? 600 : 400, fontSize: 13,
              transition: 'all 0.2s',
            }}>
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === 'telegram' && <TelegramTab month={month} />}
      {tab === 'excel' && <ExcelTab month={month} />}
      {tab === 'budget' && <BudgetTab month={month} />}
      {tab === 'debts' && <DebtsTab />}
      {tab === 'kpi' && <KpiTab month={month} />}
      {tab === 'rfm' && <RfmTab />}
    </div>
  );
}
