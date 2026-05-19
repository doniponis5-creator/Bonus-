const STORAGE_KEY = 'sbonus_client_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
  // Sync to cookie for middleware server-side auth check
  document.cookie = `customer_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict`;
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  document.cookie = 'customer_token=; path=/; max-age=0';
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64));
    if (typeof json.exp !== 'number') return false;
    return json.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
