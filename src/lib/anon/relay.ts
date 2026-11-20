import { sha256 } from '@noble/hashes/sha2.js';
import { generateQueueId, generateQueueToken } from './ids';
import { generateQueueSigningKeyPair, signQueueCommand, verifyQueueCommand } from './signing';
import type { QueueCommandAction, QueueCommandAuth } from './signing';
import { createInviteToken, isInviteToken, isPowChallenge, isPowSolution, verifyPow } from './spam';
import type { PowChallenge, PowSolution } from './spam';
import type { AnonPacket, EnqueueResult, PollResult, QueueTokens } from './types';

const COMMAND_MAX_AGE_MS = 5 * 60 * 1000;
const COMMAND_FUTURE_SKEW_MS = 60 * 1000;

/** SHA-256 hex of an invite token; mirrors the relay server's storage. */
function hashInviteToken(token: string): string {
  return Array.from(sha256(new TextEncoder().encode(token)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface InMemoryQueue {
  queueId: string;
  tokens: QueueTokens;
  signingPublicKey: string;
  pow?: PowChallenge;
  powUsed: boolean;
  /** Hash of the one-time invite token; null once the invite has been used. */
  inviteTokenHash: string | null;
  createdAt: number;
  expiresAt: number;
  packets: Map<string, { packet: AnonPacket; acked: boolean }>;
}

export class InMemoryAnonRelay {
  private readonly queues = new Map<string, InMemoryQueue>();
  private readonly commandNonces = new Map<string, number>();

  createQueue(
    ttlMs = 14 * 24 * 60 * 60 * 1000,
    pow?: PowChallenge,
  ): {
    queueId: string;
    tokens: QueueTokens;
    senderToken: string;
    recipientToken: string;
    signingKey: string;
    signingPublicKey: string;
    /** One-time invite token: the first sender must present it; relay burns it. */
    inviteToken: string;
    expiresAt: number;
  } {
    if (pow !== undefined && !isPowChallenge(pow)) {
      throw new Error('Invalid proof-of-work challenge');
    }
    const queueId = generateQueueId();
    const tokens = { senderToken: generateQueueToken(), recipientToken: generateQueueToken() };
    const signing = generateQueueSigningKeyPair();
    const inviteToken = createInviteToken();
    const now = Date.now();
    const expiresAt = now + ttlMs;
    this.queues.set(queueId, {
      queueId,
      tokens,
      signingPublicKey: signing.publicKey,
      pow,
      powUsed: false,
      inviteTokenHash: hashInviteToken(inviteToken),
      createdAt: now,
      expiresAt,
      packets: new Map(),
    });
    return {
      queueId,
      tokens,
      senderToken: tokens.senderToken,
      recipientToken: tokens.recipientToken,
      signingKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
      inviteToken,
      expiresAt,
    };
  }

  enqueue(
    queueId: string,
    senderToken: string,
    payload: string,
    signingKey?: string,
    pow?: PowSolution,
    inviteToken?: string,
    ttlMs = 24 * 60 * 60 * 1000,
  ): EnqueueResult {
    const queue = this.getQueue(queueId);
    if (queue.tokens.senderToken !== senderToken) throw new Error('Invalid sender token');
    if (Date.now() > queue.expiresAt) throw new Error('Queue expired');
    // One-time invite: the first enqueue must present the invite token and the
    // relay burns it afterwards, so a leaked invite cannot be reused.
    if (queue.inviteTokenHash !== null) {
      if (!isInviteToken(inviteToken)) throw new Error('Invite token required');
      if (hashInviteToken(inviteToken) !== queue.inviteTokenHash) {
        throw new Error('Invalid invite token');
      }
      queue.inviteTokenHash = null;
    }
    const auth = signingKey
      ? signQueueCommand(signingKey, {
          action: 'enqueue',
          queueId,
          token: senderToken,
          packet: payload,
          pow,
        })
      : undefined;
    this.verifyAuth(queue, 'enqueue', { queueId, token: senderToken, packet: payload, pow }, auth);
    this.verifyPow(queue, pow);
    const packetId = `p_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = Date.now();
    queue.packets.set(packetId, {
      packet: {
        version: 1,
        queueId,
        packetId,
        createdAt: now,
        ttlMs,
        payload,
      },
      acked: false,
    });
    return { packetId, expiresAt: now + ttlMs };
  }

  poll(
    queueId: string,
    recipientToken: string,
    limit = 32,
    signingKey?: string,
  ): PollResult {
    const queue = this.getQueue(queueId);
    if (Date.now() > queue.expiresAt) throw new Error('Queue expired');
    if (queue.tokens.recipientToken !== recipientToken) throw new Error('Invalid recipient token');
    const auth = signingKey
      ? signQueueCommand(signingKey, {
          action: 'poll',
          queueId,
          token: recipientToken,
          limit,
        })
      : undefined;
    this.verifyAuth(queue, 'poll', { queueId, token: recipientToken, limit }, auth);
    const now = Date.now();
    const packets: AnonPacket[] = [];
    for (const { packet, acked } of queue.packets.values()) {
      if (acked) continue;
      if (now - packet.createdAt > packet.ttlMs) continue;
      packets.push(packet);
      if (packets.length >= limit) break;
    }
    return { packets, nextCursor: null };
  }

  ack(
    queueId: string,
    recipientToken: string,
    packetIds: string[],
    signingKey?: string,
  ): boolean {
    const queue = this.getQueue(queueId);
    if (Date.now() > queue.expiresAt) throw new Error('Queue expired');
    if (queue.tokens.recipientToken !== recipientToken) throw new Error('Invalid recipient token');
    const auth = signingKey
      ? signQueueCommand(signingKey, {
          action: 'ack',
          queueId,
          token: recipientToken,
          packetIds,
        })
      : undefined;
    this.verifyAuth(queue, 'ack', { queueId, token: recipientToken, packetIds }, auth);
    for (const id of packetIds) {
      const entry = queue.packets.get(id);
      if (entry) entry.acked = true;
    }
    // Delete acked packets immediately.
    for (const id of packetIds) queue.packets.delete(id);
    return true;
  }

  deleteQueue(
    queueId: string,
    recipientToken: string,
    signingKey?: string,
  ): void {
    const queue = this.getQueue(queueId);
    if (Date.now() > queue.expiresAt) throw new Error('Queue expired');
    if (queue.tokens.recipientToken !== recipientToken) throw new Error('Invalid recipient token');
    const auth = signingKey
      ? signQueueCommand(signingKey, {
          action: 'delete_queue',
          queueId,
          token: recipientToken,
        })
      : undefined;
    this.verifyAuth(queue, 'delete_queue', { queueId, token: recipientToken }, auth);
    this.queues.delete(queueId);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.commandNonces) {
      if (now > expiresAt) this.commandNonces.delete(nonce);
    }
    for (const [id, queue] of this.queues) {
      if (now > queue.expiresAt) {
        this.queues.delete(id);
        continue;
      }
      for (const [pid, entry] of queue.packets) {
        if (now - entry.packet.createdAt > entry.packet.ttlMs) queue.packets.delete(pid);
      }
    }
  }

  private verifyAuth(
    queue: InMemoryQueue,
    action: QueueCommandAction,
    fields: {
      queueId: string;
      token: string;
      packet?: string;
      pow?: PowSolution;
      limit?: number;
      packetIds?: string[];
    },
    auth?: QueueCommandAuth,
  ): void {
    if (!queue.signingPublicKey) return;
    if (
      !auth ||
      typeof auth.signature !== 'string' ||
      typeof auth.signedAt !== 'number' ||
      typeof auth.commandNonce !== 'string'
    ) {
      throw new Error('Missing command signature');
    }
    const now = Date.now();
    if (
      auth.signedAt < now - COMMAND_MAX_AGE_MS ||
      auth.signedAt > now + COMMAND_FUTURE_SKEW_MS
    ) {
      throw new Error('Stale command');
    }
    if (this.commandNonces.has(auth.commandNonce)) throw new Error('Replayed command');
    const valid = verifyQueueCommand(
      queue.signingPublicKey,
      {
        action,
        ...fields,
        signedAt: auth.signedAt,
        commandNonce: auth.commandNonce,
      },
      auth.signature,
    );
    if (!valid) throw new Error('Invalid command signature');
    this.commandNonces.set(auth.commandNonce, now + COMMAND_MAX_AGE_MS);
  }

  private verifyPow(queue: InMemoryQueue, pow?: PowSolution): void {
    if (!queue.pow || queue.powUsed) return;
    if (!isPowSolution(pow) || !verifyPow(queue.pow, pow)) {
      throw new Error('Invalid proof of work');
    }
    queue.powUsed = true;
  }

  private getQueue(queueId: string): InMemoryQueue {
    const queue = this.queues.get(queueId);
    if (!queue) throw new Error('Queue not found');
    return queue;
  }
}
