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

api.interceptors.response.use((r) => r, async (err) => {
  if (err.response?.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('admin_token');
    window.location.href = '/login';
  }
  return Promise.reject(err);
});

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

  // Branches
  branches: () => api.get('/api/v1/admin/branches'),
  createBranch: (name: string, address?: string, city?: string, phone?: string) => {
    const params = new URLSearchParams({ name });
    if (address) params.append('address', address);
    if (city) params.append('city', city);
    if (phone) params.append('phone', phone);
    return api.post(`/api/v1/admin/branches?${params}`);
  },

  // Reports
  exportReport: (format: string, days: number) =>
    api.get(`/api/v1/admin/reports/export?format=${format}&days=${days}`, { responseType: 'blob' }),
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
