import { sealMessageAsync, unsealMessageAsync } from '../messaging/sealedSender';
import { isQueueId, isQueueToken } from './ids';
import {
  base64ToUint8,
  decodeFixedPacket,
  encodeFixedPacket,
  profileForPacketSize,
  uint8ToBase64,
} from './packet';
import { isQueuePrivateKey, isQueuePublicKey } from './signing';
import { isInviteToken, isPowChallenge, solvePow, type PowChallenge, type PowSolution } from './spam';
import type { AnonTransport, EnqueueResult, PacketProfile, PollResult } from './types';

export interface AnonInvite {
  v: 1;
  relayUrl: string;
  queueId: string;
  senderToken: string;
  signingKey: string;
  recipientPublicKey: string;
  expiresAt: number;
  /** Optional self-asserted name shown in the contact list. */
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
}

const solvedPow = new Map<string, PowSolution>();

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function powCacheKey(invite: AnonInvite): string {
  return `${invite.queueId}:${invite.pow?.challenge}:${invite.pow?.difficulty}`;
}

async function solutionFor(invite: AnonInvite): Promise<PowSolution | undefined> {
  if (!invite.pow) return undefined;
  const key = powCacheKey(invite);
  const existing = solvedPow.get(key);
  if (existing) return existing;
  const solution = await solvePow(invite.pow);
  solvedPow.set(key, solution);
  return solution;
}

export function clearPowCache(): void {
  solvedPow.clear();
}

export function isAllowedRelayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;
    // Plain http is only acceptable on loopback (dev) or inside a Tor onion
    // circuit, where the onion service authenticates and encrypts the hop.
    if (url.hostname.endsWith('.onion')) return url.hostname.length > '.onion'.length;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

export function isAnonInvite(value: unknown): value is AnonInvite {
  if (!value || typeof value !== 'object') return false;
  const invite = value as Partial<AnonInvite>;
  if (
    invite.v !== 1 ||
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
  try {
    return atob(invite.recipientPublicKey).length === 32;
  } catch {
    return false;
  }
}

export function encodeInvite(invite: AnonInvite): string {
  return btoa(JSON.stringify(invite))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

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

export async function sendAnonMessage(
  transport: AnonTransport,
  invite: AnonInvite,
  plaintext: string,
  profile: PacketProfile = 'standard',
): Promise<EnqueueResult | null> {
  const sealed = await sealMessageAsync(invite.recipientPublicKey, plaintext);
  const json = JSON.stringify(sealed);
  const bytes = new TextEncoder().encode(json);
  const packet = encodeFixedPacket(bytes, profile);
  const payload = uint8ToBase64(packet);
  const pow = await solutionFor(invite);
  return transport.enqueue(
    invite.queueId,
    invite.senderToken,
    payload,
    invite.signingKey,
    pow,
    invite.inviteToken,
  );
}

export async function receiveAnonMessages(
  transport: AnonTransport,
  queueId: string,
  recipientToken: string,
  recipientPrivateKey: string,
  limit = 32,
  signingKey?: string,
): Promise<string[]> {
  const received = await receiveAnonPackets(
    transport,
    queueId,
    recipientToken,
    recipientPrivateKey,
    limit,
    signingKey,
  );
  if (received.length > 0) {
    await transport.ack(
      queueId,
      recipientToken,
      received.map(({ packetId }) => packetId),
      signingKey,
    );
  }
  return received.map(({ body }) => body);
}

export interface ReceivedAnonPacket {
  packetId: string;
  body: string;
  /** Padding profile the packet was framed with, recovered from its length. */
  profile: PacketProfile;
}

export async function receiveAnonPackets(
  transport: AnonTransport,
  queueId: string,
  recipientToken: string,
  recipientPrivateKey: string,
  limit = 32,
  signingKey?: string,
): Promise<ReceivedAnonPacket[]> {
  const polled = await transport.poll(queueId, recipientToken, limit, signingKey);
  const packets = (polled as PollResult).packets || [];
  const messages: ReceivedAnonPacket[] = [];
  for (const packet of packets) {
    try {
      const bytes = base64ToUint8(packet.payload);
      // Senders pick the profile per payload (files use 'large'), so the
      // receiver must derive it from the length instead of assuming 'standard'.
      const profile = profileForPacketSize(bytes.length);
      const jsonBytes = decodeFixedPacket(bytes, profile);
      const json = new TextDecoder().decode(jsonBytes);
      const sealed = JSON.parse(json);
      const plaintext = await unsealMessageAsync(recipientPrivateKey, sealed);
      messages.push({ packetId: packet.packetId, body: plaintext, profile });
    } catch {
      // Skip malformed packets; leave them for TTL cleanup.
    }
  }
  return messages;
}
