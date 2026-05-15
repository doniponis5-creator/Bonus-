/**
 * S Bonus — Zustand auth store.
 * Хранит JWT токены, данные кассира, branch_id.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { authAPI } from '@/api/client';

interface UserData {
  user_id: string;
  role: string;
  branch_id: string | null;
  full_name?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserData | null;
  error: string | null;

  login: (phone: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  error: null,

  login: async (phone: string, pin: string): Promise<boolean> => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.cashierLogin(phone, pin);

      await AsyncStorage.setItem('access_token', data.access_token);
      await AsyncStorage.setItem('refresh_token', data.refresh_token);
      await AsyncStorage.setItem('user', JSON.stringify({
        user_id: data.user_id,
        role: data.role,
        branch_id: data.branch_id,
      }));

      set({
        isAuthenticated: true,
        isLoading: false,
        user: {
          user_id: data.user_id,
          role: data.role,
          branch_id: data.branch_id,
        },
      });
      return true;
    } catch (err: any) {
      const message = err?.response?.data?.detail?.message || 'Ошибка входа';
      set({ isLoading: false, error: message });
      return false;
    }
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch {}
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
    set({ isAuthenticated: false, user: null, isLoading: false });
  },

  checkAuth: async () => {
    const token = await AsyncStorage.getItem('access_token');
    const userStr = await AsyncStorage.getItem('user');
    if (token && userStr) {
      set({
        isAuthenticated: true,
        isLoading: false,
        user: JSON.parse(userStr),
      });
    } else {
      set({ isAuthenticated: false, isLoading: false });
    }
  },
}));
