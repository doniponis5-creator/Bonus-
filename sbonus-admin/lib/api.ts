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
  stats: () => api.get('/api/v1/admin/dashboard/stats'),

  // Tiers
  tiers: () => api.get('/api/v1/admin/tiers'),
  createTier: (d: any) => api.post('/api/v1/admin/tiers', d),

  // Promo codes
  promoCodes: (page = 1, limit = 50) => api.get(`/api/v1/admin/promo-codes?page=${page}&limit=${limit}`),
  createPromo: (d: any) => api.post('/api/v1/admin/promo-codes', d),

  // Transactions (haqiqiy tranzaksiyalar)
  transactions: (page = 1, perPage = 50, type = '') =>
    api.get(`/api/v1/admin/transactions?page=${page}&per_page=${perPage}${type ? `&tx_type=${type}` : ''}`),

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
};

export const customersAPI = {
  byPhone: (p: string) => api.get(`/api/v1/customers/by-phone/${encodeURIComponent(p)}`),
  balance: (id: string) => api.get(`/api/v1/customers/${id}/balance`),
  transactions: (id: string, page: number) => api.get(`/api/v1/customers/${id}/transactions?page=${page}`),
  list: (search: string = '', page: number = 1, limit: number = 50) => 
    api.get(`/api/v1/admin/customers?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`),
  update: (id: string, data: any) => api.put(`/api/v1/admin/customers/${id}`, data),
  adminEarn: (id: string, amount: number, note: string) => 
    api.post(`/api/v1/admin/customers/${id}/bonus/earn`, { amount, note }),
  adminSpend: (id: string, amount: number, note: string) => 
    api.post(`/api/v1/admin/customers/${id}/bonus/spend`, { amount, note }),
};

export default api;
