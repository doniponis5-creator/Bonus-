/**
 * S Bonus Admin — TypeScript interfaces.
 */

// ── Auth ──
export interface AdminUser {
  id: string;
  role: 'super_admin' | 'branch_admin' | 'cashier';
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  role: string;
  branch_id?: string;
}

// ── Customer ──
export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  tier_name: string;
  balance: number;
  is_active: boolean;
  created_at: string;
  birth_date?: string;
  qr_code?: string;
  referral_code?: string;
  total_earned?: number;
  total_spent?: number;
}

// ── Transaction ──
export interface Transaction {
  id: string;
  type: 'earn' | 'spend' | 'expire' | 'refund' | 'birthday' | 'referral' | 'promo' | 'campaign';
  amount: number;
  purchase_amount: number | null;
  receipt_number: string | null;
  note: string | null;
  customer_name: string;
  customer_phone: string;
  cashier_name: string;
  branch_name: string;
  created_at: string;
}

// ── Tier ──
export interface Tier {
  id: string;
  name: string;
  min_total_kgs: number;
  bonus_percent: number;
  max_spend_pct: number;
  sort_order: number;
}

// ── Branch ──
export interface Branch {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Cashier ──
export interface Cashier {
  id: string;
  full_name: string;
  phone: string;
  branch_id: string | null;
  branch_name: string;
  is_active: boolean;
  created_at: string;
}

// ── PromoCode ──
export interface PromoCode {
  id: string;
  code: string;
  bonus_amount: number;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

// ── AuditLog ──
export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ── Dashboard Stats ──
export interface DashboardStats {
  total_customers: number;
  active_customers: number;
  total_bonus_issued: number;
  total_bonus_spent: number;
  total_balance: number;
  transactions_today: number;
  transactions_month: number;
  tier_distribution: Record<string, number>;
}

// ── Campaign ──
export interface Campaign {
  id: string;
  name: string;
  bonus_date: string;
  amount: number;
  reason: string | null;
  message_template: string | null;
  target_type: 'all' | 'individual';
  status: 'pending' | 'processing' | 'sent' | 'cancelled';
  sent_count: number;
  recipients_count: number;
  created_at: string;
  sent_at: string | null;
}

export interface CampaignRecipient {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  sent_at: string | null;
  error: string | null;
}

// ── Paginated Response ──
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit?: number;
  per_page?: number;
}

// ── Bonus Result ──
export interface BonusResult {
  transaction_id: string;
  type: string;
  amount: number;
  new_balance: number;
  tier_name: string;
  tier_upgraded?: boolean;
  message_ru: string;
  message_kg: string;
}
