'use client';
import { useEffect, useState } from 'react';
import { customerTgAPI } from '@/lib/api';
import { Bot, Loader2, CheckCircle2, XCircle, Users, Power, Eye, EyeOff } from 'lucide-react';

export default function CustomerTgBotPage() {
  const [config, setConfig] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [showToken, setShowToken] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cfgRes, statsRes] = await Promise.all([
        customerTgAPI.config().catch(() => ({ data: null })),
        customerTgAPI.stats().catch(() => ({ data: null })),
      ]);
      if (cfgRes.data) {
        setConfig(cfgRes.data);
        setEnabled(cfgRes.data.enabled || false);
        setToken(cfgRes.data.bot_token || '');
        setUsername(cfgRes.data.bot_username || '');
      }
      if (statsRes.data) setStats(statsRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      await customerTgAPI.updateConfig({ enabled, bot_token: token || undefined, bot_username: username || undefined });
      setMsg('Настройки сохранены!');
      load();
    } catch (er: any) {
      setMsg('Ошибка: ' + (er?.response?.data?.detail || 'неизвестно'));
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 60, color: 'var(--text2)' }}>
      <Loader2 size={16} className="animate-spin" /> Загрузка...
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Bot size={24} /> Telegram бот для клиентов
      </h1>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Статус</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Power size={18} color={stats?.enabled ? '#22c55e' : '#8899aa'} />
            <span style={{ fontSize: 18, fontWeight: 800, color: stats?.enabled ? '#22c55e' : '#8899aa' }}>
              {stats?.enabled ? 'Активен' : 'Выключен'}
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Users size={12} /> Привязанных клиентов
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)' }}>{stats?.linked_customers || 0}</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Бот username</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
            {username ? `@${username}` : '—'}
          </div>
        </div>
      </div>

      {/* Config form */}
      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Настройки бота</h3>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Включить бот</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Клиенты смогут проверять баланс через Telegram</div>
            </div>
            <button type="button" onClick={() => setEnabled(!enabled)} style={{
              width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
              background: enabled ? '#22c55e' : '#333', position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11, background: '#fff',
                position: 'absolute', top: 3, left: enabled ? 23 : 3, transition: 'left 0.2s',
              }} />
            </button>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Bot Token (от @BotFather)</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showToken ? 'text' : 'password'} value={token} onChange={e => setToken(e.target.value)}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" style={{ paddingRight: 40 }} />
              <button type="button" onClick={() => setShowToken(!showToken)} style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)',
              }}>
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#8899aa', marginBottom: 6 }}>Bot Username (без @)</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="sbonus_client_bot" />
          </div>

          <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.06)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6', marginBottom: 6 }}>Что умеет бот:</div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text2)', lineHeight: 2 }}>
              <li>/balance — Текущий баланс</li>
              <li>/history — История операций</li>
              <li>/referral — Реферальная ссылка</li>
              <li>/tier — Уровень лояльности</li>
            </ul>
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
        {msg && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            color: msg.startsWith('Ошибка') ? 'var(--danger)' : '#22c55e' }}>
            {msg.startsWith('Ошибка') ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
