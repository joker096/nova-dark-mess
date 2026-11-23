import { generateQueueSigningKeyPair, signQueueCommand } from './signing';
import { base64ToUint8 } from './packet';
import type { PowChallenge, PowSolution } from './spam';
import type { CreatedQueue, EnqueueResult, PollResult } from './types';

export interface AnonHttpRelayConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

const PAD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const CONTROL_BODY_BYTES = 4096;
const ACK_BODY_BYTES = 8192;
const ENQUEUE_BODY_BYTES: Record<number, number> = {
  4096: 8192,
  16384: 24576,
  65536: 92160,
};

/**
 * Pad a control command to a constant JSON size. `pad` is random base64url and
 * is ignored by the relay; it is added after signing, so signatures only cover
 * the semantic fields. Enqueue bodies are padded per packet profile, so their
 * size no longer reveals which optional fields were present.
 */
function padJsonBody(body: Record<string, unknown>, targetBytes: number): Record<string, unknown> {
  const base = JSON.stringify({ ...body, pad: '' });
  const remaining = targetBytes - new TextEncoder().encode(base).length;
  if (remaining <= 0) return body;
  const random = new Uint8Array(remaining);
  crypto.getRandomValues(random);
  let pad = '';
  for (let index = 0; index < remaining; index++) pad += PAD_ALPHABET[random[index] & 63];
  return { ...body, pad };
}

function packetProfileBytes(packet: string): number | null {
  try {
    const size = base64ToUint8(packet).length;
    return size in ENQUEUE_BODY_BYTES ? size : null;
  } catch {
    return null;
  }
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

const RATE_LIMIT_COOLDOWN_MS = 60_000;
let rateLimitedUntil = 0;

/** Milliseconds left before the relay accepts requests again after a 429. */
export function relayRateLimitRemainingMs(now: number = Date.now()): number {
  return Math.max(0, rateLimitedUntil - now);
}

/** Test seam: clear the cooldown between cases. */
export function resetRelayRateLimitForTests(): void {
  rateLimitedUntil = 0;
}

async function postJson<T>(config: AnonHttpRelayConfig, path: string, body: unknown): Promise<T | null> {
  const fetchFn = config.fetchImpl || fetch;
  try {
    const res = await fetchFn(`${normalizeBase(config.baseUrl)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function createAnonQueue(
  config: AnonHttpRelayConfig,
  ttlMs?: number,
  pow?: PowChallenge,
): Promise<CreatedQueue | null> {
  const signing = generateQueueSigningKeyPair();
  const body: Record<string, unknown> = {
    ...(ttlMs ? { ttlMs } : {}),
    ...(pow ? { pow } : {}),
    signingPublicKey: signing.publicKey,
  };
  const result = await postJson<{
    ok: boolean;
    queueId: string;
    senderToken: string;
    recipientToken: string;
    inviteToken: string;
    expiresAt: number;
  }>(config, '/api/anon/queues', padJsonBody(body, CONTROL_BODY_BYTES));
  if (!result?.queueId || !result.senderToken || !result.recipientToken || !result.inviteToken) return null;
  return {
    queueId: result.queueId,
    senderToken: result.senderToken,
    recipientToken: result.recipientToken,
    expiresAt: result.expiresAt,
    signingKey: signing.privateKey,
    signingPublicKey: signing.publicKey,
    inviteToken: result.inviteToken,
  };
}

export async function enqueueAnonPacket(
  config: AnonHttpRelayConfig,
  queueId: string,
  senderToken: string,
  packet: string,
  signingKey?: string,
  pow?: PowSolution,
  inviteToken?: string,
): Promise<EnqueueResult | null> {
  const body: Record<string, unknown> = { queueId, senderToken, packet };
  if (pow) body.pow = pow;
  if (inviteToken) body.inviteToken = inviteToken;
  if (signingKey) {
    Object.assign(body, signQueueCommand(signingKey, {
      action: 'enqueue',
      queueId,
      token: senderToken,
      packet,
      pow,
    }));
  }
  const result = await postJson<{ ok: boolean; packetId: string; expiresAt: number }>(
    config,
    '/api/anon/enqueue',
    padJsonBody(body, ENQUEUE_BODY_BYTES[packetProfileBytes(packet) ?? 0] ?? 24576),
  );
  if (!result?.packetId) return null;
  return { packetId: result.packetId, expiresAt: result.expiresAt };
}

export async function pollAnonQueue(
  config: AnonHttpRelayConfig,
  queueId: string,
  recipientToken: string,
  limit = 32,
  signingKey?: string,
): Promise<PollResult> {
  const body: Record<string, unknown> = { queueId, recipientToken, limit };
  if (signingKey) {
    Object.assign(body, signQueueCommand(signingKey, {
      action: 'poll',
      queueId,
      token: recipientToken,
      limit,
    }));
  }
  const result = await postJson<{ ok: boolean; packets: PollResult['packets']; nextCursor: string | null }>(
    config,
    '/api/anon/poll',
    padJsonBody(body, CONTROL_BODY_BYTES),
  );
  return {
    packets: Array.isArray(result?.packets) ? result.packets : [],
    nextCursor: result?.nextCursor ?? null,
  };
}

export async function ackAnonQueue(
  config: AnonHttpRelayConfig,
  queueId: string,
  recipientToken: string,
  packetIds: string[],
  signingKey?: string,
): Promise<boolean> {
  const body: Record<string, unknown> = { queueId, recipientToken, packetIds };
  if (signingKey) {
    Object.assign(body, signQueueCommand(signingKey, {
      action: 'ack',
      queueId,
      token: recipientToken,
      packetIds,
    }));
  }
  const result = await postJson<{ ok: boolean }>(
    config,
    '/api/anon/ack',
    padJsonBody(body, ACK_BODY_BYTES),
  );
  return Boolean(result?.ok);
}

export async function deleteAnonQueue(
  config: AnonHttpRelayConfig,
  queueId: string,
  recipientToken: string,
  signingKey?: string,
): Promise<boolean> {
  const body: Record<string, unknown> = { queueId, recipientToken };
  if (signingKey) {
    Object.assign(body, signQueueCommand(signingKey, {
      action: 'delete_queue',
      queueId,
      token: recipientToken,
    }));
  }
  const result = await postJson<{ ok: boolean }>(
    config,
    '/api/anon/queues/delete',
    padJsonBody(body, CONTROL_BODY_BYTES),
  );
  return Boolean(result?.ok);
}

export class AnonQueueTransport {
  private readonly config: AnonHttpRelayConfig;
  constructor(config: AnonHttpRelayConfig) {
    this.config = config;
  }
  createQueue(ttlMs?: number, pow?: PowChallenge) {
    return createAnonQueue(this.config, ttlMs, pow);
  }
  enqueue(
    queueId: string,
    senderToken: string,
    packet: string,
    signingKey?: string,
    pow?: PowSolution,
    inviteToken?: string,
  ) {
    return enqueueAnonPacket(this.config, queueId, senderToken, packet, signingKey, pow, inviteToken);
  }
  poll(queueId: string, recipientToken: string, limit?: number, signingKey?: string) {
    return pollAnonQueue(this.config, queueId, recipientToken, limit, signingKey);
  }
  ack(queueId: string, recipientToken: string, packetIds: string[], signingKey?: string) {
    return ackAnonQueue(this.config, queueId, recipientToken, packetIds, signingKey);
  }
  deleteQueue(queueId: string, recipientToken: string, signingKey?: string) {
    return deleteAnonQueue(this.config, queueId, recipientToken, signingKey);
  }
}
