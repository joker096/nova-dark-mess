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
  /**
   * Optional second queue on another relay. Senders try the primary first and
   * fall back to this one when the primary relay is unreachable, so an outage
   * of one host does not silently stop the conversation. The nested invite has
   * no `standby` of its own; `isAnonInvite` enforces that.
   */
  standby?: Omit<AnonInvite, 'standby'>;
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
  if (invite.standby !== undefined) {
    if (!isAnonInvite(invite.standby)) return false;
    if (invite.standby.standby !== undefined) return false;
    if (invite.standby.queueId === invite.queueId) return false;
    if (invite.standby.relayUrl === invite.relayUrl) return false;
    // The backup queue must belong to the same contact and encrypt to the same
    // recipient key; otherwise a malicious primary invite could redirect
    // fallback traffic to a third party.
    if (invite.standby.identityKey !== invite.identityKey) return false;
    if (invite.standby.recipientPublicKey !== invite.recipientPublicKey) return false;
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

/**
 * Why a packet was dropped. Only `undecodable` packets may be acknowledged
 * without showing them to the user:
 *
 * - `undecodable`: not a Nova packet at all (truncated, wrong padding, foreign
 *   traffic). Nothing can ever be recovered from it, so keeping it only fills
 *   the queue.
 * - `unreadable`: a well-formed sealed packet this key cannot open. It may still
 *   belong to another recipient or an older identity, so it must stay queued
 *   until the TTL instead of being destroyed.
 */
export type DroppedPacketReason = 'undecodable' | 'unreadable';

export interface DroppedAnonPacket {
  packetId: string;
  reason: DroppedPacketReason;
  profile?: PacketProfile;
}

export interface ReceiveAnonOptions {
  /**
   * Acknowledge packets that cannot be decoded so they leave the queue instead
   * of sitting there until the TTL. Defaults to off: acknowledging is what
   * permanently deletes a packet from the relay, so callers opt in.
   */
  ackUndecodable?: boolean;
}

export interface AnonReceiveResult {
  packets: ReceivedAnonPacket[];
  /** Packets that were polled but not returned, with the reason. */
  dropped: DroppedAnonPacket[];
}

export async function receiveAnonPackets(
  transport: AnonTransport,
  queueId: string,
  recipientToken: string,
  recipientPrivateKey: string,
  limit = 32,
  signingKey?: string,
  options: ReceiveAnonOptions = {},
): Promise<ReceivedAnonPacket[]> {
  const { packets } = await receiveAnonPacketsDetailed(
    transport,
    queueId,
    recipientToken,
    recipientPrivateKey,
    limit,
    signingKey,
    options,
  );
  return packets;
}

/**
 * Same as `receiveAnonPackets`, plus the list of dropped packets. Use this when
 * the caller needs to tell the user that something was unreadable.
 */
export async function receiveAnonPacketsDetailed(
  transport: AnonTransport,
  queueId: string,
  recipientToken: string,
  recipientPrivateKey: string,
  limit = 32,
  signingKey?: string,
  options: ReceiveAnonOptions = {},
): Promise<AnonReceiveResult> {
  const polled = await transport.poll(queueId, recipientToken, limit, signingKey);
  const packets = (polled as PollResult).packets || [];
  const messages: ReceivedAnonPacket[] = [];
  const dropped: DroppedAnonPacket[] = [];

  for (const packet of packets) {
    let bytes: Uint8Array;
    let profile: PacketProfile;
    let jsonBytes: Uint8Array;
    try {
      bytes = base64ToUint8(packet.payload);
      // Senders pick the profile per payload (files use 'large'), so the
      // receiver must derive it from the length instead of assuming 'standard'.
      profile = profileForPacketSize(bytes.length);
      jsonBytes = decodeFixedPacket(bytes, profile);
    } catch {
      dropped.push({ packetId: packet.packetId, reason: 'undecodable' });
      continue;
    }

    try {
      const json = new TextDecoder().decode(jsonBytes);
      const sealed = JSON.parse(json);
      const plaintext = await unsealMessageAsync(recipientPrivateKey, sealed);
      messages.push({ packetId: packet.packetId, body: plaintext, profile });
    } catch {
      // Shaped like a Nova packet but this key cannot open it: leave it for the
      // TTL so a co-recipient or a later identity can still read it.
      dropped.push({ packetId: packet.packetId, reason: 'unreadable', profile });
    }
  }

  if (options.ackUndecodable) {
    const undecodableIds = dropped
      .filter((packet) => packet.reason === 'undecodable')
      .map((packet) => packet.packetId);
    if (undecodableIds.length > 0) {
      await transport.ack(queueId, recipientToken, undecodableIds, signingKey);
    }
  }

  return { packets: messages, dropped };
}
