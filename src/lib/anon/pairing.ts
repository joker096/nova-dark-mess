import { x25519 } from '@noble/curves/ed25519.js';
import { bufferToBase64 } from '../crypto/aes';
import { isQueueId, isQueueToken } from './ids';
import {
  isAllowedRelayUrl,
  isAnonInvite,
  receiveAnonPackets,
  sendAnonMessage,
  type AnonInvite,
} from './session';
import {
  isQueuePrivateKey,
  isQueuePublicKey,
  queueSigningPublicKey,
} from './signing';
import {
  createPowChallenge,
  POW_MAX_DIFFICULTY,
  POW_MIN_DIFFICULTY,
  type PowChallenge,
} from './spam';
import type { AnonTransport, CreatedQueue } from './types';
import { isBlocked } from './blocks';
import {
  nextRelay,
  shouldRotateQueue,
  DEFAULT_QUEUE_ROTATION_MS,
  type RelayEndpoint,
} from './relays';

export interface InboxTransport extends AnonTransport {
  createQueue(
    ttlMs?: number,
    pow?: PowChallenge,
  ): CreatedQueue | null | Promise<CreatedQueue | null>;
}

export interface LocalInbox {
  relayUrl: string;
  queueId: string;
  senderToken: string;
  recipientToken: string;
  signingKey: string;
  signingPublicKey: string;
  recipientPublicKey: string;
  recipientPrivateKey: string;
  pow?: PowChallenge;
  /** One-time invite token the first sender must present; burned by the relay. */
  inviteToken: string;
  displayName?: string;
  createdAt: number;
  expiresAt: number;
  relays?: RelayEndpoint[];
}

export interface Invitation {
  inbox: LocalInbox;
  invite: AnonInvite;
}

export interface Contact {
  inbox: LocalInbox;
  peerInvite: AnonInvite;
  createdAt: number;
}

export interface InboxMessage {
  body: string;
  offer: AnonInvite | null;
}

export interface InboxPacket extends InboxMessage {
  packetId: string;
}

export const CONTACT_OFFER_TYPE = 'nova-anon-contact-offer';

export function inviteFromInbox(inbox: LocalInbox): AnonInvite {
  return {
    v: 1,
    relayUrl: inbox.relayUrl,
    queueId: inbox.queueId,
    senderToken: inbox.senderToken,
    signingKey: inbox.signingKey,
    recipientPublicKey: inbox.recipientPublicKey,
    inviteToken: inbox.inviteToken,
    ...(inbox.displayName ? { displayName: inbox.displayName } : {}),
    expiresAt: inbox.expiresAt,
    ...(inbox.pow ? { pow: inbox.pow } : {}),
  };
}

export async function createInvitation(
  transport: InboxTransport,
  relayUrl: string,
  ttlMs?: number,
  powDifficulty?: number,
  displayName?: string,
): Promise<Invitation | null> {
  if (!isAllowedRelayUrl(relayUrl)) return null;
  let pow: PowChallenge | undefined;
  if (powDifficulty !== undefined) {
    if (
      !Number.isInteger(powDifficulty) ||
      powDifficulty < POW_MIN_DIFFICULTY ||
      powDifficulty > POW_MAX_DIFFICULTY
    ) {
      return null;
    }
    pow = createPowChallenge(powDifficulty);
  }
  const created = await transport.createQueue(ttlMs, pow);
  if (
    !created ||
    !isQueueId(created.queueId) ||
    !isQueueToken(created.senderToken) ||
    !isQueueToken(created.recipientToken) ||
    !isQueuePrivateKey(created.signingKey) ||
    !isQueuePublicKey(created.signingPublicKey) ||
    !Number.isFinite(created.expiresAt) ||
    created.expiresAt <= Date.now()
  ) {
    return null;
  }

  const secret = x25519.utils.randomSecretKey();
  const inbox: LocalInbox = {
    relayUrl,
    queueId: created.queueId,
    senderToken: created.senderToken,
    recipientToken: created.recipientToken,
    signingKey: created.signingKey,
    signingPublicKey: created.signingPublicKey,
    recipientPublicKey: bufferToBase64(x25519.getPublicKey(secret)),
    recipientPrivateKey: bufferToBase64(secret),
    inviteToken: created.inviteToken,
    ...(displayName?.trim() ? { displayName: displayName.trim().slice(0, 64) } : {}),
    ...(pow ? { pow } : {}),
    createdAt: Date.now(),
    expiresAt: created.expiresAt,
  };
  const invite = inviteFromInbox(inbox);
  if (!isAnonInvite(invite)) return null;
  return { inbox, invite };
}

/**
 * Moves an inbox to the next configured relay once its rotation window passed.
 *
 * `transportFor` must build a transport for the given relay URL: rotation is
 * only meaningful if the new queue is created on the *next* relay, so the
 * caller decides how a URL becomes a transport (direct, proxied, or test
 * double). The returned inbox carries a fresh invite; contacts keep their
 * identity because the contact id is the sender's signing key, not the queue.
 */
export async function rotateInbox(
  transportFor: (relayUrl: string) => InboxTransport | Promise<InboxTransport>,
  inbox: LocalInbox,
  now: number = Date.now(),
): Promise<LocalInbox | null> {
  const relays = inbox.relays;
  if (!relays || relays.length < 2) return null;
  if (!shouldRotateQueue(inbox.createdAt, now, DEFAULT_QUEUE_ROTATION_MS)) return null;
  const current: RelayEndpoint =
    relays.find((relay) => relay.url === inbox.relayUrl) ?? { id: inbox.relayUrl, url: inbox.relayUrl };
  const next = nextRelay(current, relays);
  if (!next || next.url === inbox.relayUrl) return null;
  const transport = await transportFor(next.url);
  // One challenge, used both for the relay and for the invite. Creating two
  // made the advertised challenge differ from the stored one, so every first
  // contact to a rotated inbox failed with "Invalid proof of work".
  const pow = createPowChallenge(inbox.pow?.difficulty ?? POW_MIN_DIFFICULTY);
  const created = await transport.createQueue(Math.max(0, inbox.expiresAt - now), pow);
  if (!created) return null;
  const secret = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secret);
  const rotated: LocalInbox = {
    ...inbox,
    relayUrl: next.url,
    queueId: created.queueId,
    senderToken: created.senderToken,
    recipientToken: created.recipientToken,
    signingKey: created.signingKey,
    signingPublicKey: created.signingPublicKey,
    recipientPublicKey: bufferToBase64(publicKey),
    recipientPrivateKey: bufferToBase64(secret),
    inviteToken: created.inviteToken,
    pow,
    createdAt: now,
    expiresAt: created.expiresAt,
  };
  return rotated;
}

/**
 * Tells one contact where our inbox moved by sending the new invite over its
 * existing queue. The peer sees a normal contact offer, so nothing outside the
 * sealed message reveals the move.
 */
export async function sendInboxMigration(
  transport: AnonTransport,
  contact: Contact,
  inbox: LocalInbox,
): Promise<boolean> {
  if (!isAnonInvite(contact.peerInvite)) return false;
  const ownInvite = inviteFromInbox(inbox);
  if (!isAnonInvite(ownInvite)) return false;
  const result = await sendAnonMessage(transport, contact.peerInvite, encodeContactOffer(ownInvite));
  return Boolean(result);
}

export interface InboxMigration {
  inbox: LocalInbox;
  /** Contacts that received the new invite and will reach the new relay. */
  notified: number;
  /** Contacts still pointed at the old queue; retry before it expires. */
  failed: number;
}

/**
 * Rotates an inbox to the next relay and announces the new invite to every
 * contact, so the move does not depend on the peer noticing a new queue. If the
 * rotation itself is not due (or no other relay is configured) this is a no-op;
 * a partial notification is reported instead of hidden, because an unnotified
 * contact keeps writing to the old queue until it expires.
 */
export async function migrateInbox(
  transportFor: (relayUrl: string) => InboxTransport | Promise<InboxTransport>,
  inbox: LocalInbox,
  contacts: Contact[],
  now: number = Date.now(),
): Promise<InboxMigration | null> {
  const rotated = await rotateInbox(transportFor, inbox, now);
  if (!rotated) return null;
  const transports = new Map<string, InboxTransport>();
  let notified = 0;
  for (const contact of contacts) {
    const peerRelay = contact.peerInvite?.relayUrl;
    if (!peerRelay) continue;
    let transport = transports.get(peerRelay);
    if (!transport) {
      transport = await transportFor(peerRelay);
      transports.set(peerRelay, transport);
    }
    if (await sendInboxMigration(transport, contact, rotated)) notified += 1;
  }
  return { inbox: rotated, notified, failed: contacts.length - notified };
}

export function encodeContactOffer(invite: AnonInvite): string {
  return JSON.stringify({ type: CONTACT_OFFER_TYPE, v: 1, invite });
}

export function decodeContactOffer(body: string): AnonInvite | null {
  try {
    const parsed = JSON.parse(body) as { type?: unknown; v?: unknown; invite?: unknown };
    if (parsed.type !== CONTACT_OFFER_TYPE || parsed.v !== 1) return null;
    return isAnonInvite(parsed.invite) ? parsed.invite : null;
  } catch {
    return null;
  }
}

export async function sendContactOffer(
  transport: AnonTransport,
  peerInvite: AnonInvite,
  inbox: LocalInbox,
): Promise<boolean> {
  const ownInvite = inviteFromInbox(inbox);
  if (!isAnonInvite(peerInvite) || !isAnonInvite(ownInvite)) return false;
  const result = await sendAnonMessage(transport, peerInvite, encodeContactOffer(ownInvite));
  return Boolean(result);
}

export async function acceptInvitation(
  transport: InboxTransport,
  invite: AnonInvite,
  displayName?: string,
): Promise<{ contact: Contact; offerSent: boolean } | null> {
  const contact = await prepareInvitationAcceptance(transport, invite, displayName);
  if (!contact) return null;
  const offerSent = await sendContactOffer(transport, invite, contact.inbox);
  return { contact, offerSent };
}

export async function prepareInvitationAcceptance(
  transport: InboxTransport,
  invite: AnonInvite,
  displayName?: string,
): Promise<Contact | null> {
  if (!isAnonInvite(invite)) return null;
  // Locally blocked senders cannot re-open contact through their old queue.
  if (isBlocked(queueSigningPublicKey(invite.signingKey))) return null;
  const own = await createInvitation(
    transport,
    invite.relayUrl,
    undefined,
    invite.pow?.difficulty,
    displayName,
  );
  if (!own) return null;
  return { inbox: own.inbox, peerInvite: invite, createdAt: Date.now() };
}

export function contactFromOffer(inbox: LocalInbox, offer: AnonInvite): Contact | null {
  if (!isAnonInvite(offer) || offer.queueId === inbox.queueId) return null;
  return { inbox, peerInvite: offer, createdAt: Date.now() };
}

export async function receiveInboxMessages(
  transport: AnonTransport,
  inbox: LocalInbox,
  limit = 32,
): Promise<InboxMessage[]> {
  const packets = await receiveInboxPackets(transport, inbox, limit);
  if (packets.length > 0) {
    await ackInboxPackets(
      transport,
      inbox,
      packets.map(({ packetId }) => packetId),
    );
  }
  return packets.map(({ body, offer }) => ({ body, offer }));
}

export async function receiveInboxPackets(
  transport: AnonTransport,
  inbox: LocalInbox,
  limit = 32,
): Promise<InboxPacket[]> {
  const received = await receiveAnonPackets(
    transport,
    inbox.queueId,
    inbox.recipientToken,
    inbox.recipientPrivateKey,
    limit,
    inbox.signingKey,
  );
  return received.map(({ packetId, body }) => ({
    packetId,
    body,
    offer: decodeContactOffer(body),
  }));
}

export async function ackInboxPackets(
  transport: AnonTransport,
  inbox: LocalInbox,
  packetIds: string[],
): Promise<boolean> {
  if (packetIds.length === 0) return true;
  const result = await transport.ack(
    inbox.queueId,
    inbox.recipientToken,
    packetIds,
    inbox.signingKey,
  );
  return result !== false;
}

export async function receiveContactOffers(
  transport: AnonTransport,
  inbox: LocalInbox,
  limit = 32,
): Promise<AnonInvite[]> {
  const messages = await receiveInboxMessages(transport, inbox, limit);
  return messages.flatMap((message) => {
    if (!message.offer) return [];
    // Drop offers from locally blocked senders before they reach the UI.
    if (isBlocked(queueSigningPublicKey(message.offer.signingKey))) return [];
    return [message.offer];
  });
}

export function sendContactMessage(
  transport: AnonTransport,
  contact: Contact,
  plaintext: string,
) {
  if (!isAnonInvite(contact.peerInvite)) return Promise.resolve(null);
  return sendAnonMessage(transport, contact.peerInvite, plaintext);
}

export function receiveContactMessages(
  transport: AnonTransport,
  contact: Contact,
  limit = 32,
): Promise<InboxMessage[]> {
  return receiveInboxMessages(transport, contact.inbox, limit);
}
