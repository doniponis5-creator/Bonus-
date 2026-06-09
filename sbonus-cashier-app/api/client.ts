/**
 * S Bonus — Axios API клиент с JWT interceptors.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

import Constants from 'expo-constants';

// Priority: EXPO_PUBLIC_API_URL env → app.json extra.apiBaseUrl → dev fallback
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  (__DEV__ ? 'http://localhost:8000' : '');

if (!process.env.EXPO_PUBLIC_API_URL && !Constants.expoConfig?.extra?.apiBaseUrl) {
  console.warn(
    '[S Bonus] EXPO_PUBLIC_API_URL не задан. Используется fallback:',
    BASE_URL || '(пусто — API будет недоступен)',
  );
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: добавляем JWT ───
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: auto refresh ───
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refresh_token');
        if (refreshToken) {
          const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });
          await AsyncStorage.setItem('access_token', data.access_token);
          await AsyncStorage.setItem('refresh_token', data.refresh_token);
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return api(originalRequest);
        }
      } catch {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
      }
    }
    return Promise.reject(error);
  }
);

// ═══════════════════════════════════════
// AUTH API
// ═══════════════════════════════════════

export const authAPI = {
  cashierLogin: (phone: string, pin: string) =>
    api.post('/api/v1/auth/cashier/login', { phone, pin }),

  logout: () => api.post('/api/v1/auth/logout'),
};

// ═══════════════════════════════════════
// CUSTOMERS API
// ═══════════════════════════════════════

export const customersAPI = {
  register: (data: { phone: string; full_name: string; birth_date?: string }) =>
    api.post('/api/v1/customers/register', data),

  search: (query: string) =>
    api.get(`/api/v1/customers/search?q=${encodeURIComponent(query)}`),

  byPhone: (phone: string) =>
    api.get(`/api/v1/customers/by-phone/${encodeURIComponent(phone)}`),

  byQR: (qrCode: string) =>
    api.get(`/api/v1/customers/by-qr/${encodeURIComponent(qrCode)}`),

  balance: (customerId: string) =>
    api.get(`/api/v1/customers/${customerId}/balance`),

  transactions: (customerId: string, page = 1) =>
    api.get(`/api/v1/customers/${customerId}/transactions?page=${page}&per_page=20`),
};

// ═══════════════════════════════════════
// BONUS API
// ═══════════════════════════════════════

export const bonusAPI = {
  earn: (data: { customer_id: string; purchase_amount: number; branch_id: string }) =>
    api.post('/api/v1/bonus/earn', data),

  spend: (data: { customer_id: string; spend_amount: number; purchase_amount: number; branch_id: string }) =>
    api.post('/api/v1/bonus/spend', data),

  checkSpend: (customerId: string, purchaseAmount: number) =>
    api.post('/api/v1/bonus/check-spend', { customer_id: customerId, purchase_amount: purchaseAmount }),

  birthday: (customerId: string) =>
    api.post(`/api/v1/bonus/birthday?customer_id=${customerId}`),

  applyPromo: (customerId: string, code: string) =>
    api.post('/api/v1/bonus/promo/apply', { customer_id: customerId, promo_code: code }),

  applyReferral: (customerId: string, code: string) =>
    api.post('/api/v1/bonus/referral/apply', { customer_id: customerId, referral_code: code }),
};

export const customerAuthAPI = {
  sendCabinetLink: (customerId: string) =>
    api.post(`/api/v1/customer-auth/send-link-by-cashier/${customerId}`),
};

export const cashierBonusAPI = {
  myProgress: () => api.get('/api/v1/admin/cashier-bonuses/my-progress'),
};

export default api;

// ═══════════════════════════════════════
// PRODUCTS API (кассир учун)
// ═══════════════════════════════════════

export const productsAPI = {
  search: (q: string, category?: string) =>
    api.get('/api/v1/cashier/products/search', {
      params: { q, category: category || undefined, limit: 30 },
    }),

  config: () => api.get('/api/v1/cashier/products/config'),
};

// ═══════════════════════════════════════
// UPSELL API (порог-бонусы + рекомендации)
// ═══════════════════════════════════════

export const upsellAPI = {
  basketTiers: () => api.get('/api/v1/cashier/products/basket-tiers'),

  suggestions: (customerId: string) =>
    api.get(`/api/v1/cashier/products/upsell/${customerId}`, { params: { limit: 3 } }),
};
