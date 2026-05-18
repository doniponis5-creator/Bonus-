/**
 * S Bonus Cashier — Offline Queue Manager.
 * Сохраняет операции в AsyncStorage при отсутствии сети.
 * Автоматически синхронизирует при восстановлении связи.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_KEY = 'sbonus_offline_queue';

export interface OfflineOperation {
  id: string;
  type: 'earn' | 'spend';
  payload: any;
  createdAt: string;
  retries: number;
}

/**
 * Добавить операцию в очередь
 */
export async function enqueue(op: Omit<OfflineOperation, 'id' | 'createdAt' | 'retries'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...op,
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    retries: 0,
  });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Получить все операции в очереди
 */
export async function getQueue(): Promise<OfflineOperation[]> {
  try {
    const data = await AsyncStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Удалить операцию из очереди
 */
export async function dequeue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter(op => op.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

/**
 * Очистить всю очередь
 */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

/**
 * Увеличить счётчик повторов
 */
export async function incrementRetry(id: string): Promise<void> {
  const queue = await getQueue();
  const op = queue.find(o => o.id === id);
  if (op) {
    op.retries += 1;
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}

/**
 * Количество операций в очереди
 */
export async function queueSize(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

/**
 * Проверка доступности сети
 */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected && !!state.isInternetReachable;
}

/**
 * Синхронизация: отправить все операции из очереди
 * Возвращает { synced: number, failed: number }
 */
export async function syncQueue(
  handlers: {
    earn: (payload: any) => Promise<any>;
    spend: (payload: any) => Promise<any>;
  }
): Promise<{ synced: number; failed: number }> {
  const online = await isOnline();
  if (!online) return { synced: 0, failed: 0 };

  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const op of queue) {
    if (op.retries >= 5) {
      // Skip operations that failed too many times
      failed += 1;
      continue;
    }

    try {
      const handler = handlers[op.type];
      if (handler) {
        await handler(op.payload);
        await dequeue(op.id);
        synced += 1;
      }
    } catch (err: any) {
      await incrementRetry(op.id);
      failed += 1;
      // If server rejected (4xx), remove from queue — don't retry
      if (err?.response?.status >= 400 && err?.response?.status < 500) {
        await dequeue(op.id);
      }
    }
  }

  return { synced, failed };
}
