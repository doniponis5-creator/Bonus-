'use client';
import { Gift, Loader2, Plus, XCircle, CheckCircle2, Send, Trash2, Search, Disc } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminAPI, customersAPI } from '@/lib/api';
import { useToast } from '@/components/Toast';

const STATUS_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  pending:    { text: 'Ожидает',     color: '#ffb347', bg: '#ffb34718' },
  processing: { text: 'Обработка',   color: '#00b8d4', bg: '#00b8d418' },
  sent:       { text: 'Отправлено',  color: '#22c55e', bg: '#22c55e18' },
  cancelled:  { text: 'Отменено',    color: '#ff4d4d', bg: '#ff4d4d18' },
};

export default function CampaignsPage() {
  const { toast, confirm } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Form state
  const [campaignType, setCampaignType] = useState<'bonus' | 'wheel'>('bonus');
  const [name, setName] = useState('');
  const [bonusDate, setBonusDate] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [template, setTemplate] = useState('Здравствуйте, {name}! Вам начислен бонус +{amount} KGS. Баланс: {balance} KGS.');
  const [targetType, setTargetType] = useState<'all' | 'individual'>('all');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string; phone: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.campaigns();
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const { data } = await customersAPI.list({ search: search.trim(), page: 1, limit: 20 });
      setSearchResults(data.items || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addSelected = (c: any) => {
    if (selected.find(s => s.id === c.id)) return;
    setSelected([...selected, { id: c.id, name: c.full_name, phone: c.phone }]);
  };
  const removeSelected = (id: string) => setSelected(selected.filter(s => s.id !== id));

  const onCreate = async (e: any) => {
    e.preventDefault();
    if (!name || !bonusDate) return;
    if (campaignType === 'bonus' && !amount) return;
    if (targetType === 'individual' && selected.length === 0) {
      setMsg('error:Выберите хотя бы одного клиента');
      return;
    }
    setSaving(true); setMsg('');
    try {
      await adminAPI.createCampaign({
        name,
        campaign_type: campaignType,
        bonus_date: bonusDate,
        amount: campaignType === 'wheel' ? 0 : Number(amount),
        reason: reason || undefined,
        message_template: template || undefined,
        target_type: targetType,
        customer_ids: targetType === 'individual' ? selected.map(s => s.id) : undefined,
      });
      setMsg('success:Кампания создана');
      setCampaignType('bonus'); setName(''); setBonusDate(''); setAmount(''); setReason('');
      setSelected([]); setSearch(''); setSearchResults([]);
      load();
    } catch (er: any) {
      setMsg('error:' + (er?.response?.data?.detail?.message || 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  const onSendNow = async (id: string, n: string) => {
    if (!await confirm(`Отправить кампанию "${n}" немедленно?`)) return;
    try {
      await adminAPI.sendCampaign(id);
      toast('success', 'Кампания отправлена');
      load();
    } catch (er: any) {
      toast('error', er?.response?.data?.detail?.message || 'Ошибка отправки');
    }
  };

  const onCancel = async (id: string) => {
    if (!await confirm('Отменить кампанию?')) return;
    try {
      await adminAPI.cancelCampaign(id);
      toast('success', 'Кампания отменена');
      load();
    } catch (er: any) {
      toast('error', er?.response?.data?.detail?.message || 'Ошибка');
    }
  };

  const onDelete = async (id: string) => {
    if (!await confirm('Удалить кампанию?')) return;
    try {
      await adminAPI.deleteCampaign(id);
      toast('success', 'Кампания удалена');
      load();
    } catch (er: any) {
      toast('error', er?.response?.data?.detail?.message || 'Ошибка');
    }
  };

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800, marginBottom: 24, flexWrap: 'wrap' as any }}>
        <Gift size={24} /> Бонусные кампании
      </h1>

      {/* Список */}
      <div style={{ overflowX: 'auto', background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 16, marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {['Название', 'Дата', 'Сумма', 'Цель', 'Получатели', 'Статус', 'Действия'].map(h => (
                <th key={h} style={{ padding: '14px 16px', color: '#8899aa', fontWeight: 600, borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>
                <Loader2 className="animate-spin" style={{ marginRight: 8, display: 'inline' }} size={16} /> Загрузка...
              </td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#8899aa' }}>Кампаний пока нет</td></tr>
            )}
            {!loading && items.map(c => {
              const st = STATUS_LABEL[c.status] || STATUS_LABEL.pending;
              return (
                <tr key={c.id}>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 600, color: '#e2eaf6' }}>
                    <Link href={`/campaigns/${c.id}`} style={{ color: '#FFE600' }}>{c.name}</Link>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#e2eaf6' }}>
                    {new Date(c.bonus_date).toLocaleDateString('ru-RU')}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 14, fontWeight: 700, color: c.campaign_type === 'wheel' ? '#c084fc' : '#FFE600' }}>
                    {c.campaign_type === 'wheel' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Disc size={14} /> Спин</span>
                    ) : (
                      <>+{Number(c.amount).toLocaleString('ru-RU')} KGS</>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12, color: '#8899aa' }}>
                    {c.target_type === 'all' ? 'Все клиенты' : 'Индивидуально'}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 13, color: '#e2eaf6' }}>
                    {c.sent_count} / {c.recipients_count || '—'}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a' }}>
                    <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700 }}>
                      {st.text}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid #1c2a3a', fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.status === 'pending' && (
                        <>
                          <button onClick={() => onSendNow(c.id, c.name)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Send size={12} /> Сейчас
                          </button>
                          <button onClick={() => onCancel(c.id)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: '#ff4d4d' }}>
                            Отменить
                          </button>
                        </>
                      )}
                      {(c.status === 'pending' || c.status === 'cancelled') && (
                        <button onClick={() => onDelete(c.id)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12, color: '#ff4d4d' }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Создание */}
      <div className="card" style={{ maxWidth: 720 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
          <Plus size={16} /> Создать кампанию
        </h3>
        <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Campaign type */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Тип кампании *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setCampaignType('bonus'); setTemplate('Здравствуйте, {name}! Вам начислен бонус +{amount} KGS. Баланс: {balance} KGS.'); }}
                className="btn btn-secondary" style={{ flex: 1, background: campaignType === 'bonus' ? 'rgba(255,230,0,0.15)' : undefined, color: campaignType === 'bonus' ? '#FFE600' : undefined, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Gift size={14} /> Бонусы
              </button>
              <button type="button" onClick={() => { setCampaignType('wheel'); setTemplate('Здравствуйте, {name}! Вам подарен бесплатный спин Колеса удачи! Испытайте удачу и выиграйте бонусы!\n{link}'); }}
                className="btn btn-secondary" style={{ flex: 1, background: campaignType === 'wheel' ? 'rgba(192,132,252,0.15)' : undefined, color: campaignType === 'wheel' ? '#c084fc' : undefined, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Disc size={14} /> Колесо удачи
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Название *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={campaignType === 'wheel' ? 'Колесо удачи — акция' : 'Новогодний бонус 2026'} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: campaignType === 'wheel' ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Дата отправки *</label>
              <input className="input" type="date" value={bonusDate} onChange={e => setBonusDate(e.target.value)} required />
            </div>
            {campaignType === 'bonus' && (
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Сумма бонуса (KGS) *</label>
                <input className="input" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="200" required />
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Сабаб / Повод (для админ-инфо)</label>
            <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Новый год / 8 марта / Юбилей" />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>
              WhatsApp шаблон (плейсхолдеры: {'{name} {amount} {balance} {link}'})
            </label>
            {/* Quick templates */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {(campaignType === 'wheel' ? [
                { label: 'Стандарт', text: 'Здравствуйте, {name}! Вам подарен бесплатный спин Колеса удачи! Испытайте удачу и выиграйте бонусы!\n{link}' },
                { label: 'Праздник', text: '{name}, с праздником! Дарим вам спин Колеса удачи! Крутите и выигрывайте!\n{link}' },
                { label: 'VIP', text: '{name}, спасибо за лояльность! Дарим бесплатный спин Колеса удачи! Попробуйте свою удачу!\n{link}' },
              ] : [
                { label: 'Стандарт', text: 'Здравствуйте, {name}! Вам начислен бонус +{amount} KGS. Баланс: {balance} KGS.\n{link}\nСмарт Центр' },
                { label: 'Праздник', text: '{name}, поздравляем с праздником!\nВам начислено +{amount} KGS бонусов!\nБаланс: {balance} KGS\n{link}' },
                { label: 'Скидка', text: '{name}, только для вас!\nБонус +{amount} KGS уже на счёте!\nИспользуйте при следующей покупке.\n{link}' },
                { label: 'VIP', text: '{name}, спасибо за лояльность!\nВам начислено +{amount} KGS как VIP клиенту.\nБаланс: {balance} KGS\n{link}' },
              ]).map(t => (
                <button key={t.label} type="button" onClick={() => setTemplate(t.text)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: template === t.text ? 'rgba(255,230,0,0.2)' : 'rgba(255,255,255,0.06)',
                    color: template === t.text ? '#FFE600' : '#8899aa',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea className="input" value={template} onChange={e => setTemplate(e.target.value)} rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            {/* Preview */}
            {template && (
              <div style={{
                marginTop: 8, padding: '12px 14px', borderRadius: 10,
                background: '#075E54', color: '#e2eaf6', fontSize: 13, lineHeight: 1.5,
                whiteSpace: 'pre-wrap', position: 'relative',
              }}>
                <div style={{ fontSize: 10, color: '#25D366', fontWeight: 700, marginBottom: 4 }}>Предпросмотр WhatsApp:</div>
                {template
                  .replace(/\{name\}/g, 'Алексей')
                  .replace(/\{amount\}/g, campaignType === 'wheel' ? '1 спин' : (amount || '200'))
                  .replace(/\{balance\}/g, '1,500')
                  .replace(/\{link\}/g, 'cabinet.smartcentr.store')}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Цель *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setTargetType('all')} className="btn btn-secondary" style={{ flex: 1, background: targetType === 'all' ? 'rgba(255,230,0,0.15)' : undefined, color: targetType === 'all' ? '#FFE600' : undefined, fontWeight: 700 }}>
                Все клиенты
              </button>
              <button type="button" onClick={() => setTargetType('individual')} className="btn btn-secondary" style={{ flex: 1, background: targetType === 'individual' ? 'rgba(255,230,0,0.15)' : undefined, color: targetType === 'individual' ? '#FFE600' : undefined, fontWeight: 700 }}>
                Индивидуально
              </button>
            </div>
          </div>

          {targetType === 'individual' && (
            <div style={{ background: '#0d1117', border: '1px solid #1c2a3a', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input className="input" placeholder="Поиск: ФИО или телефон" value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } }}
                  style={{ flex: 1 }} />
                <button type="button" onClick={doSearch} className="btn btn-secondary" disabled={searching}>
                  <Search size={14} /> {searching ? '...' : 'Найти'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div style={{ marginBottom: 12, maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {searchResults.map(c => (
                    <div key={c.id} onClick={() => addSelected(c)} style={{ padding: '8px 10px', borderRadius: 8, fontSize: 13, color: '#e2eaf6', background: '#1c2a3a', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{c.full_name}</span>
                      <span style={{ color: '#8899aa' }}>{c.phone}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Выбрано: {selected.length}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selected.map(s => (
                  <div key={s.id} style={{ background: 'rgba(255,230,0,0.12)', color: '#FFE600', padding: '4px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s.name}
                    <button type="button" onClick={() => removeSelected(s.id)} style={{ background: 'none', border: 'none', color: '#FFE600', cursor: 'pointer', padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
            {saving ? 'Создание...' : 'Создать кампанию'}
          </button>
        </form>

        {msg && (
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: msg.startsWith('error:') ? 'var(--danger)' : 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {msg.startsWith('error:') ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            {msg.replace(/^(success|error):/, '')}
          </div>
        )}
      </div>
    </div>
  );
}
