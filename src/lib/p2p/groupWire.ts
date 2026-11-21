/**
 * Wire framing for group traffic that travels over a 1:1 P2P session
 * (docs/bots-roadmap.md B4).
 *
 * `GroupPayload` frames are wrapped in a versioned envelope so ordinary chat
 * text can never be mistaken for a group frame, and a peer that does not speak
 * groups ignores the message instead of failing to parse it. The client routes
 * these frames to its `GroupChatManager`; the bot gateway decodes them the same
 * way, which is what lets a bot participate in a group as a normal member.
 */

import type { GroupPayload } from './groupManager';

export const GROUP_WIRE_TAG = '__nova_group';
export const GROUP_WIRE_VERSION = 1;

export interface GroupWireEnvelope {
  [GROUP_WIRE_TAG]: typeof GROUP_WIRE_VERSION;
  payload: GroupPayload;
}

export function wrapGroupPayload(payload: GroupPayload): string {
  const envelope: GroupWireEnvelope = {
    [GROUP_WIRE_TAG]: GROUP_WIRE_VERSION,
    payload,
  };
  return JSON.stringify(envelope);
}

/** Returns the wrapped `GroupPayload`, or `null` for ordinary chat text. */
export function parseGroupEnvelope(text: string): GroupPayload | null {
  if (typeof text !== 'string' || !text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text) as Partial<GroupWireEnvelope> | null;
    if (!parsed || parsed[GROUP_WIRE_TAG] !== GROUP_WIRE_VERSION || !parsed.payload) return null;
    const payload = parsed.payload;
    return typeof payload === 'object' && typeof payload.type === 'string' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Gateway-side filter for group frames that are not chat messages yet. The
 * bot is a normal group member, so it must never consume its own echo.
 * Sender-key and membership traffic (`skdm`, `group_roles`,
 * `group_join_request`, `group_join_response`) passes — dropping an SKDM would
 * leave the bot unable to decrypt anything afterwards.
 */
export function isAllowedGroupPayload(
  payload: GroupPayload,
  botFingerprint: string,
): boolean {
  if (payload.type !== 'group_message') return true;
  // The ciphertext cannot be judged here without the sender key, and the
  // mention decision belongs to the receiver (after decryption, see the
  // gateway's `onMessage`). This check only drops the bot's own echo.
  return payload.senderFingerprint !== botFingerprint;
}

/** Same rule the client applies to L1 bots (`mention_only` permission). */
export function isGroupMessageAllowed(text: string, botId: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith('/')) return true;
  const lowered = trimmed.toLowerCase();
  return (
    lowered.includes(`@${botId.toLowerCase()}`) ||
    lowered.includes(`bot:${botId.toLowerCase()}`)
  );
}
