import type { PowSolution } from './spam';

export type QueueId = string;
export type QueueToken = string;
export type PacketProfile = 'small' | 'standard' | 'large';

export interface QueueTokens {
  /** Token presented by the sender when enqueuing. */
  senderToken: QueueToken;
  /** Token presented by the recipient when polling/acking. */
  recipientToken: QueueToken;
}

export interface CreatedQueue extends QueueTokens {
  queueId: QueueId;
  expiresAt: number;
  /** Ed25519 private key shared with the queue's sender through the invite. */
  signingKey: string;
  /** Ed25519 public key stored by the relay for command verification. */
  signingPublicKey: string;
  /**
   * One-time invite token: the first sender must present it on the first
   * enqueue; the relay burns it so a leaked invite cannot be reused.
   */
  inviteToken: string;
}

export interface AnonQueueDescriptor {
  queueId: QueueId;
  tokens: QueueTokens;
  relayUrl: string;
  createdAt: number;
  expiresAt: number;
}

export type RelayCommand =
  | { type: 'create_queue'; queueId: QueueId; recipientTokenHash: string; ttlMs: number; signature: string }
  | { type: 'enqueue'; queueId: QueueId; senderToken: QueueToken; packet: string; signature: string }
  | { type: 'poll'; queueId: QueueId; recipientToken: QueueToken; limit: number; signature: string }
  | { type: 'ack'; queueId: QueueId; recipientToken: QueueToken; packetIds: string[]; signature: string }
  | { type: 'delete_queue'; queueId: QueueId; recipientToken: QueueToken; signature: string };

export interface AnonPacket {
  version: number;
  queueId: QueueId;
  packetId: string;
  createdAt: number;
  ttlMs: number;
  /** Base64 of fixed-size padded bytes. */
  payload: string;
}

export interface EnqueueResult {
  packetId: string;
  expiresAt: number;
}

export interface PollResult {
  packets: AnonPacket[];
  nextCursor: string | null;
}

export interface AnonTransport {
  enqueue(
    queueId: string,
    senderToken: string,
    packet: string,
    signingKey?: string,
    pow?: PowSolution,
    inviteToken?: string,
  ): Promise<EnqueueResult | null> | EnqueueResult | null;
  poll(
    queueId: string,
    recipientToken: string,
    limit?: number,
    signingKey?: string,
  ): Promise<PollResult> | PollResult;
  ack(
    queueId: string,
    recipientToken: string,
    packetIds: string[],
    signingKey?: string,
  ): Promise<boolean> | boolean | void;
}

export const ANON_PROTOCOL_VERSION = 1 as const;
export const ANON_PACKET_PROFILES = {
  small: 4096,
  standard: 16384,
  large: 65536,
} as const;
