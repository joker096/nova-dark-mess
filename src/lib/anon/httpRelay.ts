import { generateQueueSigningKeyPair, signQueueCommand } from './signing';
import type { PowChallenge, PowSolution } from './spam';
import type { CreatedQueue, EnqueueResult, PollResult } from './types';

export interface AnonHttpRelayConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function postJson<T>(config: AnonHttpRelayConfig, path: string, body: unknown): Promise<T | null> {
  const fetchFn = config.fetchImpl || fetch;
  try {
    const res = await fetchFn(`${normalizeBase(config.baseUrl)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
  const result = await postJson<{
    ok: boolean;
    queueId: string;
    senderToken: string;
    recipientToken: string;
    inviteToken: string;
    expiresAt: number;
  }>(config, '/api/anon/queues', {
    ...(ttlMs ? { ttlMs } : {}),
    ...(pow ? { pow } : {}),
    signingPublicKey: signing.publicKey,
  });
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
    body,
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
    body,
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
  const result = await postJson<{ ok: boolean }>(config, '/api/anon/ack', body);
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
  const result = await postJson<{ ok: boolean }>(config, '/api/anon/queues/delete', body);
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
