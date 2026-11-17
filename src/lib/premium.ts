const PREMIUM_KEY = 'nova_premium_active';
const PREMIUM_EXPIRY_KEY = 'nova_premium_expiry';
const PREMIUM_FREE_UNTIL_KEY = 'nova_premium_free_until';
const FIRST_INSTALL_KEY = 'nova_first_install_ts';
const PREMIUM_LICENSE_KEY = 'nova_premium_license';
const PREMIUM_VERIFIED_AT_KEY = 'nova_premium_verified_at';
const PENDING_ORDER_KEY = 'nova_premium_pending_order';
const DEVICE_KEY = 'nova_device_id';

const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_TRIAL_DAYS = 30;
const LICENSE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_SUBSCRIPTION_COST = 390; // ~3.90 USD equivalent (30 days)

const DEVICE_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

interface LicensePayload {
  v: number;
  d: string;
  p: string;
  o: string;
  exp: number;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomHex(byteCount = 16): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDeviceId(): string {
  const existing = readStorage(DEVICE_KEY);
  if (existing && DEVICE_PATTERN.test(existing)) return existing;
  const id = `dev_${randomHex(16)}`;
  writeStorage(DEVICE_KEY, id);
  return id;
}

export function getStoredLicense(): string | null {
  return readStorage(PREMIUM_LICENSE_KEY);
}

export function parseStoredLicense(license: string | null): LicensePayload | null {
  if (!license) return null;
  const parts = license.split('.');
  if (parts.length !== 3 || parts[0] !== 'MA1') return null;
  const body = parts[1];
  const sig = parts[2];
  if (!body || !sig) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(body)) as LicensePayload;
    if (!payload || payload.v !== 1) return null;
    if (typeof payload.d !== 'string' || !DEVICE_PATTERN.test(payload.d)) return null;
    if (!Number.isFinite(Number(payload.exp))) return null;
    return payload;
  } catch {
    return null;
  }
}

export function storeLicense(license: string, expiresAt: number) {
  writeStorage(PREMIUM_LICENSE_KEY, license);
  writeStorage(PREMIUM_EXPIRY_KEY, String(expiresAt));
  writeStorage(PREMIUM_VERIFIED_AT_KEY, String(Date.now()));
}

export function clearLicense() {
  removeStorage(PREMIUM_LICENSE_KEY);
  removeStorage(PREMIUM_EXPIRY_KEY);
  removeStorage(PREMIUM_VERIFIED_AT_KEY);
}

export function isPremium(): boolean {
  try {
    const freeUntil = localStorage.getItem(PREMIUM_FREE_UNTIL_KEY);
    if (freeUntil) {
      const exp = parseInt(freeUntil, 10);
      if (!isNaN(exp) && Date.now() <= exp) return true;
      removeStorage(PREMIUM_FREE_UNTIL_KEY);
    }

    const flag = localStorage.getItem(PREMIUM_KEY);
    const expiry = localStorage.getItem(PREMIUM_EXPIRY_KEY);
    if (flag === 'true') {
      const exp = parseInt(expiry || '', 10);
      if (!isNaN(exp) && Date.now() > exp) {
        removeStorage(PREMIUM_KEY);
        removeStorage(PREMIUM_EXPIRY_KEY);
        return false;
      }
      return true;
    }

    const license = getStoredLicense();
    const payload = license ? parseStoredLicense(license) : null;
    if (payload) {
      const verifiedAt = parseInt(readStorage(PREMIUM_VERIFIED_AT_KEY) || '0', 10);
      const isWithinGrace =
        isNaN(verifiedAt) || Date.now() - verifiedAt <= LICENSE_GRACE_MS;
      const notExpired = Date.now() <= payload.exp + LICENSE_GRACE_MS;
      if (!notExpired) {
        clearLicense();
        return false;
      }
      if (!isWithinGrace) return false;
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export function setPremium(active: boolean, expiryMs?: number) {
  try {
    if (active) {
      localStorage.setItem(PREMIUM_KEY, 'true');
      if (expiryMs) localStorage.setItem(PREMIUM_EXPIRY_KEY, String(expiryMs));
    } else {
      localStorage.removeItem(PREMIUM_KEY);
      localStorage.removeItem(PREMIUM_EXPIRY_KEY);
    }
  } catch { /* ignore */ }
}

export function ensureFirstMonthFree() {
  try {
    const already = localStorage.getItem(FIRST_INSTALL_KEY);
    if (already) return;
    const now = Date.now();
    localStorage.setItem(FIRST_INSTALL_KEY, String(now));
    localStorage.setItem(PREMIUM_FREE_UNTIL_KEY, String(now + FREE_TRIAL_DAYS * DAY_MS));
  } catch { /* ignore */ }
}

export function freeDaysRemaining(): number {
  try {
    const freeUntil = localStorage.getItem(PREMIUM_FREE_UNTIL_KEY);
    if (!freeUntil) return 0;
    const exp = parseInt(freeUntil, 10);
    if (isNaN(exp)) return 0;
    const remaining = Math.max(0, exp - Date.now());
    return Math.ceil(remaining / DAY_MS);
  } catch {
    return 0;
  }
}

export type PremiumFeature =
  | 'chat_themes'
  | 'wallpaper'
  | 'date_picker'
  | 'premium_stickers'
  | 'ads_free';

export const PREMIUM_FEATURES: readonly PremiumFeature[] = [
  'chat_themes',
  'wallpaper',
  'date_picker',
  'premium_stickers',
  'ads_free',
];

export function canUseFeature(feature: PremiumFeature): boolean {
  if (!PREMIUM_FEATURES.includes(feature)) return false;
  return isPremium();
}

const REMOTE_API_BASE = 'https://mess.cvr.name';

/** True inside the Tauri webview, where location.origin is not a reachable API host. */
function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return true;
  const { protocol, hostname } = window.location || ({} as Location);
  return protocol === 'tauri:' || /^tauri\.localhost$/i.test(hostname || '');
}

export function getApiBase(): string {
  const envUrl = (import.meta.env.VITE_NOVA_API_URL as string | undefined) || '';
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (typeof window === 'undefined' || isDesktopShell()) return REMOTE_API_BASE;
  // In dev the Vite server proxies /api to the local backend, so use a
  // same-origin URL: no cross-origin request and no CSP violation.
  if (import.meta.env.DEV) return '';
  if (
    window.location &&
    (window.location.protocol === 'https:' || window.location.protocol === 'http:') &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return window.location.origin;
  }
  return 'http://localhost:8080';
}

interface ApiResponse {
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
}

async function apiFetch(path: string, init?: RequestInit): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch {
    return { ok: false, status: 0, json: {} };
  }
  let json: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    json = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch { /* ignore */ }
  return { ok: response.ok, status: response.status, json };
}

export interface PendingOrder {
  orderId: string;
  url: string;
  createdAt: number;
}

export function savePendingOrder(order: PendingOrder) {
  writeStorage(PENDING_ORDER_KEY, JSON.stringify(order));
}

export function loadPendingOrder(): PendingOrder | null {
  try {
    const raw = localStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOrder;
    if (!parsed || !parsed.orderId || !parsed.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingOrder() {
  removeStorage(PENDING_ORDER_KEY);
}

export function openPaymentUrl(url: string): boolean {
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    return opened !== null;
  } catch {
    return false;
  }
}

export interface CheckoutOptions {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export async function startPremiumCheckout(): Promise<PendingOrder | null> {
  if (isPremium()) return null;
  const pending = loadPendingOrder();
  const fresh =
    pending && Date.now() - pending.createdAt < 30 * 60 * 1000 ? pending : null;
  if (fresh) return fresh;

  const response = await apiFetch('/api/premium/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan: 'premium', device: getDeviceId() }),
  });
  const data = response.json as { ok?: boolean; orderId?: string; url?: string };
  if (!response.ok || !data.ok || !data.orderId || !data.url) return null;
  const order: PendingOrder = {
    orderId: String(data.orderId),
    url: String(data.url),
    createdAt: Date.now(),
  };
  savePendingOrder(order);
  return order;
}

export type PremiumOrderWaitResult = 'paid' | 'pending' | 'error';

export async function waitForPremiumOrder(
  orderId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<PremiumOrderWaitResult> {
  const intervalMs = options.intervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const device = getDeviceId();
  const startedAt = Date.now();

  let lastStatus: string = 'pending';
  while (Date.now() - startedAt < timeoutMs) {
    const response = await apiFetch(
      `/api/premium/order/${encodeURIComponent(orderId)}?device=${encodeURIComponent(device)}`,
    );
    const status = (response.json.status as string) || 'pending';
    lastStatus = status;
    if (status === 'paid') {
      const license = response.json.license as string | undefined;
      if (license) {
        const expiresAt = Number(response.json.expiresAt);
        storeLicense(license, Number.isFinite(expiresAt) ? expiresAt : Date.now() + 30 * DAY_MS);
      }
      return 'paid';
    }
    if (response.status === 404) return 'error';
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return lastStatus === 'paid' ? 'paid' : 'pending';
}

export async function resumePremiumCheckout(): Promise<boolean> {
  const pending = loadPendingOrder();
  if (!pending) return false;
  const result = await waitForPremiumOrder(pending.orderId);
  if (result === 'paid') {
    clearPendingOrder();
    return true;
  }
  if (result === 'error') clearPendingOrder();
  return false;
}

export async function checkoutPremium(options: CheckoutOptions = {}): Promise<boolean> {
  if (isPremium()) return true;
  const started = await startPremiumCheckout();
  if (!started) return false;
  const opened = openPaymentUrl(started.url);
  if (!opened) {
    clearPendingOrder();
    return false;
  }
  const result = await waitForPremiumOrder(started.orderId, {
    intervalMs: options.pollIntervalMs ?? 3000,
    timeoutMs: options.pollTimeoutMs ?? 10 * 60 * 1000,
  });
  if (result === 'paid') {
    clearPendingOrder();
    return true;
  }
  return false;
}

export interface CheckoutResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  url?: string;
}

export async function createPremiumCheckout(options: CheckoutOptions = {}): Promise<CheckoutResult> {
  const started = await startPremiumCheckout();
  if (!started) return { ok: false, error: 'checkout unavailable' };
  const opened = openPaymentUrl(started.url);
  if (!opened) {
    clearPendingOrder();
    return { ok: false, error: 'payment window blocked' };
  }
  const result = await waitForPremiumOrder(started.orderId, {
    intervalMs: options.pollIntervalMs ?? 3000,
    timeoutMs: options.pollTimeoutMs ?? 10 * 60 * 1000,
  });
  if (result === 'paid') {
    clearPendingOrder();
    return { ok: true };
  }
  if (result === 'error') clearPendingOrder();
  return { ok: false, error: result === 'pending' ? 'waiting for payment' : 'checkout failed' };
}

export interface ActivateResult {
  ok: boolean;
  error?: string;
  expiresAt?: number;
}

export async function activatePremiumLicense(license: string, device?: string): Promise<ActivateResult> {
  const normalized = license.trim();
  const payload = normalized ? parseStoredLicense(normalized) : null;
  if (!normalized || !payload) return { ok: false, error: 'invalid license' };
  if (Date.now() > payload.exp + LICENSE_GRACE_MS) return { ok: false, error: 'license expired' };
  const deviceId = device || getDeviceId();
  if (payload.d !== deviceId) return { ok: false, error: 'device mismatch' };
  const response = await apiFetch(
    `/api/premium/status?license=${encodeURIComponent(normalized)}&device=${encodeURIComponent(deviceId)}`,
  );
  const data = response.json;
  if (!response.ok || !data.ok) {
    return { ok: false, error: String(data.error || 'license rejected') };
  }
  const expiresAt = Number(data.expiresAt);
  storeLicense(normalized, Number.isFinite(expiresAt) ? expiresAt : Date.now() + 30 * DAY_MS);
  return { ok: true, expiresAt };
}

export function getMinSubscriptionCost(): number {
  return MIN_SUBSCRIPTION_COST;
}
