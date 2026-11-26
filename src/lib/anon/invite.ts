/**
 * Anonymous Invite (A10)
 *
 * Invariant fields and serialization for transport.
 * The invite is the only way a sender discovers the recipient's queue.
 * It must be self-contained, verifiable, and expire.
 */

import { isQueueId, isQueueToken } from './ids';
import { isInviteToken, isPowChallenge, type PowChallenge } from './spam';
import { isQueuePrivateKey, isQueuePublicKey } from './crypto';

/**
 * Current invite version. Increment on breaking changes.
 * Version 1: initial schema (relayUrl, queueId, senderToken, signingKey,
 * recipientPublicKey, inviteToken, expiresAt, optional displayName, identityKey,
 * identitySignature, pow, standby)
 */
export const INVITE_VERSION = 1 as const;

/**
 * Anonymous invite — the complete payload a recipient shares with a sender.
 *
 * Wire format: base64url(JSON) produced by `encodeInvite`, parsed by `decodeInvite`.
 * The decoded object is validated by `isAnonInvite`.
 */
export interface AnonInvite {
  /** Schema version. Must equal `INVITE_VERSION`. */
  v: typeof INVITE_VERSION;

  /** HTTPS (or http://localhost/.onion) URL of the relay hosting the queue. */
  relayUrl: string;

  /** Queue identifier (format: q_[0-9a-f]{32}). */
  queueId: string;

  /** Sender bearer token for enqueue operations. */
  senderToken: string;

  /** Ed25519 private key used to sign the first enqueue and subsequent commands. */
  signingKey: string;

  /** X25519 public key (base64) the sender encrypts messages to. */
  recipientPublicKey: string;

  /** Queue expiry as Unix ms. The relay rejects operations after this time. */
  expiresAt: number;

  /** Optional self-asserted name shown in the contact list (≤64 chars, no control chars). */
  displayName?: string;

  /**
   * Public signing key of the contact's first queue. Queue keys are rotated on
   * relay moves, so this is what local block lists and contact recognition use.
   * On rotation, `identitySignature` is an Ed25519 signature by this key over
   * the new queue signing key. A first invite can omit it because the identity
   * is the queue key itself.
   */
  identityKey?: string;

  /** Binding of `identityKey` to the current queue key; absent on legacy invites. */
  identitySignature?: string;

  /** Optional first-contact proof-of-work required by the relay. */
  pow?: PowChallenge;

  /**
   * One-time invite token: required by the relay on the first enqueue and
   * burned afterwards, so a leaked invite cannot establish a second contact.
   */
  inviteToken: string;

  /**
   * Optional second queue on another relay. Senders try the primary first and
   * fall back to this one when the primary relay is unreachable, so an outage
   * of one host does not silently stop the conversation. The nested invite has
   * no `standby` of its own; `isAnonInvite` enforces that.
   */
  standby?: Omit<AnonInvite, 'standby'>;
}

/**
 * Minimal invite fields required for a valid first contact.
 * Used when only the essential transport data is needed (e.g., deep links).
 */
export interface AnonInviteMinimal {
  relayUrl: string;
  queueId: string;
  senderToken: string;
  signingKey: string;
  recipientPublicKey: string;
  inviteToken: string;
  expiresAt: number;
}

/**
 * Validates a relay URL: https only, or http://localhost/.onion for dev/Tor.
 */
export function isAllowedRelayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;
    if (url.hostname.endsWith('.onion')) return url.hostname.length > '.onion'.length;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

/**
 * Full invite validation (A10 invariant).
 *
 * Checks:
 * - Version matches `INVITE_VERSION`
 * - Relay URL is allowed
 * - Queue ID format
 * - Sender token format
 * - Signing key is a valid Ed25519 private key
 * - Recipient public key is 32 bytes base64
 * - Expiry is a future finite timestamp
 * - Invite token format
 * - Display name constraints (if present)
 * - PoW challenge format (if present)
 * - Identity key format (if present)
 * - Identity signature format (if present)
 * - Standby invite validity and cross-field constraints (if present)
 */
export function isAnonInvite(value: unknown): value is AnonInvite {
  if (!value || typeof value !== 'object') return false;
  const invite = value as Partial<AnonInvite>;

  if (
    invite.v !== INVITE_VERSION ||
    typeof invite.relayUrl !== 'string' ||
    !isAllowedRelayUrl(invite.relayUrl) ||
    typeof invite.queueId !== 'string' ||
    !isQueueId(invite.queueId) ||
    typeof invite.senderToken !== 'string' ||
    !isQueueToken(invite.senderToken) ||
    !isQueuePrivateKey(invite.signingKey) ||
    typeof invite.recipientPublicKey !== 'string' ||
    invite.recipientPublicKey.length < 40 ||
    typeof invite.expiresAt !== 'number' ||
    !Number.isFinite(invite.expiresAt) ||
    invite.expiresAt <= Date.now() ||
    !isInviteToken(invite.inviteToken) ||
    (invite.displayName !== undefined &&
      (typeof invite.displayName !== 'string' ||
        invite.displayName.length > 64 ||
        containsControlCharacters(invite.displayName))) ||
    (invite.pow !== undefined && !isPowChallenge(invite.pow)) ||
    (invite.identityKey !== undefined && !isQueuePublicKey(invite.identityKey)) ||
    (invite.identitySignature !== undefined &&
      (typeof invite.identitySignature !== 'string' ||
        invite.identitySignature.length === 0 ||
        invite.identityKey === undefined))
  ) {
    return false;
  }

  if (invite.standby !== undefined) {
    if (!isAnonInvite(invite.standby)) return false;
    if (invite.standby.standby !== undefined) return false; // no nested standby
    if (invite.standby.queueId === invite.queueId) return false;
    if (invite.standby.relayUrl === invite.relayUrl) return false;
    // The backup queue must belong to the same contact and encrypt to the same
    // recipient key; otherwise a malicious primary invite could redirect
    // fallback traffic to a third party.
    if (invite.standby.identityKey !== invite.identityKey) return false;
    if (invite.standby.recipientPublicKey !== invite.recipientPublicKey) return false;
  }

  // Verify recipientPublicKey decodes to exactly 32 bytes (X25519)
  try {
    return atob(invite.recipientPublicKey).length === 32;
  } catch {
    return false;
  }
}

/**
 * Validates a minimal invite (for deep links / QR codes that omit optional fields).
 */
export function isAnonInviteMinimal(value: unknown): value is AnonInviteMinimal {
  if (!value || typeof value !== 'object') return false;
  const invite = value as Partial<AnonInviteMinimal>;
  return (
    typeof invite.relayUrl === 'string' &&
    isAllowedRelayUrl(invite.relayUrl) &&
    typeof invite.queueId === 'string' &&
    isQueueId(invite.queueId) &&
    typeof invite.senderToken === 'string' &&
    isQueueToken(invite.senderToken) &&
    isQueuePrivateKey(invite.signingKey) &&
    typeof invite.recipientPublicKey === 'string' &&
    invite.recipientPublicKey.length >= 40 &&
    isInviteToken(invite.inviteToken) &&
    typeof invite.expiresAt === 'number' &&
    Number.isFinite(invite.expiresAt) &&
    invite.expiresAt > Date.now()
  );
}

/**
 * Serializes an invite to base64url (URL-safe, no padding).
 * This is the canonical wire format for deep links, QR codes, and contact sharing.
 */
export function encodeInvite(invite: AnonInvite): string {
  return btoa(JSON.stringify(invite))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Parses a base64url invite string and validates it.
 * Returns the typed invite on success, null on any parse/validation failure.
 */
export function decodeInvite(code: string): AnonInvite | null {
  try {
    const padded = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as unknown;
    return isAnonInvite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Extracts the minimal transport fields from a full invite.
 * Useful when only the transport path is needed (e.g., building a deep link).
 */
export function toMinimalInvite(invite: AnonInvite): AnonInviteMinimal {
  return {
    relayUrl: invite.relayUrl,
    queueId: invite.queueId,
    senderToken: invite.senderToken,
    signingKey: invite.signingKey,
    recipientPublicKey: invite.recipientPublicKey,
    inviteToken: invite.inviteToken,
    expiresAt: invite.expiresAt,
  };
}

/**
 * Creates a deep-link URL for the invite.
 * Uses the `nova://invite` scheme with query parameters.
 */
export function createInviteUrl(invite: AnonInvite, useHttpsFallback = false): string {
  const params = new URLSearchParams();
  params.set('fp', invite.queueId); // fingerprint = queueId for backwards compat
  params.set('st', invite.senderToken);
  params.set('sk', invite.signingKey);
  params.set('rp', invite.recipientPublicKey);
  params.set('it', invite.inviteToken);
  params.set('exp', String(invite.expiresAt));
  if (invite.displayName) params.set('dn', invite.displayName);
  if (invite.identityKey) params.set('ik', invite.identityKey);
  if (invite.identitySignature) params.set('is', invite.identitySignature);
  if (invite.pow) params.set('pow', JSON.stringify(invite.pow));
  if (invite.standby) {
    params.set('sb', encodeInvite(invite.standby));
  }

  const base = useHttpsFallback ? 'https://nova.app/invite' : 'nova://invite';
  return `${base}?${params.toString()}`;
}

/**
 * Parses a deep-link URL back into an invite.
 * Supports both `nova://invite?...` and `https://nova.app/invite?...` forms.
 */
export function parseInviteUrl(url: string): AnonInvite | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'nova:' && parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'invite' && parsed.hostname !== 'nova.app') return null;
    if (parsed.pathname.replace(/\/+$/, '') !== '/invite') return null;

    const fp = parsed.searchParams.get('fp');
    const st = parsed.searchParams.get('st');
    const sk = parsed.searchParams.get('sk');
    const rp = parsed.searchParams.get('rp');
    const it = parsed.searchParams.get('it');
    const exp = parsed.searchParams.get('exp');
    const dn = parsed.searchParams.get('dn') || undefined;
    const ik = parsed.searchParams.get('ik') || undefined;
    const is_ = parsed.searchParams.get('is') || undefined;
    const powStr = parsed.searchParams.get('pow');
    const sb = parsed.searchParams.get('sb');

    if (!fp || !st || !sk || !rp || !it || !exp) return null;

    const expiresAt = Number(exp);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

    let pow: PowChallenge | undefined;
    if (powStr) {
      try {
        pow = JSON.parse(powStr);
        if (!isPowChallenge(pow)) return null;
      } catch {
        return null;
      }
    }

    let standby: AnonInvite | undefined;
    if (sb) {
      const decoded = decodeInvite(sb);
      if (!decoded) return null;
      standby = decoded;
    }

    const invite: AnonInvite = {
      v: INVITE_VERSION,
      relayUrl: 'https://relay.nova.app', // placeholder; actual relayUrl not in deep link
      queueId: fp,
      senderToken: st,
      signingKey: sk,
      recipientPublicKey: rp,
      inviteToken: it,
      expiresAt,
      ...(dn ? { displayName: dn } : {}),
      ...(ik ? { identityKey: ik } : {}),
      ...(is_ ? { identitySignature: is_ } : {}),
      ...(pow ? { pow } : {}),
      ...(standby ? { standby } : {}),
    };

    // relayUrl is not in the deep link; caller must resolve it from config
    return isAnonInvite(invite) ? invite : null;
  } catch {
    return null;
  }
}

/**
 * Checks if a string is a valid Nova invite deep link or HTTPS fallback.
 */
export function isNovaInviteUrl(value: string): boolean {
  return parseInviteUrl(value) !== null;
}