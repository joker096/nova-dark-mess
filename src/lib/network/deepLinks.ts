/**
 * Deep links for invites and in-app navigation.
 *
 * Everything is offline-first: links are plain URLs that carry an id or a
 * one-time device-link offer, never an account or contact server.
 *   nova://chat/<id>        open a chat
 *   nova://channel/<id>     open a channel
 *   nova://profile/<id>     open a profile
 *   nova://device-link?…    device linking offer (see lib/p2p/deviceLinking)
 *   https://nova.app/…      the same targets as universal links
 */

import { parseDeviceLinkOffer } from '../p2p/deviceLinking';

export type DeepLinkTarget =
  | { type: 'chat'; id: string }
  | { type: 'channel'; id: string }
  | { type: 'profile'; id: string }
  | { type: 'device-link'; url: string };

export const DEEP_LINK_SCHEME = 'nova';
export const DEEP_LINK_WEB_HOST = 'nova.app';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const NESTED_TYPES = new Set(['chat', 'channel', 'profile']);

function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
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
    if (!NESTED_TYPES.has(parsed.hostname)) return null;
    // nova://chat/<id>
    const id = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!isValidId(id)) return null;
    return { type: parsed.hostname as 'chat' | 'channel' | 'profile', id };
  }

  if (parsed.protocol === 'https:' && parsed.hostname === DEEP_LINK_WEB_HOST) {
    const [type, id] = parsed.pathname.split('/').filter(Boolean);
    if (!type || !NESTED_TYPES.has(type) || !id) return null;
    if (!isValidId(id)) return null;
    return { type: type as 'chat' | 'channel' | 'profile', id };
  }

  return null;
}

/** Builds a shareable deep link for a chat, channel or profile. */
export function buildDeepLink(target: DeepLinkTarget): string {
  if (target.type === 'device-link') return target.url;
  return `${DEEP_LINK_SCHEME}://${target.type}/${encodeURIComponent(target.id)}`;
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
