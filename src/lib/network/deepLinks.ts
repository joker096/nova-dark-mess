/**
 * Deep links for invites and in-app navigation.
 *
 * Everything is offline-first: links carry navigation ids or one-time
 * contact/device invite payloads, never an account lookup.
 *   nova://chat/<id>        open a chat
 *   nova://channel/<id>     open a channel
 *   nova://channel/<id>?post=<postId>&comments=1   open a post's comments
 *   nova://profile/<id>     open a profile
 *   nova://contact/<invite> add a contact from a one-time invitation
 *   nova://site-handoff/<token>  continue a guest site thread in the messenger
 *   nova://device-link?…    device linking offer (see lib/p2p/deviceLinking)
 *   https://nova.app/…      the same targets as universal links
 *   https://nova.app/c/<token>#<key>  site handoff (key travels in the
 *     fragment only, never in the path or query, and is never logged)
 */

import { parseDeviceLinkOffer } from '../p2p/deviceLinking';

export type DeepLinkTarget =
  | { type: 'chat'; id: string }
  | {
      type: 'channel';
      id: string;
      /** Post the link points at, if any. */
      postId?: string;
      /** The link asked for the post's comments instead of the feed. */
      comments?: boolean;
    }
  | { type: 'profile'; id: string }
  | { type: 'bot'; id: string; /** Start payload carried with /start, if any. */ startPayload?: string }
  | { type: 'contact-invite'; code: string }
  | { type: 'site-handoff'; token: string; key?: string }
  | { type: 'device-link'; url: string };

export const DEEP_LINK_SCHEME = 'nova';
const getPublicAppHostname = (): string => {
  try {
    const url = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || 'https://mess.cvr.name';
    return new URL(url).hostname;
  } catch {
    return 'mess.cvr.name';
  }
};

export const DEEP_LINK_WEB_HOST = 'nova.app';
export const DEFAULT_APP_WEB_HOST = getPublicAppHostname();

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CONTACT_INVITE_PATTERN = /^[A-Za-z0-9_-]{1,4096}$/;
/** Handoff tokens are opaque gateway ids (base64url, ≥128 bits). */
const HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
/** Handoff thread keys are HKDF-derived material, base64url. */
const HANDOFF_KEY_PATTERN = /^[A-Za-z0-9_-]{16,512}$/;
const NESTED_TYPES = new Set(['chat', 'channel', 'profile', 'bot']);

function parseSiteHandoff(token: string | undefined, key: string | undefined): DeepLinkTarget | null {
  if (!token || !HANDOFF_TOKEN_PATTERN.test(token)) return null;
  const trimmedKey = key?.trim();
  if (trimmedKey && !HANDOFF_KEY_PATTERN.test(trimmedKey)) return null;
  return trimmedKey
    ? { type: 'site-handoff', token, key: trimmedKey }
    : { type: 'site-handoff', token };
}

function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Reads the optional post target a channel link can carry. */
function readChannelContext(parsed: URL): { postId?: string; comments?: boolean } {
  const post = parsed.searchParams.get('post')?.trim() ?? '';
  if (!post || !isValidId(post)) return {};
  const comments = parsed.searchParams.get('comments') === '1';
  return comments ? { postId: post, comments } : { postId: post };
}

/** Parses a deep link into a navigation target, or null if it is not one. */
export function parseDeepLink(input: string): DeepLinkTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol === `${DEEP_LINK_SCHEME}:`) {
    if (parsed.hostname === 'device-link') {
      return parseDeviceLinkOffer(trimmed) ? { type: 'device-link', url: trimmed } : null;
    }
    if (parsed.hostname === 'contact') {
      const code = parsed.pathname.replace(/^\/+|\/+$/g, '');
      return CONTACT_INVITE_PATTERN.test(code) && !parsed.search && !parsed.hash
        ? { type: 'contact-invite', code }
        : null;
    }
    // nova://site-handoff/<token>#<key> and the landing-page alias
    // nova://widget-handoff?token=<token>#<key> (used by landing/c.html)
    if (parsed.hostname === 'site-handoff' || parsed.hostname === 'widget-handoff') {
      const token =
        parsed.hostname === 'widget-handoff'
          ? (parsed.searchParams.get('token')?.trim() ?? '')
          : parsed.pathname.replace(/^\/+|\/+$/g, '');
      return parseSiteHandoff(token, parsed.hash.replace(/^#/, '') || undefined);
    }
    if (!NESTED_TYPES.has(parsed.hostname)) return null;
    // nova://chat/<id>   nova://bot/<id>?start=<payload>
    const id = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!isValidId(id)) return null;
    const start = parsed.searchParams.get('start')?.trim() ?? undefined;
    if (parsed.hostname === 'channel') {
      return { type: 'channel', id, ...readChannelContext(parsed) };
    }
    if (parsed.hostname === 'bot') {
      return { type: 'bot', id, startPayload: start };
    }
    return { type: parsed.hostname as 'chat' | 'profile', id };
  }

  if (
    parsed.protocol === 'https:' &&
    (parsed.hostname === DEEP_LINK_WEB_HOST ||
      parsed.hostname === DEFAULT_APP_WEB_HOST ||
      parsed.hostname === `www.${DEFAULT_APP_WEB_HOST}`)
  ) {
    const [type, id] = parsed.pathname.split('/').filter(Boolean);
    // https://<app>/c/<token>#<key> — guest handoff; the key stays in the
    // fragment so it is never sent to the server or logged.
    if (type === 'c' && id) {
      return parseSiteHandoff(id, parsed.hash.replace(/^#/, '') || undefined);
    }
    if (!type || !NESTED_TYPES.has(type) || !id) return null;
    if (!isValidId(id)) return null;
    if (type === 'channel') {
      return { type: 'channel', id, ...readChannelContext(parsed) };
    }
    if (type === 'bot') {
      return { type: 'bot', id, startPayload: parsed.searchParams.get('start') ?? undefined };
    }
    return { type: type as 'chat' | 'profile', id };
  }

  return null;
}

/** Builds a shareable deep link for a chat, channel, post or profile. */
export function buildDeepLink(target: DeepLinkTarget): string {
  if (target.type === 'device-link') return target.url;
  if (target.type === 'contact-invite') {
    return `${DEEP_LINK_SCHEME}://contact/${encodeURIComponent(target.code)}`;
  }
  if (target.type === 'bot') {
    const base = `${DEEP_LINK_SCHEME}://bot/${encodeURIComponent(target.id)}`;
    if (!target.startPayload) return base;
    return `${base}?start=${encodeURIComponent(target.startPayload)}`;
  }
  if (target.type === 'site-handoff') {
    return `${DEEP_LINK_SCHEME}://site-handoff/${encodeURIComponent(target.token)}`;
  }
  const base = `${DEEP_LINK_SCHEME}://${target.type}/${encodeURIComponent(target.id)}`;
  if (target.type !== 'channel' || !target.postId) return base;
  const params = new URLSearchParams({ post: target.postId });
  if (target.comments) params.set('comments', '1');
  return `${base}?${params.toString()}`;
}

export function buildContactInviteUrl(
  code: string,
  appBaseUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || 'https://mess.cvr.name',
): string {
  if (!CONTACT_INVITE_PATTERN.test(code)) {
    throw new Error('Contact invite code is invalid.');
  }
  const url = new URL(appBaseUrl);
  const isLocalHttp =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]');
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('Contact invite links must use HTTPS.');
  }
  url.hash = buildDeepLink({ type: 'contact-invite', code });
  return url.toString();
}

/**
 * Extracts a deep link from a page location, e.g. `#nova://chat/katie`.
 * Returns null when the hash holds no valid link.
 */
export function parseDeepLinkFromHash(hash: string): DeepLinkTarget | null {
  const cleaned = hash.replace(/^#\/?/, '');
  if (!cleaned) return null;
  return parseDeepLink(cleaned);
}
