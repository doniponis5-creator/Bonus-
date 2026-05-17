'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function isTokenValid(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    // base64url → base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64));
    if (typeof json.exp !== 'number') return false;
    return json.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('admin_token');
    if (!t || !isTokenValid(t)) {
      localStorage.removeItem('admin_token');
      router.push('/login');
      return;
    }
    setOk(true);
  }, []);

  if (!ok) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
