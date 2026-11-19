/**
 * Site Gateway API client for the Messenger app.
 * Talks to server/site-gateway (REST + WS). Owner auth via Bearer token.
 */

const GATEWAY_URL = (import.meta.env.VITE_SITE_GATEWAY_URL || 'http://localhost:8081').replace(/\/+$/, '');
const OWNER_TOKEN = (import.meta.env.VITE_SITE_OWNER_TOKEN || '').trim();

function headers(extra: Record<string, string> = {}) {
  return { 'Content-Type': 'application/json', ...(OWNER_TOKEN ? { Authorization: 'Bearer ' + OWNER_TOKEN } : {}), ...extra };
}

export interface Site {
  id: string;
  owner_user_id: string;
  name: string;
  domains: string[];
  site_pubkey: string;
  settings: Record<string, any>;
  created_at: string;
  confirmed?: boolean;
  confirmed_at?: string;
  kind?: string;
  username?: string;
}

export interface Thread {
  id: string;
  site_id: string;
  guest_id: string;
  status: string;
  last_page_url?: string;
  created_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender: 'guest' | 'owner' | 'bot';
  ciphertext: string;
  nonce: string;
  ephemeral_pubkey: string;
  created_at: string;
  delivered_at?: string;
  read_at?: string;
}

export async function fetchSites(): Promise<Site[]> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/sites`, { headers: headers() });
  if (!r.ok) throw new Error('fetch sites failed');
  const j = await r.json();
  return j.sites ?? [];
}

export async function createSite(data: { name: string; domains: string[]; owner_user_id: string; settings?: Record<string, any> }): Promise<{ site_id: string; site_pubkey: string; site_private_key: string; snippet: string }> {
  const r = await fetch(`${GATEWAY_URL}/v1/sites`, { method: 'POST', headers: headers(), body: JSON.stringify(data) });
  if (!r.ok) throw new Error('create site failed');
  return r.json();
}

export async function fetchThreads(siteId: string): Promise<Thread[]> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/threads?site=${encodeURIComponent(siteId)}`, { headers: headers() });
  if (!r.ok) throw new Error('fetch threads failed');
  const j = await r.json();
  return j.threads ?? [];
}

export async function fetchMessages(threadId: string, after?: string): Promise<Message[]> {
  const url = `${GATEWAY_URL}/v1/owner/messages?thread=${encodeURIComponent(threadId)}${after ? '&after=' + encodeURIComponent(after) : ''}`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error('fetch messages failed');
  const j = await r.json();
  return j.messages ?? [];
}

export async function sendMessage(threadId: string, ciphertext: string, nonce: string, ephemeralPubKey: string): Promise<{ message_id: string }> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/messages`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ thread_id: threadId, ciphertext, nonce, ephemeral_pubkey: ephemeralPubKey }),
  });
  if (!r.ok) throw new Error('send message failed');
  return r.json();
}

export function connectWs(token: string, onMessage: (data: any) => void): WebSocket {
  const url = `${GATEWAY_URL.replace(/^http/, 'ws')}/v1/owner/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
  ws.onmessage = (ev) => { try { onMessage(JSON.parse(ev.data)); } catch { /* ignore */ } };
  return ws;
}

export async function closeThread(threadId: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/threads/${encodeURIComponent(threadId)}/close`, { method: 'PATCH', headers: headers() });
  if (!r.ok) throw new Error('close thread failed');
}

export async function blockGuest(guestId: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/guests/${encodeURIComponent(guestId)}/block`, { method: 'PATCH', headers: headers() });
  if (!r.ok) throw new Error('block guest failed');
}

export interface Notification {
  id: string;
  site_id: string;
  owner_user_id: string;
  type: string;
  read: boolean;
  created_at: string;
  thread_id?: string;
  guest_id?: string;
  preview?: string;
  suppressed_by_dnd?: boolean;
}

export async function fetchNotifications(siteId: string): Promise<Notification[]> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/notifications?site=${encodeURIComponent(siteId)}`, { headers: headers() });
  if (!r.ok) throw new Error('fetch notifications failed');
  const j = await r.json();
  return j.notifications ?? [];
}

export async function fetchUnreadNotifications(): Promise<{ notifications: Notification[]; count: number }> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/notifications/unread`, { headers: headers() });
  if (!r.ok) throw new Error('fetch unread notifications failed');
  return r.json();
}

export async function markNotificationRead(id: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', headers: headers() });
  if (!r.ok) throw new Error('mark notification read failed');
}

export function subscribeSites(ws: WebSocket, siteIds: string[]) {
  ws.send(JSON.stringify({ type: 'subscribe', site_ids: siteIds }));
}

// ───────────────────────────────────────────────────────────────────────────
// Handoff (guest → messenger)
// ───────────────────────────────────────────────────────────────────────────

export interface HandoffToken {
  handoff_token: string;
  thread_id: string;
  expires_in: number;
}

export async function createHandoffToken(guestToken: string): Promise<HandoffToken> {
  const r = await fetch(`${GATEWAY_URL}/v1/guest/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: guestToken }),
  });
  if (!r.ok) throw new Error('create handoff token failed');
  return r.json();
}

export interface HandoffValidation {
  ok: boolean;
  thread_id: string;
  site_id: string;
  site_name: string;
  guest_id: string;
}

export async function validateHandoffToken(token: string): Promise<HandoffValidation> {
  const r = await fetch(`${GATEWAY_URL}/v1/guest/handoff/${encodeURIComponent(token)}/validate`);
  if (!r.ok) throw new Error('validate handoff token failed');
  return r.json();
}

export async function consumeHandoffToken(token: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/guest/handoff/${encodeURIComponent(token)}/consume`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error('consume handoff token failed');
}

// ───────────────────────────────────────────────────────────────────────────
// Stats / metrics
// ───────────────────────────────────────────────────────────────────────────

export interface DailyStat {
  site_id: string;
  date: string;
  loaded: number;
  opened: number;
  first_message: number;
  owner_replied: number;
  handoff_shown: number;
  handoff_clicked: number;
  handoff_completed: number;
}

export async function fetchStats(siteId: string, from?: string, to?: string): Promise<DailyStat[]> {
  const url = `${GATEWAY_URL}/v1/owner/stats?site=${encodeURIComponent(siteId)}` +
    (from ? `&from=${encodeURIComponent(from)}` : '') +
    (to ? `&to=${encodeURIComponent(to)}` : '');
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error('fetch stats failed');
  const j = await r.json();
  return j.stats ?? [];
}

// ───────────────────────────────────────────────────────────────────────────
// Public profile (username)
// ───────────────────────────────────────────────────────────────────────────

export async function claimUsername(siteId: string, username: string): Promise<{ username: string; profile_url: string }> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/sites/${encodeURIComponent(siteId)}/username`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ username }),
  });
  if (!r.ok) throw new Error('claim username failed');
  return r.json();
}

export async function releaseUsername(siteId: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/sites/${encodeURIComponent(siteId)}/username`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!r.ok) throw new Error('release username failed');
}

export async function updateSiteSettings(siteId: string, settings: Record<string, any>): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/owner/sites/${encodeURIComponent(siteId)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ settings }),
  });
  if (!r.ok) throw new Error('update site settings failed');
}

// ───────────────────────────────────────────────────────────────────────────
// Bot tokens (owner)
// ───────────────────────────────────────────────────────────────────────────

export interface BotToken {
  token: string;
  site_id: string;
  created_at: number;
}

export async function createBotTokenApi(siteId: string): Promise<BotToken> {
  const r = await fetch(`${GATEWAY_URL}/v1/bot/tokens`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ site_id: siteId }),
  });
  if (!r.ok) throw new Error('create bot token failed');
  return r.json();
}

export async function fetchBotTokens(siteId: string): Promise<BotToken[]> {
  const r = await fetch(`${GATEWAY_URL}/v1/bot/tokens?site_id=${encodeURIComponent(siteId)}`, { headers: headers() });
  if (!r.ok) throw new Error('fetch bot tokens failed');
  const j = await r.json();
  return j.tokens ?? [];
}

export async function deleteBotTokenApi(token: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/bot/tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!r.ok) throw new Error('delete bot token failed');
}

// ───────────────────────────────────────────────────────────────────────────
// User notifications (notify scope)
// ───────────────────────────────────────────────────────────────────────────

export interface UserNotification {
  id: string;
  site_id: string;
  title: string;
  text: string;
  url: string | null;
  created_at: number;
  read: boolean;
}

export async function fetchUserNotifications(userId: string, siteId?: string): Promise<UserNotification[]> {
  const url = `${GATEWAY_URL}/v1/user/notifications?user_id=${encodeURIComponent(userId)}` +
    (siteId ? `&site_id=${encodeURIComponent(siteId)}` : '');
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error('fetch user notifications failed');
  const j = await r.json();
  return j.notifications ?? [];
}

export async function markUserNotificationReadApi(userId: string, notifId: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/user/notifications/${encodeURIComponent(notifId)}/read`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ user_id: userId }),
  });
  if (!r.ok) throw new Error('mark user notification read failed');
}

export async function muteSiteApi(siteId: string, userId: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/user/sites/${encodeURIComponent(siteId)}/mute`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ user_id: userId }),
  });
  if (!r.ok) throw new Error('mute site failed');
}

export async function unmuteSiteApi(siteId: string, userId: string): Promise<void> {
  const r = await fetch(`${GATEWAY_URL}/v1/user/sites/${encodeURIComponent(siteId)}/mute`, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify({ user_id: userId }),
  });
  if (!r.ok) throw new Error('unmute site failed');
}

export async function fetchMutedSites(userId: string): Promise<string[]> {
  const r = await fetch(`${GATEWAY_URL}/v1/user/muted-sites?user_id=${encodeURIComponent(userId)}`, { headers: headers() });
  if (!r.ok) throw new Error('fetch muted sites failed');
  const j = await r.json();
  return j.sites ?? [];
}

// ───────────────────────────────────────────────────────────────────────────
// OAuth 2.0 («Войти через Mess»)
// ───────────────────────────────────────────────────────────────────────────

export async function buildOAuthAuthorizeUrl(siteId: string, redirectUri: string, state: string, codeVerifier: string, scope = 'notify'): Promise<string> {
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const params = new URLSearchParams({
    client_id: siteId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope,
  });
  return `${GATEWAY_URL}/oauth/authorize?${params.toString()}`;
}

async function sha256Base64Url(str: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return btoa(String.fromCharCode.apply(null, new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateCodeVerifier(): Promise<string> {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode.apply(null, arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
