/**
 * Nova Mini Apps — Phase B7 (docs/bots-roadmap.md §B7).
 *
 * A Mini App is a web page loaded from a bot's `web_app` URL inside a
 * sandboxed iframe (`sandbox="allow-scripts allow-forms"`, NO
 * `allow-same-origin`). The host and the app talk through `postMessage`.
 *
 * Security notes from the roadmap:
 *   - iframe must never get `allow-same-origin` (old repo flaw).
 *   - `initData` is signed with the bot identity key so the app can trust
 *     the host. Host and app share a per-bot secret derived at install time;
 *     here we accept an explicit secret so callers can wire the vault key.
 *   - The app's origin is the bot-declared `web_app.url`; the host does not
 *     add it to any allowlist beyond the sandboxed iframe itself.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Shape of the signed init-data payload handed to the Mini App on load. */
export interface InitDataPayload {
  bot_id: string;
  user_id: string;
  auth_date: number; // unix seconds
  hash: string; // hex HMAC-SHA256
}

/** Serialize init data to the Telegram-like `key=value&...` query string. */
export function serializeInitData(payload: InitDataPayload): string {
  const params = new URLSearchParams();
  params.set('bot_id', payload.bot_id);
  params.set('user_id', payload.user_id);
  params.set('auth_date', String(payload.auth_date));
  params.set('hash', payload.hash);
  return params.toString();
}

/** Parse a query string back into an InitDataPayload (without verifying). */
export function parseInitDataString(initData: string): InitDataPayload | null {
  try {
    const params = new URLSearchParams(initData.startsWith('?') ? initData.slice(1) : initData);
    const bot_id = params.get('bot_id');
    const user_id = params.get('user_id');
    const auth_date = params.get('auth_date');
    const hash = params.get('hash');
    if (!bot_id || !user_id || !auth_date || !hash) return null;
    return { bot_id, user_id, auth_date: Number(auth_date), hash };
  } catch {
    return null;
  }
}

/**
 * Sign init data. The data-check-string is `bot_id={...}\nuser_id={...}\nauth_date={...}`
 * and the hash is HMAC-SHA256(secret, dataCheckString).
 */
export function createInitData(
  botId: string,
  userId: string,
  secret: string | Uint8Array,
  authDate = Math.floor(Date.now() / 1000),
): InitDataPayload {
  const dataCheckString = `bot_id=${botId}\nuser_id=${userId}\nauth_date=${authDate}`;
  const key = typeof secret === 'string' ? utf8ToBytes(secret) : secret;
  const hash = bytesToHex(hmac(sha256, key, utf8ToBytes(dataCheckString)));
  return { bot_id: botId, user_id: userId, auth_date: authDate, hash };
}

/** Constant-time equality to avoid timing leaks when comparing hashes. */
function constEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Verify init data. Returns the payload when the signature is valid and fresh. */
export function verifyInitData(
  initData: string,
  secret: string | Uint8Array,
  maxAgeSec = 24 * 60 * 60,
): InitDataPayload | null {
  const payload = parseInitDataString(initData);
  if (!payload) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - payload.auth_date > maxAgeSec || payload.auth_date > now + 60) return null;

  const expected = createInitData(payload.bot_id, payload.user_id, secret, payload.auth_date);
  const key = typeof secret === 'string' ? utf8ToBytes(secret) : secret;
  const expectedHash = utf8ToBytes(expected.hash);
  const actualHash = utf8ToBytes(payload.hash);
  if (!constEqual(expectedHash, actualHash)) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// postMessage bridge between host and sandboxed iframe
// ---------------------------------------------------------------------------

/** Message sent from the host TO the Mini App iframe. */
export type ToMiniAppMessage =
  | { type: 'mini_app.ready'; initData: string; themeParams: ThemeParams }
  | { type: 'mini_app.main_button'; action: 'show' | 'hide'; text?: string }
  | { type: 'mini_app.close' };

/** Message sent from the Mini App iframe TO the host. */
export type FromMiniAppMessage =
  | { type: 'mini_app.ready'; version: string }
  | { type: 'mini_app.close_requested' }
  | { type: 'mini_app.main_button_clicked' }
  | { type: 'mini_app.inline_query'; query: string };

/** Theme params passed to the Mini App (Telegram-compatible subset). */
export interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
}

/** Default dark theme matching Nova's palette. */
export const DEFAULT_THEME_PARAMS: ThemeParams = {
  bg_color: '#0b0c10',
  text_color: '#f1f2f6',
  hint_color: '#9aa0a6',
  link_color: '#ff4e18',
  button_color: '#ff4e18',
  button_text_color: '#ffffff',
};

/** Target origin check: only allow postMessage to the iframe's own src origin. */
export function iframeOrigin(webAppUrl: string): string | null {
  try {
    const u = new URL(webAppUrl);
    if (u.protocol !== 'https:') return null; // Mini Apps must be HTTPS
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
