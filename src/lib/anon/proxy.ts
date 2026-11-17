import {
  generateRoutingKeyPair,
  openRoutingEnvelope,
  sealRoutingEnvelope,
  type RoutingCreateResponse,
  type RoutingEnvelope,
  type RoutingRequest,
} from './routing';
import type { AbuseReportSubmission } from './blocks';
import { generateQueueSigningKeyPair, signQueueCommand } from './signing';
import type { PowChallenge, PowSolution } from './spam';
import type { AnonTransport, CreatedQueue, EnqueueResult, PollResult } from './types';

/**
 * Two-hop proxy delivery.
 *
 * The client seals each relay command to the destination relay's pinned
 * X25519 routing key. The proxy only sees the opaque relay id and the sealed
 * envelope: not the queue ID, not the bearer token, not the packet contents.
 * The destination relay sees the proxy's IP, not the sender's.
 */
export interface ProxyConfig {
  /** Public base URL of the proxy service. */
  proxyUrl: string;
  /** Opaque relay id understood by the proxy (`ANON_PROXY_TARGETS`). */
  relayId: string;
  /** Relay routing public key, pinned out of band. */
  relayPublicKey: string;
  /**
   * Additional proxies used for failover when the primary proxy fails.
   * Each entry replaces `proxyUrl`; relay id and pinned key stay the same
   * because they describe the destination relay, not the proxy.
   */
  fallbackProxies?: string[];
  fetchImpl?: typeof fetch;
}

interface ProxyHealth {
  /** Consecutive failures; 0 means healthy. */
  failures: number;
  /** Epoch ms until which the proxy is skipped after repeated failures. */
  cooldownUntil: number;
}

const MAX_FAILURES_BEFORE_COOLDOWN = 3;
const COOLDOWN_MS = 60 * 1000;

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Transport that hides the client IP behind a proxy hop. Poll/ack still go
 * through the proxy so the relay never sees the recipient's address either.
 */
export class ProxyAnonTransport implements AnonTransport {
  private readonly proxies: string[];
  private readonly relayId: string;
  private readonly relayPublicKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly health = new Map<string, ProxyHealth>();

  constructor(config: ProxyConfig) {
    if (!config.relayPublicKey) {
      throw new Error('Proxy mode requires a pinned relay routing public key');
    }
    this.proxies = [config.proxyUrl, ...(config.fallbackProxies || [])]
      .map((url) => normalizeBase(url))
      .filter((url, index, all) => url && all.indexOf(url) === index);
    this.relayId = config.relayId;
    this.relayPublicKey = config.relayPublicKey;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  /** Ordered candidate list: healthy proxies first, cooldowns last. */
  private candidates(): string[] {
    const now = Date.now();
    const healthy: string[] = [];
    const cooling: string[] = [];
    for (const proxy of this.proxies) {
      const state = this.health.get(proxy);
      if (state && state.cooldownUntil > now) cooling.push(proxy);
      else healthy.push(proxy);
    }
    return [...healthy, ...cooling];
  }

  private markFailure(proxy: string): void {
    const state = this.health.get(proxy) || { failures: 0, cooldownUntil: 0 };
    state.failures += 1;
    if (state.failures >= MAX_FAILURES_BEFORE_COOLDOWN) {
      state.cooldownUntil = Date.now() + COOLDOWN_MS;
      state.failures = 0;
    }
    this.health.set(proxy, state);
  }

  private markSuccess(proxy: string): void {
    this.health.set(proxy, { failures: 0, cooldownUntil: 0 });
  }

  /**
   * Sends the sealed envelope through the first working proxy. Failover is
   * transparent: the same opaque relay id and sealed envelope go to each
   * candidate, so a proxy failure never changes what the relay sees.
   */
  private async sendViaProxies<T>(body: unknown): Promise<T | null> {
    for (const proxy of this.candidates()) {
      try {
        const res = await this.fetchImpl(`${proxy}/api/anon/hop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          this.markFailure(proxy);
          continue;
        }
        const parsed = (await res.json()) as T;
        this.markSuccess(proxy);
        return parsed;
      } catch {
        this.markFailure(proxy);
      }
    }
    return null;
  }

  private async sendRoute<T>(route: RoutingRequest): Promise<T | null> {
    const envelope = await sealRoutingEnvelope(this.relayPublicKey, route);
    return this.sendViaProxies<T>({
      relay: this.relayId,
      envelope,
    });
  }

  async createQueue(ttlMs?: number, pow?: PowChallenge): Promise<CreatedQueue | null> {
    const reply = generateRoutingKeyPair();
    const signing = generateQueueSigningKeyPair();
    const result = await this.sendRoute<{ ok: boolean; envelope: RoutingEnvelope }>({
      action: 'create',
      ttlMs,
      replyPublicKey: reply.publicKey,
      signingPublicKey: signing.publicKey,
      ...(pow ? { pow } : {}),
    });
    if (!result?.envelope) return null;
    try {
      const opened = await openRoutingEnvelope<RoutingCreateResponse>(reply.privateKey, result.envelope);
      const now = Date.now();
      if (
        opened.action !== 'create' ||
        !opened.queueId ||
        !opened.senderToken ||
        !opened.recipientToken ||
        !opened.inviteToken ||
        !Number.isFinite(opened.expiresAt) ||
        opened.iat < now - 5 * 60 * 1000 ||
        opened.iat > now + 60 * 1000
      ) {
        return null;
      }
      return {
        queueId: opened.queueId,
        senderToken: opened.senderToken,
        recipientToken: opened.recipientToken,
        expiresAt: opened.expiresAt,
        signingKey: signing.privateKey,
        signingPublicKey: signing.publicKey,
        inviteToken: opened.inviteToken,
      };
    } catch {
      return null;
    }
  }

  async enqueue(
    queueId: string,
    senderToken: string,
    packet: string,
    signingKey?: string,
    pow?: PowSolution,
    inviteToken?: string,
  ): Promise<EnqueueResult | null> {
    const route: RoutingRequest = {
      action: 'enqueue',
      queueId,
      token: senderToken,
      packet,
      ...(pow ? { pow } : {}),
      ...(inviteToken ? { inviteToken } : {}),
    };
    if (signingKey) Object.assign(route, signQueueCommand(signingKey, {
      action: 'enqueue',
      queueId,
      token: senderToken,
      packet,
      pow,
    }));
    const result = await this.sendRoute<{ ok: boolean; packetId: string; expiresAt: number }>(route);
    if (!result?.packetId) return null;
    return { packetId: result.packetId, expiresAt: result.expiresAt };
  }

  async poll(
    queueId: string,
    recipientToken: string,
    limit = 32,
    signingKey?: string,
  ): Promise<PollResult> {
    const route: RoutingRequest = {
      action: 'poll',
      queueId,
      token: recipientToken,
      limit,
    };
    if (signingKey) Object.assign(route, signQueueCommand(signingKey, {
      action: 'poll',
      queueId,
      token: recipientToken,
      limit,
    }));
    const result = await this.sendRoute<{
      ok: boolean;
      packets: PollResult['packets'];
      nextCursor: string | null;
    }>(route);
    return {
      packets: Array.isArray(result?.packets) ? result.packets : [],
      nextCursor: result?.nextCursor ?? null,
    };
  }

  async ack(
    queueId: string,
    recipientToken: string,
    packetIds: string[],
    signingKey?: string,
  ): Promise<boolean> {
    const route: RoutingRequest = {
      action: 'ack',
      queueId,
      token: recipientToken,
      packetIds,
    };
    if (signingKey) Object.assign(route, signQueueCommand(signingKey, {
      action: 'ack',
      queueId,
      token: recipientToken,
      packetIds,
    }));
    const result = await this.sendRoute<{ ok: boolean }>(route);
    return Boolean(result?.ok);
  }

  async submitAbuseReport(report: AbuseReportSubmission): Promise<boolean> {
    const result = await this.sendRoute<{ ok: boolean }>({
      action: 'report',
      report,
    });
    return result?.ok === true;
  }
}
