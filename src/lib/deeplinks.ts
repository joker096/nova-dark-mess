/**
 * Deep-link / invite URL helpers for Nova Dark Messenger.
 *
 * Invite links are shareable, stateless URLs that carry a fingerprint (and
 * optionally a handle or chat id) so a peer can be added without a server.
 */

export interface NovaInvite {
  fingerprint: string;
  handle?: string;
  chatId?: string;
  nonce?: string;
}

export const NOVA_SCHEME = 'nova';
export const NOVA_INVITE_HOST = 'invite';

export function createInviteUrl(invite: NovaInvite, useHttpsFallback = false): string {
  const params = new URLSearchParams();
  params.set('fp', invite.fingerprint);
  if (invite.handle) params.set('handle', invite.handle);
  if (invite.chatId) params.set('chat', invite.chatId);
  if (invite.nonce) params.set('nonce', invite.nonce);

  const query = params.toString();
  if (useHttpsFallback) {
    return `https://nova.app/invite?${query}`;
  }
  return `${NOVA_SCHEME}://${NOVA_INVITE_HOST}?${query}`;
}

export function parseInviteUrl(url: string): NovaInvite | null {
  try {
    const normalized = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return null;
    }

    const isNovaScheme = parsed.protocol === `${NOVA_SCHEME}:`;
    const isHttpsInvite =
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      (parsed.hostname === 'nova.app' || parsed.hostname === 'invite.nova.app') &&
      parsed.pathname.replace(/\/+$/, '') === '/invite';

    if (!isNovaScheme && !isHttpsInvite) return null;
    if (isNovaScheme && parsed.hostname !== NOVA_INVITE_HOST) return null;

    const fingerprint = parsed.searchParams.get('fp');
    if (!fingerprint) return null;

    return {
      fingerprint,
      handle: parsed.searchParams.get('handle') ?? undefined,
      chatId: parsed.searchParams.get('chat') ?? undefined,
      nonce: parsed.searchParams.get('nonce') ?? undefined,
    };
  } catch {
    return null;
  }
}

export function isNovaDeepLink(url: string): boolean {
  return parseInviteUrl(url) !== null;
}
