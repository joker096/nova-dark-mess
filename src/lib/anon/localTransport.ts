/**
 * Local anonymous transport - fallback when no relay server is available.
 * Stores queues and messages in localStorage for zero-config operation.
 */

import { CreatedQueue, EnqueueResult, PollResult, AnonPacket } from './types';
import type { AbuseReportSubmission } from './blocks';
import type { PowChallenge } from './spam';
import type { AnonInboxTransport } from './transport';

const STORAGE_PREFIX = 'anon_local_queue_';
const MAX_QUEUE_SIZE = 1000;
const MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface LocalQueue {
  id: string;
  senderToken: string;
  recipientToken: string;
  signingKey: string;
  signingPublicKey: string;
  inviteToken: string;
  messages: LocalMessage[];
  createdAt: number;
  expiresAt: number;
}

interface LocalMessage {
  id: string;
  ciphertext: string;
  senderToken: string;
  createdAt: number;
}

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function getQueueKey(queueId: string): string {
  return `${STORAGE_PREFIX}${queueId}`;
}

function loadQueue(queueId: string): LocalQueue | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const data = storage.getItem(getQueueKey(queueId));
    if (!data) return null;
    return JSON.parse(data) as LocalQueue;
  } catch {
    return null;
  }
}

function saveQueue(queue: LocalQueue): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(getQueueKey(queue.id), JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

function deleteQueue(queueId: string): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(getQueueKey(queueId));
}

function cleanupExpiredQueues(): void {
  const storage = getStorage();
  if (!storage) return;
  const now = Date.now();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      try {
        const queue = JSON.parse(storage.getItem(key) || '') as LocalQueue;
        if (queue.expiresAt < now) {
          storage.removeItem(key);
        }
      } catch {
        storage.removeItem(key);
      }
    }
  }
}

function generateId(prefix: string, bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return prefix + Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class LocalAnonTransport implements AnonInboxTransport {
  private readonly isLocal = true;

  createQueue(ttlMs = MESSAGE_TTL_MS, _pow?: PowChallenge): CreatedQueue | null {
    cleanupExpiredQueues();
    const now = Date.now();
    const queueId = generateId('q_');
    const senderToken = generateToken();
    const recipientToken = generateToken();
    const inviteToken = generateToken().slice(0, 32);
    const signingKey = generateToken();
    const signingPublicKey = generateToken();

    const queue: LocalQueue = {
      id: queueId,
      senderToken,
      recipientToken,
      signingKey,
      signingPublicKey,
      inviteToken,
      messages: [],
      createdAt: now,
      expiresAt: now + ttlMs,
    };

    if (!saveQueue(queue)) {
      return null;
    }

    return { queueId, senderToken, recipientToken, expiresAt: now + ttlMs, signingKey, signingPublicKey, inviteToken };
  }

  enqueue(
    queueId: string,
    senderToken: string,
    packet: string,
    _signingKey?: string,
    _pow?: any,
    _inviteToken?: string
  ): EnqueueResult | null {
    const queue = loadQueue(queueId);
    if (!queue) return null;
    if (queue.senderToken !== senderToken) return null;
    if (queue.messages.length >= MAX_QUEUE_SIZE) return null;

    const messageId = generateId('msg_', 12);
    queue.messages.push({
      id: messageId,
      ciphertext: packet,
      senderToken,
      createdAt: Date.now(),
    });

    if (!saveQueue(queue)) return null;
    return { packetId: messageId, expiresAt: queue.expiresAt };
  }

  async poll(queueId: string, recipientToken: string, limit = 50, _signingKey?: string): Promise<PollResult> {
    const queue = loadQueue(queueId);
    if (!queue || queue.recipientToken !== recipientToken) return { packets: [], nextCursor: null };

    const messages = queue.messages
      .filter((m) => m.senderToken !== recipientToken)
      .slice(0, limit)
      .map((m): AnonPacket => ({
        version: 1,
        queueId,
        packetId: m.id,
        createdAt: m.createdAt,
        ttlMs: queue.expiresAt - m.createdAt,
        payload: m.ciphertext,
      }));

    // Remove polled messages
    queue.messages = queue.messages.filter((m) => !messages.some((dm) => dm.packetId === m.id));
    saveQueue(queue);

    return { packets: messages, nextCursor: null };
  }

  async ack(queueId: string, recipientToken: string, packetIds: string[], _signingKey?: string): Promise<boolean> {
    const queue = loadQueue(queueId);
    if (!queue || queue.recipientToken !== recipientToken) return false;

    queue.messages = queue.messages.filter((m) => !packetIds.includes(m.id));
    return saveQueue(queue);
  }

  async deleteQueue(queueId: string, recipientToken: string): Promise<boolean> {
    const queue = loadQueue(queueId);
    if (!queue || queue.recipientToken !== recipientToken) return false;
    deleteQueue(queueId);
    return true;
  }

  async submitAbuseReport(_report: AbuseReportSubmission): Promise<boolean> {
    return true;
  }
}

/**
 * Creates a transport that automatically falls back to local storage
 * when the remote relay is unavailable.
 */
export function createAutoTransport(config: {
  relayUrl: string;
  proxy?: { proxyUrl: string; relayId: string; relayPublicKey: string; fallbackProxies?: string[] };
  tor?: boolean;
  jitter?: boolean;
}): AnonInboxTransport {
  const { createAnonTransport } = require('./transport');
  
  const remoteTransport = createAnonTransport(config);
  const localTransport = new LocalAnonTransport();
  let useLocal = false;
  let lastRemoteCheck = 0;
  const REMOTE_CHECK_INTERVAL = 60_000; // Check remote every minute

  async function checkRemote(): Promise<boolean> {
    const now = Date.now();
    if (now - lastRemoteCheck < REMOTE_CHECK_INTERVAL) return !useLocal;
    lastRemoteCheck = now;

    try {
      // Try to create a test queue to verify remote is working
      const testQueue = remoteTransport.createQueue(60_000);
      if (testQueue) {
        // Clean up test queue
        await remoteTransport.deleteQueue(testQueue.queueId, testQueue.recipientToken);
        if (useLocal) {
          console.log('[anon] Remote relay recovered, switching back');
          useLocal = false;
        }
        return true;
      }
    } catch {
      // Remote failed
    }
    if (!useLocal) {
      console.warn('[anon] Remote relay unavailable, falling back to local mode');
      useLocal = true;
    }
    return false;
  }

  const result: AnonInboxTransport & { isLocalMode: () => boolean; forceLocal: () => void; forceRemote: () => void } = {
    async createQueue(ttlMs, pow) {
      await checkRemote();
      return useLocal ? localTransport.createQueue(ttlMs, pow) : remoteTransport.createQueue(ttlMs, pow);
    },
    async enqueue(queueId, senderToken, packet, signingKey, ttlMs, inviteToken) {
      await checkRemote();
      return useLocal ? localTransport.enqueue(queueId, senderToken, packet, signingKey, ttlMs, inviteToken) : remoteTransport.enqueue(queueId, senderToken, packet, signingKey, ttlMs, inviteToken);
    },
    async poll(queueId, recipientToken, limit, signingKey) {
      await checkRemote();
      return useLocal ? localTransport.poll(queueId, recipientToken, limit, signingKey) : remoteTransport.poll(queueId, recipientToken, limit, signingKey);
    },
    async ack(queueId, recipientToken, packetIds, signingKey) {
      await checkRemote();
      return useLocal ? localTransport.ack(queueId, recipientToken, packetIds, signingKey) : remoteTransport.ack(queueId, recipientToken, packetIds, signingKey);
    },
    async submitAbuseReport(report) {
      await checkRemote();
      return useLocal ? localTransport.submitAbuseReport(report) : remoteTransport.submitAbuseReport(report);
    },
    isLocalMode: () => useLocal,
    forceLocal: () => { useLocal = true; },
    forceRemote: () => { useLocal = false; lastRemoteCheck = 0; },
  };
  return result;
}

/**
 * Check if we're currently in local fallback mode.
 * Can be used to show a UI indicator.
 */
export function isLocalMode(transport: AnonInboxTransport): boolean {
  return 'isLocalMode' in transport && (transport as any).isLocalMode();
}