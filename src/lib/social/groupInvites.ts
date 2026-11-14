/**
 * Group invite links.
 *
 * Offline-first: an invite is just a deep link plus a random local token. No
 * server, no directory — the link only identifies the chat, and the token lets
 * a device recognise that it was invited rather than opening an unrelated chat.
 */

const INVITE_KEY_PREFIX = 'nova_group_invite_';
const TOKEN_BYTES = 12;

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildGroupInviteLink(chatId: string, token: string): string {
  return `nova://chat/${encodeURIComponent(chatId)}?invite=${encodeURIComponent(token)}`;
}

function storageKey(chatId: string): string {
  return `${INVITE_KEY_PREFIX}${chatId}`;
}

/** Returns the stored invite token for a group, or null when none was minted yet. */
export function loadGroupInviteToken(chatId: string): string | null {
  try {
    const token = localStorage.getItem(storageKey(chatId));
    return token && /^[a-f0-9]{8,64}$/i.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** Mints a fresh token for the group and persists it, replacing any previous one. */
export function regenerateGroupInviteToken(chatId: string): string {
  const token = randomToken();
  try {
    localStorage.setItem(storageKey(chatId), token);
  } catch {
    /* storage unavailable: the token still works for this session */
  }
  return token;
}

/** Loads the group's invite token, minting one on first use. */
export function getOrCreateGroupInvite(chatId: string): { token: string; link: string } {
  const token = loadGroupInviteToken(chatId) ?? regenerateGroupInviteToken(chatId);
  return { token, link: buildGroupInviteLink(chatId, token) };
}
