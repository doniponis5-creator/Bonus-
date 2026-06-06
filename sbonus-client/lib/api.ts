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
  sendOtp: (phone: string) =>
    api.post('/api/v1/customer-auth/send-otp', { phone }),
  verifyOtp: (phone: string, code: string) =>
    api.post<{ access_token: string; expires_in: number; customer_id: string }>(
      '/api/v1/customer-auth/verify-otp',
      { phone, code },
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
  leaderboard: (period: 'week' | 'month' | 'all' = 'month') =>
    api.get(`/api/v1/customer/leaderboard?period=${period}`),
  coupons: () =>
    api.get('/api/v1/customer/coupons'),
  activateCoupon: (code: string) =>
    api.post(`/api/v1/customer/coupons/${encodeURIComponent(code)}/activate`),
  submitReview: (platform: string, review_link: string) =>
    api.post('/api/v1/customer/review', { platform, review_link }),
  myReviews: () =>
    api.get('/api/v1/customer/reviews'),
};

// ── Рассрочка/Долг ──
export interface DebtSummary {
  id: string;
  reference: string;
  total_amount: number;
  paid_amount: number;
  amount: number;
  overdue_days: number;
  status: string;
  percent_paid: number;
  next_payment: { date: string; amount: number } | null;
  note: string | null;
  created_at: string | null;
  synced_at: string | null;
}

export interface DebtDetail extends DebtSummary {
  schedule: { date: string; amount: number; status: string }[];
  payments_history: { date: string; amount: number; document: string; overdue_days?: number }[];
}

export interface DebtsResponse {
  total_debt: number;
  total_original: number;
  total_paid: number;
  count: number;
  debts: DebtSummary[];
}

export const debtAPI = {
  list: () => api.get<DebtsResponse>('/api/v1/customer/debts'),
  detail: (id: string) => api.get<DebtDetail>(`/api/v1/customer/debts/${id}`),
};

export const wheelAPI = {
  config: () => api.get('/api/v1/wheel/config'),
  spin: () => api.post('/api/v1/wheel/spin'),
  status: () => api.get('/api/v1/wheel/status'),
};

// ─── Gamification 2.0 ───
export const gamificationAPI = {
  me: () => api.get('/api/v1/gamification/me'),
  claim: (progressId: string) => api.post(`/api/v1/gamification/quest/${progressId}/claim`),
};

// ─── Referral (milestones + leaderboard) ───
export const referralAPI = {
  myStats: () => api.get('/api/v1/referral/my-stats'),
  milestones: () => api.get('/api/v1/referral/milestones'),
  claimMilestone: (referralsNeeded: number) =>
    api.post(`/api/v1/referral/claim-milestone?milestone_referrals=${referralsNeeded}`),
  leaderboard: (limit = 20) => api.get(`/api/v1/referral/leaderboard?limit=${limit}`),
};

export default api;
