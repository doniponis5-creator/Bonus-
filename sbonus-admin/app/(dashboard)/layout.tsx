'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Sidebar from '@/components/Sidebar';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function isTokenValid(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64));
    if (typeof json.exp !== 'number') return false;
    return json.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('admin_refresh');
  if (!refreshToken) return false;
  try {
    const { data } = await axios.post(`${API}/api/v1/auth/refresh`, {
      refresh_token: refreshToken,
    });
    localStorage.setItem('admin_token', data.access_token);
    if (data.refresh_token) {
      localStorage.setItem('admin_refresh', data.refresh_token);
    }
    // Update cookies for middleware
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `admin_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict${secure}`;
    if (data.refresh_token) {
      document.cookie = `admin_refresh=${data.refresh_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict${secure}`;
    }
    return true;
  } catch {
    return false;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const t = localStorage.getItem('admin_token');

      // Token mavjud va valid — OK
      if (t && isTokenValid(t)) {
        setOk(true);
        return;
      }

      // Access token expired — refresh orqali yangilash
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        setOk(true);
        return;
      }

      // Refresh ham ishlamadi — login ga
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_refresh');
      localStorage.removeItem('admin_user');
      router.push('/login');
    })();
  }, []);

  // Inactivity timeout: 30 min without interaction → logout
  useEffect(() => {
    if (!ok) return;
    let timer: ReturnType<typeof setTimeout>;
    const TIMEOUT = 30 * 60 * 1000; // 30 min
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_refresh');
        localStorage.removeItem('admin_user');
        document.cookie = 'admin_token=; path=/; max-age=0';
        document.cookie = 'admin_refresh=; path=/; max-age=0';
        router.push('/login');
      }, TIMEOUT);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [ok, router]);

  if (!ok) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
      <style>{`
        .main-content { padding: 32px; }
        @media (max-width: 767px) {
          .main-content { padding: 16px 12px 80px 12px !important; }
        }
      `}</style>
    </div>
  );
}
