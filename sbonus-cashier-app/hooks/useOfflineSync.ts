/**
 * S Bonus Cashier — Offline sync hook.
 * Обеспечивает автоматическую синхронизацию при восстановлении сети.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { bonusAPI } from '../api/client';
import { syncQueue, queueSize, isOnline, enqueue } from '../utils/offlineQueue';

export function useOfflineSync() {
  const [isConnected, setIsConnected] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncInProgress = useRef(false);

  // Update pending count
  const refreshPendingCount = useCallback(async () => {
    const count = await queueSize();
    setPendingCount(count);
  }, []);

  // Sync handler
  const doSync = useCallback(async () => {
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    setSyncing(true);

    try {
      const result = await syncQueue({
        earn: (payload) => bonusAPI.earn(payload),
        spend: (payload) => bonusAPI.spend(payload),
      });

      if (result.synced > 0) {
        console.log(`[Offline] Synced ${result.synced} operations`);
      }
      if (result.failed > 0) {
        console.warn(`[Offline] ${result.failed} operations failed`);
      }
    } catch (err) {
      console.error('[Offline] Sync error:', err);
    } finally {
      syncInProgress.current = false;
      setSyncing(false);
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  // Monitor network state
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!state.isConnected && !!state.isInternetReachable;
      setIsConnected(online);

      // Auto-sync when back online
      if (online) {
        doSync();
      }
    });

    // Initial check
    isOnline().then(online => setIsConnected(online));
    refreshPendingCount();

    return () => unsubscribe();
  }, [doSync, refreshPendingCount]);

  // Periodic sync every 30 seconds when online
  useEffect(() => {
    const interval = setInterval(async () => {
      const online = await isOnline();
      if (online) {
        await doSync();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [doSync]);

  /**
   * Выполнить операцию earn: онлайн — сразу, офлайн — в очередь
   */
  const offlineEarn = useCallback(async (payload: {
    customer_id: string;
    purchase_amount: number;
    branch_id: string;
  }) => {
    const online = await isOnline();
    if (online) {
      try {
        const result = await bonusAPI.earn(payload);
        return { offline: false, data: result.data };
      } catch (err: any) {
        // Network error — save to queue
        if (!err.response) {
          await enqueue({ type: 'earn', payload });
          await refreshPendingCount();
          return { offline: true, data: null };
        }
        throw err; // Server error — propagate
      }
    } else {
      await enqueue({ type: 'earn', payload });
      await refreshPendingCount();
      return { offline: true, data: null };
    }
  }, [refreshPendingCount]);

  /**
   * Выполнить операцию spend: онлайн — сразу, офлайн — в очередь
   */
  const offlineSpend = useCallback(async (payload: {
    customer_id: string;
    spend_amount: number;
    purchase_amount: number;
    branch_id: string;
  }) => {
    const online = await isOnline();
    if (online) {
      try {
        const result = await bonusAPI.spend(payload);
        return { offline: false, data: result.data };
      } catch (err: any) {
        if (!err.response) {
          await enqueue({ type: 'spend', payload });
          await refreshPendingCount();
          return { offline: true, data: null };
        }
        throw err;
      }
    } else {
      await enqueue({ type: 'spend', payload });
      await refreshPendingCount();
      return { offline: true, data: null };
    }
  }, [refreshPendingCount]);

  return {
    isConnected,
    pendingCount,
    syncing,
    offlineEarn,
    offlineSpend,
    doSync,
    refreshPendingCount,
  };
}
