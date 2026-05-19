/**
 * S Bonus Admin — API клиент с JWT interceptors.
 */
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: API, timeout: 15000 });

api.interceptors.request.use((c) => {
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem('admin_token');
    if (t) c.headers.Authorization = `Bearer ${t}`;
  }
  return c;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const originalRequest = err.config;
    if (err.response?.status === 401 && typeof window !== 'undefined' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('admin_refresh');
        if (refreshToken) {
          const { data } = await axios.post(
            `${API}/api/v1/auth/refresh`,
            { refresh_token: refreshToken }
          );
          localStorage.setItem('admin_token', data.access_token);
          if (data.refresh_token) {
            localStorage.setItem('admin_refresh', data.refresh_token);
          }
          // Update cookie so middleware doesn't block on next page load
          document.cookie = `admin_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict`;
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, fall through to logout
      }
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_refresh');
      localStorage.removeItem('admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (email: string, password: string) => api.post('/api/v1/auth/admin/login', { email, password }),
};

export const adminAPI = {
  verifyPin: (pin: string) => api.post('/api/v1/admin/verify-pin', { pin }),
  stats: () => api.get('/api/v1/admin/dashboard/stats'),
  trends: (days = 30) => api.get(`/api/v1/admin/dashboard/trends?days=${days}`),
  notificationStats: (days = 7) => api.get(`/api/v1/admin/dashboard/notifications?days=${days}`),
  analytics: (days = 30) => api.get(`/api/v1/admin/dashboard/analytics?days=${days}`),
  inactiveCustomers: () => api.get('/api/v1/admin/dashboard/inactive-customers'),
  integrationStatus: () => api.get('/api/v1/admin/integration/1c-status'),

  // Tiers
  tiers: () => api.get('/api/v1/admin/tiers'),
  createTier: (d: any) => api.post('/api/v1/admin/tiers', d),

  // Promo codes
  promoCodes: (page = 1, limit = 50) => api.get(`/api/v1/admin/promo-codes?page=${page}&limit=${limit}`),
  createPromo: (d: any) => api.post('/api/v1/admin/promo-codes', d),

  // Transactions
  transactions: (page = 1, perPage = 50, type = '') =>
    api.get(`/api/v1/admin/transactions?page=${page}&per_page=${perPage}${type ? `&tx_type=${type}` : ''}`),
  reverseTransaction: (id: string, reason: string) =>
    api.post(`/api/v1/admin/transactions/${id}/reverse`, { reason }),

  // Audit logs
  auditLogs: (page: number) => api.get(`/api/v1/admin/audit-logs?page=${page}`),

  // Cashiers
  cashiers: () => api.get('/api/v1/admin/cashiers'),
  createCashier: (d: any) => api.post('/api/v1/admin/cashiers', d),
  updateCashier: (id: string, d: any) => api.patch(`/api/v1/admin/cashiers/${id}`, d),

  // Branches
  branches: () => api.get('/api/v1/admin/branches'),
  createBranch: (name: string, address?: string, city?: string, phone?: string) =>
    api.post('/api/v1/admin/branches', { name, address, city, phone }),

  // Reports
  exportReport: (format: string, days: number) =>
    api.get(`/api/v1/admin/reports/export?format=${format}&days=${days}`, { responseType: 'blob' }),

  // Bonus campaigns
  campaigns: (statusFilter?: string) =>
    api.get(`/api/v1/admin/campaigns${statusFilter ? `?status=${statusFilter}` : ''}`),
  campaign: (id: string) => api.get(`/api/v1/admin/campaigns/${id}`),
  createCampaign: (d: {
    name: string;
    campaign_type?: 'bonus' | 'wheel';
    bonus_date: string;
    amount: number;
    reason?: string;
    message_template?: string;
    target_type: 'all' | 'individual';
    customer_ids?: string[];
  }) => api.post('/api/v1/admin/campaigns', d),
  sendCampaign: (id: string) => api.post(`/api/v1/admin/campaigns/${id}/send`),
  cancelCampaign: (id: string) => api.post(`/api/v1/admin/campaigns/${id}/cancel`),
  deleteCampaign: (id: string) => api.delete(`/api/v1/admin/campaigns/${id}`),

  // Coupons
  coupons: (page = 1, limit = 50, customerId?: string) =>
    api.get(`/api/v1/admin/coupons?page=${page}&limit=${limit}${customerId ? `&customer_id=${customerId}` : ''}`),
  createCoupon: (d: {
    title: string;
    description?: string;
    bonus_amount: number;
    min_purchase?: number;
    customer_id?: string | null;
    expires_at?: string | null;
  }) => api.post('/api/v1/admin/coupons', d),
  deleteCoupon: (id: string) => api.delete(`/api/v1/admin/coupons/${id}`),

  // Reviews
  reviews: (page = 1, limit = 50, status?: string) =>
    api.get(`/api/v1/admin/reviews?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`),
  actionReview: (id: string, action: 'approve' | 'reject', note?: string) =>
    api.post(`/api/v1/admin/reviews/${id}`, { action, note }),

  // Wheel config
  wheelConfig: () => api.get('/api/v1/admin/wheel/config'),
  updateWheelConfig: (segments: any[]) => api.put('/api/v1/admin/wheel/config', { segments }),
  resetWheelConfig: () => api.post('/api/v1/admin/wheel/config/reset'),
};

export const customersAPI = {
  byPhone: (p: string) => api.get(`/api/v1/customers/by-phone/${encodeURIComponent(p)}`),
  balance: (id: string) => api.get(`/api/v1/customers/${id}/balance`),
  transactions: (id: string, page: number) => api.get(`/api/v1/customers/${id}/transactions?page=${page}`),
  list: (params: {
    search?: string; page?: number; limit?: number;
    tier_name?: string; is_active?: boolean | null;
    min_balance?: number; max_balance?: number;
    sort_by?: string; sort_dir?: string;
  } = {}) => {
    const p = new URLSearchParams();
    if (params.search) p.set('search', params.search);
    p.set('page', String(params.page || 1));
    p.set('limit', String(params.limit || 50));
    if (params.tier_name) p.set('tier_name', params.tier_name);
    if (params.is_active !== undefined && params.is_active !== null) p.set('is_active', String(params.is_active));
    if (params.min_balance !== undefined) p.set('min_balance', String(params.min_balance));
    if (params.max_balance !== undefined) p.set('max_balance', String(params.max_balance));
    if (params.sort_by) p.set('sort_by', params.sort_by);
    if (params.sort_dir) p.set('sort_dir', params.sort_dir);
    return api.get(`/api/v1/admin/customers?${p.toString()}`);
  },
  bulkBonus: (customer_ids: string[], type: 'earn' | 'spend', amount: number, note: string) =>
    api.post('/api/v1/admin/customers/bulk-bonus', { customer_ids, type, amount, note }),
  update: (id: string, data: any) => api.put(`/api/v1/admin/customers/${id}`, data),
  importExcel: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/api/v1/admin/customers/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },
  adminEarn: (id: string, amount: number, note: string) =>
    api.post(`/api/v1/admin/customers/${id}/bonus/earn`, { amount, note }),
  adminSpend: (id: string, amount: number, note: string) =>
    api.post(`/api/v1/admin/customers/${id}/bonus/spend`, { amount, note }),
  giftSpin: (id: string) =>
    api.post(`/api/v1/admin/customers/${id}/gift-spin`),
};

export default api;
