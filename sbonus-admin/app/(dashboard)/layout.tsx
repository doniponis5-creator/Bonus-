'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('admin_token');
    if (!t) { router.push('/login'); return; }
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
