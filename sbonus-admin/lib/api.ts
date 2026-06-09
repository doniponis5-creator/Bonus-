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
          // Update cookies so middleware doesn't block on next page load
          const secure = window.location.protocol === 'https:' ? '; Secure' : '';
          document.cookie = `admin_token=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict${secure}`;
          if (data.refresh_token) {
            document.cookie = `admin_refresh=${data.refresh_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict${secure}`;
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
  changePassword: (current_password: string, new_password: string) =>
    api.post('/api/v1/auth/change-password', { current_password, new_password }),
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
  updateTransactionCashier: (id: string, cashierId: string) =>
    api.put(`/api/v1/admin/transactions/${id}/cashier`, { cashier_id: cashierId }),

  // Audit logs
  auditLogs: (page: number, action?: string, entityType?: string) => {
    const params = new URLSearchParams({ page: String(page) });
    if (action) params.set('action', action);
    if (entityType) params.set('entity_type', entityType);
    return api.get(`/api/v1/admin/audit-logs?${params.toString()}`);
  },

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

  // Cashier bonuses
  cashierBonusConfig: () => api.get('/api/v1/admin/cashier-bonuses/config'),
  updateCashierBonusConfig: (config: any) => api.put('/api/v1/admin/cashier-bonuses/config', config),
  cashierBonusProgress: () => api.get('/api/v1/admin/cashier-bonuses/progress'),
  cashierBonusProgressById: (id: string) => api.get(`/api/v1/admin/cashier-bonuses/progress/${id}`),

  // WhatsApp broadcast
  waBroadcastSegments: () => api.get('/api/v1/admin/wa-broadcast/segments'),
  waBroadcastPreview: (segment: string, message: string, threshold?: number) =>
    api.post('/api/v1/admin/wa-broadcast/preview', { segment, message, threshold }),
  waBroadcastSend: (segment: string, message: string, threshold?: number) =>
    api.post('/api/v1/admin/wa-broadcast/send', { segment, message, threshold }),
  waTriggersConfig: () => api.get('/api/v1/admin/wa-broadcast/triggers'),
  updateWaTriggersConfig: (config: any) => api.put('/api/v1/admin/wa-broadcast/triggers', config),

  // Telegram bot
  telegramConfig: () => api.get('/api/v1/admin/telegram/config'),
  updateTelegramConfig: (config: any) => api.put('/api/v1/admin/telegram/config', config),
  testTelegram: () => api.post('/api/v1/admin/telegram/test'),
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
  getDebts: (id: string) =>
    api.get(`/api/v1/admin/customers/${id}/debts`),
  giftSpin: (id: string) =>
    api.post(`/api/v1/admin/customers/${id}/gift-spin`),
};

export default api;

// ─── A/B Testing ───
export const abTestingAPI = {
  list: (status?: string) => api.get(`/api/v1/ab-testing${status ? `?status=${status}` : ''}`),
  get: (id: string) => api.get(`/api/v1/ab-testing/${id}`),
  create: (d: { name: string; variant_a_message: string; variant_b_message: string; description?: string; campaign_id?: string }) =>
    api.post('/api/v1/ab-testing', d),
  assign: (testId: string, customerId: string) =>
    api.post(`/api/v1/ab-testing/${testId}/assign?customer_id=${customerId}`),
  convert: (testId: string, customerId: string) =>
    api.post(`/api/v1/ab-testing/${testId}/convert?customer_id=${customerId}`),
  complete: (testId: string) => api.put(`/api/v1/ab-testing/${testId}/complete`),
  cancel: (testId: string) => api.delete(`/api/v1/ab-testing/${testId}`),
};

// ─── QR Analytics ───
export const qrAnalyticsAPI = {
  overview: (days = 30) => api.get(`/api/v1/qr-analytics/overview?days=${days}`),
  byQR: (qrCode: string) => api.get(`/api/v1/qr-analytics/by-qr/${encodeURIComponent(qrCode)}`),
  scans: (limit = 50, qrCode?: string, utmSource?: string) => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (qrCode) p.set('qr_code', qrCode);
    if (utmSource) p.set('utm_source', utmSource);
    return api.get(`/api/v1/qr-analytics/scans?${p.toString()}`);
  },
};

// ─── Customer Telegram Bot ───
export const customerTgAPI = {
  config: () => api.get('/api/v1/customer-tg-bot/config'),
  updateConfig: (d: { enabled: boolean; bot_token?: string; bot_username?: string }) =>
    api.put('/api/v1/customer-tg-bot/config', d),
  stats: () => api.get('/api/v1/customer-tg-bot/stats'),
};

// ─── Cashback Categories ───
export const cashbackAPI = {
  categories: () => api.get('/api/v1/cashback/categories'),
  updateCategory: (slug: string, percent: number) =>
    api.put(`/api/v1/cashback/categories/${slug}`, { percent }),
  createCategory: (slug: string, name: string, percent: number) =>
    api.post('/api/v1/cashback/categories', { slug, name, percent }),
  deleteCategory: (slug: string) => api.delete(`/api/v1/cashback/categories/${slug}`),
  globalPromo: () => api.get('/api/v1/cashback/global-promo'),
  updateGlobalPromo: (d: { enabled: boolean; percent?: number; expires_at?: string }) =>
    api.put('/api/v1/cashback/global-promo', d),
};

// ─── PRO Analytics ───
export const analyticsProAPI = {
  business: (days = 30) => api.get(`/api/v1/analytics-pro/business?days=${days}`),
  cohorts: (months = 6) => api.get(`/api/v1/analytics-pro/cohorts?months=${months}`),
  rfm: () => api.get('/api/v1/analytics-pro/rfm'),
  funnel: (days = 90) => api.get(`/api/v1/analytics-pro/funnel?days=${days}`),
  marketing: (days = 30) => api.get(`/api/v1/analytics-pro/marketing?days=${days}`),
  realtime: () => api.get('/api/v1/analytics-pro/realtime'),
  dailyTrends: (days = 30) => api.get(`/api/v1/analytics-pro/daily-trends?days=${days}`),
};

// ─── Product Analytics ───
export const productAPI = {
  summary: () => api.get('/api/v1/product-analytics/summary'),
  products: (params?: Record<string, any>) => api.get('/api/v1/product-analytics/products', { params }),
  topSellers: (days = 30, limit = 20, category?: string) =>
    api.get(`/api/v1/product-analytics/top-sellers?days=${days}&limit=${limit}${category ? `&category=${category}` : ''}`),
  lowStock: (includeOutOfStock = true) =>
    api.get(`/api/v1/product-analytics/low-stock?include_out_of_stock=${includeOutOfStock}`),
  deadStock: (days = 30) => api.get(`/api/v1/product-analytics/dead-stock?days=${days}`),
  abc: (days = 90) => api.get(`/api/v1/product-analytics/abc?days=${days}`),
  recalculateAbc: (days = 90) => api.post(`/api/v1/product-analytics/recalculate-abc?days=${days}`),
  margins: (days = 30, limit = 30, sort = 'margin_desc') =>
    api.get(`/api/v1/product-analytics/margins?days=${days}&limit=${limit}&sort=${sort}`),
  frequentlyBought: (days = 90, minCount = 3) =>
    api.get(`/api/v1/product-analytics/frequently-bought?days=${days}&min_count=${minCount}`),
  settings: () => api.get('/api/v1/product-analytics/settings'),
  updateSettings: (params: Record<string, any>) => api.put('/api/v1/product-analytics/settings', null, { params }),
  dailyDigest: () => api.get('/api/v1/product-analytics/daily-digest'),
  smartRecommendations: (days = 90) => api.get(`/api/v1/product-analytics/smart-recommendations?days=${days}`),
};

export const financialsAPI = {
  summary: (month?: string) => api.get('/api/v1/financials/summary' + (month ? `?month=${month}` : '')),
  monthly: (months = 6) => api.get(`/api/v1/financials/monthly?months=${months}`),
  pnl: (month?: string) => api.get('/api/v1/financials/pnl' + (month ? `?month=${month}` : '')),
  expenses: (month?: string, category?: string) => {
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (category) params.set('category', category);
    return api.get('/api/v1/financials/expenses' + (params.toString() ? `?${params}` : ''));
  },
  createExpense: (data: { category: string; amount: number; month: string; description?: string; is_recurring?: boolean }) =>
    api.post('/api/v1/financials/expenses', data),
  updateExpense: (id: string, data: any) => api.put(`/api/v1/financials/expenses/${id}`, data),
  deleteExpense: (id: string) => api.delete(`/api/v1/financials/expenses/${id}`),
  byCashier: (month?: string) => api.get('/api/v1/financials/by-cashier' + (month ? `?month=${month}` : '')),
  byCategory: (month?: string) => api.get('/api/v1/financials/by-category' + (month ? `?month=${month}` : '')),
  planFact: (month?: string) => api.get('/api/v1/financials/plan-fact' + (month ? `?month=${month}` : '')),
  verifyPin: (pin: string) => api.post("/api/v1/financials/verify-pin", { pin }),
  setPin: (pin: string, current_pin?: string) => api.put("/api/v1/financials/pin", { pin, current_pin }),
  pinStatus: () => api.get("/api/v1/financials/pin-status"),
  setPlan: (month: string, params: { revenue?: number; expenses?: number; profit?: number }) =>
    api.put(`/api/v1/financials/plan?month=${month}`, null, { params }),
};


// ═══ PRO Business Intelligence API ═══
export const biAPI = {
  // Telegram P&L
  tgPnlPreview: (month?: string) => api.get('/api/v1/bi/tg-pnl-preview' + (month ? `?month=${month}` : '')),
  tgPnlSend: (month?: string) => api.post('/api/v1/bi/tg-pnl-send' + (month ? `?month=${month}` : '')),
  // Excel
  exportExcel: (month?: string, months = 3) =>
    api.get('/api/v1/bi/export-excel' + `?months=${months}` + (month ? `&month=${month}` : ''), { responseType: 'blob' }),
  // Budgets
  budgets: (month?: string) => api.get('/api/v1/bi/budgets' + (month ? `?month=${month}` : '')),
  setBudget: (data: { category: string; limit_amount: number; month: string }) => api.put('/api/v1/bi/budgets', data),
  budgetAlerts: (month?: string) => api.get('/api/v1/bi/budget-alerts' + (month ? `?month=${month}` : '')),
  // Debts
  debtsAnalytics: () => api.get('/api/v1/bi/debts-analytics'),
  debtsRegistry: (params: { page?: number; per_page?: number; category?: string; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.per_page) q.set('per_page', String(params.per_page));
    if (params.category) q.set('category', params.category);
    if (params.search) q.set('search', params.search);
    return api.get('/api/v1/bi/debts-registry?' + q.toString());
  },
  debtsOverride: (customerId: string, newCategory: string) =>
    api.put(`/api/v1/bi/debts-override?customer_id=${customerId}&new_category=${newCategory}`),
  debtCheck: (phone: string) => api.get(`/api/v1/bi/debt-check/${encodeURIComponent(phone)}`),
  // Cashier KPI
  cashierKpi: (month?: string) => api.get('/api/v1/bi/cashier-kpi' + (month ? `?month=${month}` : '')),
  // RFM Pro
  rfmPro: () => api.get('/api/v1/bi/rfm-pro'),
};


// ─── Customer 360 ───
export const customer360API = {
  profile: (customerId: string) => api.get(`/api/v1/admin/customer360/${customerId}`),
};

// ─── Referral 2.0 Admin ───
export const referralAPI = {
  leaderboard: (limit = 50) => api.get(`/api/v1/referral/admin/leaderboard?limit=${limit}`),
  tree: (customerId: string) => api.get(`/api/v1/referral/admin/tree/${customerId}`),
  stats: () => api.get('/api/v1/referral/admin/stats'),
};

// ─── Revenue Forecast ───
export const forecastAPI = {
  revenue: (historyDays = 90, forecastDays = 30) =>
    api.get(`/api/v1/forecast/revenue?history_days=${historyDays}&forecast_days=${forecastDays}`),
  customers: (historyDays = 90, forecastDays = 30) =>
    api.get(`/api/v1/forecast/customers?history_days=${historyDays}&forecast_days=${forecastDays}`),
  summary: () => api.get('/api/v1/forecast/summary'),
};


// ─── Gamification ───
export const gamificationAPI = {
  adminStats: () => api.get('/api/v1/gamification/admin/stats'),
  profile: (customerId: string) => api.get(`/api/v1/gamification/profile/${customerId}`),
  // ─── Gamification 2.0 (persistent) ───
  overview: () => api.get('/api/v1/gamification/admin/overview'),
  // Quests
  listQuests: () => api.get('/api/v1/gamification/admin/quests'),
  createQuest: (data: any) => api.post('/api/v1/gamification/admin/quests', data),
  updateQuest: (id: string, data: any) => api.patch(`/api/v1/gamification/admin/quests/${id}`, data),
  deleteQuest: (id: string) => api.delete(`/api/v1/gamification/admin/quests/${id}`),
  // Achievements
  listAchievements: () => api.get('/api/v1/gamification/admin/achievements'),
  createAchievement: (data: any) => api.post('/api/v1/gamification/admin/achievements', data),
  updateAchievement: (id: string, data: any) => api.patch(`/api/v1/gamification/admin/achievements/${id}`, data),
  deleteAchievement: (id: string) => api.delete(`/api/v1/gamification/admin/achievements/${id}`),
};

// ─── Branch Analytics ───
export const branchAPI = {
  comparison: (days = 30) => api.get(`/api/v1/branch-analytics/comparison?days=${days}`),
  trends: (days = 30) => api.get(`/api/v1/branch-analytics/trends?days=${days}`),
  heatmap: (days = 30) => api.get(`/api/v1/branch-analytics/heatmap?days=${days}`),
  cashierPerformance: (days = 30) => api.get(`/api/v1/branch-analytics/cashier-performance?days=${days}`),
};

// ─── Feedback & NPS ───
export const feedbackAPI = {
  dashboard: (days = 90) => api.get(`/api/v1/feedback/admin/dashboard?days=${days}`),
  submit: (data: { customer_id: string; score: number; comment?: string; source?: string }) =>
    api.post('/api/v1/feedback/submit', data),
  remove: (id: string) => api.delete(`/api/v1/feedback/admin/${id}`),
};

// ─── Smart Campaigns ───
export const smartCampaignAPI = {
  segments: (days = 365) => api.get(`/api/v1/smart-campaigns/segments?days=${days}`),
  segmentCustomers: (segmentId: string, days = 365) =>
    api.get(`/api/v1/smart-campaigns/segments/${segmentId}/customers?days=${days}`),
  suggest: (data: { segment_id: string; bonus_amount?: number }) =>
    api.post('/api/v1/smart-campaigns/suggest', data),
  templates: () => api.get('/api/v1/smart-campaigns/templates'),
  launch: (data: { segment_id: string; bonus_amount: number; name?: string; message_template?: string }) =>
    api.post('/api/v1/smart-campaigns/launch', data),
};

export const autoCouponAPI = {
  runNow: () => api.post('/api/v1/admin/coupons/auto-coupon/run'),
};

// ─── Reports ───
export const reportsAPI = {
  daily: (date?: string) => api.get('/api/v1/reports/daily' + (date ? `?date=${date}` : ''), { responseType: 'blob' }),
  monthly: (month?: string) => api.get('/api/v1/reports/monthly' + (month ? `?month=${month}` : ''), { responseType: 'blob' }),
};
