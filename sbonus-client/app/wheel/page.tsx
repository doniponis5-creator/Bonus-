'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BonusWheel from '@/components/BonusWheel';
import { isTokenValid, getToken } from '@/lib/auth';

export default function WheelPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isTokenValid(getToken())) {
      router.replace('/login?redirect=/wheel');
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0f1a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <BonusWheel />
    </div>
  );
}
