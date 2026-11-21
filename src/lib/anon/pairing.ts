import { x25519 } from '@noble/curves/ed25519.js';
import { bufferToBase64 } from '../crypto/aes';
import { isQueueId, isQueueToken } from './ids';
import {
  isAllowedRelayUrl,
  isAnonInvite,
  receiveAnonPackets,
  receiveAnonPacketsDetailed,
  sendAnonMessage,
  type AnonInvite,
} from './session';
import type { PacketProfile } from './types';
import {
  isQueuePrivateKey,
  isQueuePublicKey,
  queueSigningPublicKey,
  signIdentityBinding,
  verifyIdentityBinding,
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
  /**
   * Public signing key of this inbox's first queue. Rotation replaces the queue
   * key, so contacts and local block lists track this instead.
   */
  identityKey?: string;
  /**
   * Private half of `identityKey`, kept locally so every rotated invite can
   * prove it continues the same identity. Legacy inboxes may lack it.
   */
  identitySigningKey?: string;
  createdAt: number;
  expiresAt: number;
  relays?: RelayEndpoint[];
  /**
   * Optional second queue on another relay, used when the primary host is
   * unreachable. It shares the recipient key and identity with the primary
   * inbox but has its own queue credentials and invite token.
   */
  standby?: Omit<LocalInbox, 'standby'>;
}

export interface Invitation {
  inbox: LocalInbox;
  invite: AnonInvite;
}

export interface Contact {
  inbox: LocalInbox;
  peerInvite: AnonInvite;
  /** Stable label for the peer across queue rotation; defaults to its current key. */
  identityKey?: string;
  createdAt: number;
}

/**
 * Identity a peer keeps when it rotates its inbox: the first queue public key
 * it advertised. A claim is honoured only when it is the current queue key
 * itself or when the identity key signed the current queue key; otherwise the
 * offer falls back to the queue key, so a stranger cannot borrow an identity
 * without holding its private half. Offers that predate `identityKey` fall back
 * to the current key, which is the behaviour they had before.
 */
export function contactIdentity(invite: AnonInvite): string {
  let queueKey: string;
  try {
    queueKey = queueSigningPublicKey(invite.signingKey);
  } catch {
    return invite.identityKey ?? '';
  }
  if (!invite.identityKey) return queueKey;
  if (invite.identityKey === queueKey) return invite.identityKey;
  if (
    invite.identitySignature &&
    verifyIdentityBinding(invite.identityKey, queueKey, invite.identitySignature)
  ) {
    return invite.identityKey;
  }
  return queueKey;
}

/** Blocks are keyed on that identity, not on the rotating queue key. */
export function isBlockedContact(invite: AnonInvite): boolean {
  if (isBlocked(contactIdentity(invite))) return true;
  return isBlocked(queueSigningPublicKey(invite.signingKey));
}

export interface InboxMessage {
  body: string;
  offer: AnonInvite | null;
}

export interface InboxPacket extends InboxMessage {
  packetId: string;
}

export const CONTACT_OFFER_TYPE = 'nova-anon-contact-offer';

function inboxIdentityKey(inbox: LocalInbox): string | undefined {
  if (inbox.identityKey) return inbox.identityKey;
  if (!isQueuePrivateKey(inbox.signingKey)) return undefined;
  return queueSigningPublicKey(inbox.signingKey);
}

export function inviteFromInbox(inbox: LocalInbox): AnonInvite {
  // A pending inbox can exist before its keys are issued, hence the guards.
  const identityKey = inboxIdentityKey(inbox);
  const identitySignature =
    identityKey && inbox.identitySigningKey && isQueuePrivateKey(inbox.identitySigningKey)
      ? signIdentityBinding(inbox.identitySigningKey, identityKey, inbox.signingPublicKey)
      : undefined;
  const standby = inbox.standby ? inviteFromInbox(inbox.standby) : undefined;
  return {
    v: 1,
    relayUrl: inbox.relayUrl,
    queueId: inbox.queueId,
    senderToken: inbox.senderToken,
    signingKey: inbox.signingKey,
    recipientPublicKey: inbox.recipientPublicKey,
    inviteToken: inbox.inviteToken,
    ...(identityKey ? { identityKey } : {}),
    ...(identitySignature ? { identitySignature } : {}),
    ...(inbox.displayName ? { displayName: inbox.displayName } : {}),
    expiresAt: inbox.expiresAt,
    ...(inbox.pow ? { pow: inbox.pow } : {}),
    ...(standby ? { standby } : {}),
  };
}

/** Queue address that a sender should try when the primary relay is down. */
export function standbyInvite(invite: AnonInvite): AnonInvite | null {
  return invite.standby ? { ...invite.standby, v: 1 } : null;
}

/** True when an inbox can fall back to a second, different relay. */
export function hasStandby(inbox: LocalInbox): inbox is LocalInbox & { standby: LocalInbox } {
  return Boolean(inbox.standby && inbox.standby.relayUrl !== inbox.relayUrl);
}

/** Builds the queue used to receive on the standby relay, if configured. */
export function standbyInbox(inbox: LocalInbox): LocalInbox | null {
  return hasStandby(inbox) ? inbox.standby : null;
}

export interface StandbyTarget {
  transport: InboxTransport;
  relayUrl: string;
}

function isValidCreatedQueue(created: CreatedQueue | null): created is CreatedQueue {
  return Boolean(
    created &&
      isQueueId(created.queueId) &&
      isQueueToken(created.senderToken) &&
      isQueueToken(created.recipientToken) &&
      isQueuePrivateKey(created.signingKey) &&
      isQueuePublicKey(created.signingPublicKey) &&
      Number.isFinite(created.expiresAt) &&
      created.expiresAt > Date.now(),
  );
}

async function createStandbyInbox(
  target: StandbyTarget,
  ttlMs: number | undefined,
  powDifficulty: number | undefined,
  primary: LocalInbox,
): Promise<LocalInbox | null> {
  if (target.relayUrl === primary.relayUrl || !isAllowedRelayUrl(target.relayUrl)) {
    return null;
  }
  const pow = powDifficulty !== undefined ? createPowChallenge(powDifficulty) : undefined;
  let created: CreatedQueue | null;
  try {
    created = await target.transport.createQueue(ttlMs, pow);
  } catch {
    // A standby queue is best effort: the primary queue must still work when
    // the second relay is temporarily down while the user creates an invite.
    return null;
  }
  if (!isValidCreatedQueue(created)) return null;
  return {
    relayUrl: target.relayUrl,
    queueId: created.queueId,
    senderToken: created.senderToken,
    recipientToken: created.recipientToken,
    signingKey: created.signingKey,
    signingPublicKey: created.signingPublicKey,
    recipientPublicKey: primary.recipientPublicKey,
    recipientPrivateKey: primary.recipientPrivateKey,
    inviteToken: created.inviteToken,
    // The standby queue continues the same contact identity. The primary
    // signing key binds its new queue key, so peers do not see a new contact.
    identityKey: primary.identityKey ?? primary.signingPublicKey,
    identitySigningKey: primary.identitySigningKey ?? primary.signingKey,
    ...(primary.displayName ? { displayName: primary.displayName } : {}),
    ...(pow ? { pow } : {}),
    createdAt: Date.now(),
    expiresAt: created.expiresAt,
    ...(primary.relays ? { relays: primary.relays } : {}),
  };
}

export async function createInvitation(
  transport: InboxTransport,
  relayUrl: string,
  ttlMs?: number,
  powDifficulty?: number,
  displayName?: string,
  standby?: StandbyTarget,
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
  if (!isValidCreatedQueue(created)) return null;

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
    identityKey: created.signingPublicKey,
    identitySigningKey: created.signingKey,
    ...(displayName?.trim() ? { displayName: displayName.trim().slice(0, 64) } : {}),
    ...(pow ? { pow } : {}),
    createdAt: Date.now(),
    expiresAt: created.expiresAt,
  };
  if (standby) {
    const backup = await createStandbyInbox(standby, ttlMs, powDifficulty, inbox);
    if (backup) inbox.standby = backup;
  }
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
  options: { force?: boolean } = {},
): Promise<LocalInbox | null> {
  const relays = inbox.relays;
  if (!relays || relays.length < 2) return null;
  if (!options.force && !shouldRotateQueue(inbox.createdAt, now, DEFAULT_QUEUE_ROTATION_MS)) {
    return null;
  }
  const current: RelayEndpoint =
    relays.find((relay) => relay.url === inbox.relayUrl) ?? { id: inbox.relayUrl, url: inbox.relayUrl };
  const next = nextRelay(current, relays);
  if (!next || next.url === inbox.relayUrl) return null;
  const transport = await transportFor(next.url);
  // One challenge, used both for the relay and for the invite. Creating two
  // made the advertised challenge differ from the stored one, so every first
  // contact to a rotated inbox failed with "Invalid proof of work".
  const pow = createPowChallenge(inbox.pow?.difficulty ?? POW_MIN_DIFFICULTY);
  // Keep the remaining lifetime when it is meaningful, otherwise let the relay
  // apply its own default: a failed-over queue is often already past it.
  const remaining = inbox.expiresAt - now;
  const created = await transport.createQueue(remaining > 60_000 ? remaining : undefined, pow);
  if (!isValidCreatedQueue(created)) return null;
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
    identityKey: inboxIdentityKey(inbox),
    pow,
    createdAt: now,
    expiresAt: created.expiresAt,
  };
  delete rotated.standby;
  // Keep a backup on another relay. The old relay is the natural choice for a
  // normal rotation; on failover it may be the dead host, in which case queue
  // creation fails and the rotated inbox simply has no standby.
  for (const standbyRelay of relays) {
    if (standbyRelay.url === next.url) continue;
    try {
      const standbyTransport = await transportFor(standbyRelay.url);
      const backup = await createStandbyInbox(
        { transport: standbyTransport, relayUrl: standbyRelay.url },
        remaining > 60_000 ? remaining : undefined,
        inbox.pow?.difficulty ?? POW_MIN_DIFFICULTY,
        rotated,
      );
      if (backup) {
        rotated.standby = backup;
        break;
      }
    } catch {
      // A dead candidate must not abort a rotation that already succeeded.
    }
  }
  return rotated;
}

/**
 * Tells one contact where our inbox moved by sending the new invite over its
 * existing queue. The peer sees a normal contact offer, so nothing outside the
 * sealed message reveals the move.
 */
export async function sendInboxMigration(
  transport: AnonTransport | null,
  contact: Contact,
  inbox: LocalInbox,
  standbyTransport?: AnonTransport | null,
): Promise<boolean> {
  if (!isAnonInvite(contact.peerInvite)) return false;
  const ownInvite = inviteFromInbox(inbox);
  if (!isAnonInvite(ownInvite)) return false;
  const result = await sendToPeer(
    transport,
    contact.peerInvite,
    encodeContactOffer(ownInvite),
    standbyTransport,
  );
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
  options: { force?: boolean } = {},
): Promise<InboxMigration | null> {
  const rotated = await rotateInbox(transportFor, inbox, now, options);
  if (!rotated) return null;
  const transports = new Map<string, InboxTransport | null>();
  const transportForPeer = async (relayUrl: string): Promise<InboxTransport | null> => {
    if (transports.has(relayUrl)) return transports.get(relayUrl) ?? null;
    let transport: InboxTransport | null = null;
    try {
      transport = await transportFor(relayUrl);
    } catch {
      // The peer's primary relay may be the one that just died; its standby
      // still gives us a way to deliver the new invite.
    }
    transports.set(relayUrl, transport);
    return transport;
  };
  let notified = 0;
  for (const contact of contacts) {
    const peerRelay = contact.peerInvite?.relayUrl;
    if (!peerRelay) continue;
    const transport = await transportForPeer(peerRelay);
    const backupRelay = contact.peerInvite.standby?.relayUrl;
    const standbyTransport = backupRelay ? await transportForPeer(backupRelay) : null;
    if (!transport && !standbyTransport) continue;
    if (await sendInboxMigration(transport, contact, rotated, standbyTransport)) notified += 1;
  }
  return { inbox: rotated, notified, failed: contacts.length - notified };
}

/**
 * Moves a live queue off a relay that stopped answering, without waiting for
 * the rotation window, and announces the new invite to every contact.
 *
 * The old queue stays where it was and simply expires: nothing is deleted on a
 * relay that cannot be reached anyway, and a contact that missed the notice
 * still has a working queue until then.
 */
export function failoverInbox(
  transportFor: (relayUrl: string) => InboxTransport | Promise<InboxTransport>,
  inbox: LocalInbox,
  contacts: Contact[],
  now: number = Date.now(),
): Promise<InboxMigration | null> {
  return migrateInbox(transportFor, inbox, contacts, now, { force: true });
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

/**
 * Sends a packet to the peer's primary queue and, if that fails, to its
 * standby queue. Throws only when both attempts fail, so callers can show the
 * real network error instead of a generic "not sent".
 */
async function sendToPeer(
  primaryTransport: AnonTransport | null,
  invite: AnonInvite,
  body: string,
  standbyTransport?: AnonTransport | null,
  profile: PacketProfile = 'standard',
): ReturnType<typeof sendAnonMessage> {
  let primaryError: unknown;
  try {
    if (primaryTransport) {
      const result = await sendAnonMessage(primaryTransport, invite, body, profile);
      if (result) return result;
    }
  } catch (error) {
    primaryError = error;
  }
  const backup = standbyInvite(invite);
  if (standbyTransport && backup) {
    const fallbackResult = await sendAnonMessage(standbyTransport, backup, body, profile);
    if (fallbackResult) return fallbackResult;
  }
  if (primaryError) throw primaryError;
  return null;
}

export async function sendContactOffer(
  transport: AnonTransport | null,
  peerInvite: AnonInvite,
  inbox: LocalInbox,
  standbyTransport?: AnonTransport | null,
): Promise<boolean> {
  const ownInvite = inviteFromInbox(inbox);
  if (!isAnonInvite(peerInvite) || !isAnonInvite(ownInvite)) return false;
  const result = await sendToPeer(
    transport,
    peerInvite,
    encodeContactOffer(ownInvite),
    standbyTransport,
  );
  return Boolean(result);
}

export async function acceptInvitation(
  transport: InboxTransport,
  invite: AnonInvite,
  displayName?: string,
  standby?: StandbyTarget,
  standbyPeerTransport?: AnonTransport | null,
): Promise<{ contact: Contact; offerSent: boolean } | null> {
  const contact = await prepareInvitationAcceptance(transport, invite, displayName, standby);
  if (!contact) return null;
  const offerSent = await sendContactOffer(
    transport,
    invite,
    contact.inbox,
    standbyPeerTransport,
  );
  return { contact, offerSent };
}

export async function prepareInvitationAcceptance(
  transport: InboxTransport,
  invite: AnonInvite,
  displayName?: string,
  standby?: StandbyTarget,
): Promise<Contact | null> {
  if (!isAnonInvite(invite)) return null;
  // Locally blocked senders cannot re-open contact through their old queue.
  if (isBlockedContact(invite)) return null;
  const own = await createInvitation(
    transport,
    invite.relayUrl,
    undefined,
    invite.pow?.difficulty,
    displayName,
    standby,
  );
  if (!own) return null;
  return {
    inbox: own.inbox,
    peerInvite: invite,
    identityKey: contactIdentity(invite),
    createdAt: Date.now(),
  };
}

export function contactFromOffer(inbox: LocalInbox, offer: AnonInvite): Contact | null {
  if (!isAnonInvite(offer) || offer.queueId === inbox.queueId) return null;
  return { inbox, peerInvite: offer, identityKey: contactIdentity(offer), createdAt: Date.now() };
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
  // Trash that is not a Nova packet can never be decoded, so acknowledging and
  // deleting it frees the queue slot instead of letting it sit until the TTL
  // (F1.2). Well-formed packets we cannot open are left alone by the session.
  await ackUndecodableInboxPackets(transport, inbox, limit);
  return packets.map(({ body, offer }) => ({ body, offer }));
}

/** ACK the packets in this inbox that are not Nova packets at all. */
async function ackUndecodableInboxPackets(
  transport: AnonTransport,
  inbox: LocalInbox,
  limit = 32,
): Promise<void> {
  try {
    await receiveAnonPacketsDetailed(
      transport,
      inbox.queueId,
      inbox.recipientToken,
      inbox.recipientPrivateKey,
      limit,
      inbox.signingKey,
      { ackUndecodable: true },
    );
  } catch {
    // Best effort: the next poll retries, and a failure here must not turn a
    // successful receive into an error.
  }
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
    if (isBlockedContact(message.offer)) return [];
    return [message.offer];
  });
}

export interface ContactSendOptions {
  standbyTransport?: AnonTransport | null;
  profile?: PacketProfile;
}

export function sendContactMessage(
  transport: AnonTransport,
  contact: Contact,
  plaintext: string,
  options: ContactSendOptions = {},
) {
  if (!isAnonInvite(contact.peerInvite)) return Promise.resolve(null);
  return sendToPeer(
    transport,
    contact.peerInvite,
    plaintext,
    options.standbyTransport,
    options.profile,
  );
}

export function receiveContactMessages(
  transport: AnonTransport,
  contact: Contact,
  limit = 32,
): Promise<InboxMessage[]> {
  return receiveInboxMessages(transport, contact.inbox, limit);
}
