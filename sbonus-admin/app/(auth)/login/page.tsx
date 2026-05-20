'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { Mail, Key, XCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await authAPI.login(email, password);
      localStorage.setItem('admin_token', data.access_token);
      localStorage.setItem('admin_refresh', data.refresh_token);
      localStorage.setItem('admin_user', JSON.stringify({ id: data.user_id, role: data.role }));
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `admin_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict${secure}`;
      document.cookie = `admin_refresh=${data.refresh_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict${secure}`;
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || 'Неверный email или пароль');
    } finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:24}}>
      <form onSubmit={handleLogin} style={{width:'100%',maxWidth:400}}>
        <div style={{textAlign:'center',marginBottom:40}}>
          <img src="/icon-192.png" alt="S Bonus" width={72} height={72} style={{borderRadius:24,marginBottom:16}} />
          <h1 style={{fontSize:28,fontWeight:900,color:'var(--text)',marginBottom:4}}>S Bonus</h1>
          <p style={{color:'var(--text2)',fontSize:14}}>Админ-панель • Смарт Центр</p>
        </div>
        <label htmlFor="admin-email" style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'var(--text2)',fontWeight:600,marginBottom:6}}><Mail size={14} /> Email</label>
        <input id="admin-email" className="input" type="email" name="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@smartcenter.kg" style={{marginBottom:16}} required />
        <label htmlFor="admin-password" style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'var(--text2)',fontWeight:600,marginBottom:6}}><Key size={14} /> Пароль</label>
        <input id="admin-password" className="input" type="password" name="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••" style={{marginBottom:8}} required />
        {error && <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:12,marginTop:12,marginBottom:4,color:'var(--danger)',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:6}}><XCircle size={16} /> {error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%',marginTop:20,padding:'14px 0',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          {loading ? <><Loader2 className="animate-spin" size={20} /> Вход...</> : 'Войти'}
        </button>
        <p style={{textAlign:'center',marginTop:24,color:'var(--text3)',fontSize:12}}>Ошская обл., Аравандский р-н, ул. Ош-3000, 86</p>
      </form>
    </div>
  );
}
