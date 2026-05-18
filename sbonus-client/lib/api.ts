import axios from 'axios';
import { clearToken, getToken } from './auth';

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== 'undefined') {
      clearToken();
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/auth')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export interface CabinetTransaction {
  id: string;
  type: string;
  amount: string | number;
  purchase_amount?: string | number | null;
  note?: string | null;
  created_at: string;
}

export interface CabinetMe {
  customer_id: string;
  full_name: string;
  phone: string;
  qr_code: string;
  referral_code: string;
  birth_date?: string | null;
  balance: string | number;
  total_earned: string | number;
  total_spent: string | number;
  tier_name: string;
  tier_percent: string | number;
  next_tier_name?: string | null;
  next_tier_remaining?: string | number | null;
  tier_progress_percent: string | number;
  debt_amount: string | number;
  debt_updated_at?: string | null;
  recent_transactions: CabinetTransaction[];
}

export const customerAuthAPI = {
  requestLink: (phone: string) =>
    api.post('/api/v1/customer-auth/request-link', { phone }),
  verify: (token: string) =>
    api.post<{ access_token: string; expires_in: number; customer_id: string }>(
      '/api/v1/customer-auth/verify',
      { token },
    ),
};

export const customerAPI = {
  me: () => api.get<CabinetMe>('/api/v1/customer/me'),
  transactions: (page = 1, limit = 20, type = '') =>
    api.get(`/api/v1/customer/transactions?page=${page}&limit=${limit}${type ? `&tx_type=${type}` : ''}`),
  updateProfile: (data: { full_name?: string; birth_date?: string | null }) =>
    api.patch('/api/v1/customer/profile', data),
  applyPromo: (code: string) =>
    api.post('/api/v1/customer/promo', { code }),
  applyReferral: (code: string) =>
    api.post('/api/v1/customer/referral', { code }),
  referralInfo: () =>
    api.get('/api/v1/customer/referral'),
};

export const wheelAPI = {
  config: () => api.get('/api/v1/wheel/config'),
  spin: () => api.post('/api/v1/wheel/spin'),
  status: () => api.get('/api/v1/wheel/status'),
};

export default api;
