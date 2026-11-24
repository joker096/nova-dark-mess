import type { PowSolution } from './spam';
import type { AnonTransport, EnqueueResult, PollResult } from './types';

export interface JitterOptions {
  sendMinMs?: number;
  sendMaxMs?: number;
  pollMinMs?: number;
  pollMaxMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff;
}

function between(min: number, max: number, random: () => number): number {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * Wraps a transport so that enqueue and poll are delayed by a random amount.
 * The delay blurs timing correlation between "someone sent" and "someone
 * polled" without changing the wire format.
 */
export class JitteredTransport implements AnonTransport {
  private readonly inner: AnonTransport;
  private readonly options: Required<JitterOptions>;

  constructor(inner: AnonTransport, options: JitterOptions = {}) {
    this.inner = inner;
    this.options = {
      sendMinMs: options.sendMinMs ?? 0,
      sendMaxMs: options.sendMaxMs ?? 1500,
      pollMinMs: options.pollMinMs ?? 0,
      pollMaxMs: options.pollMaxMs ?? 4000,
      random: options.random ?? cryptoRandom,
      sleep: options.sleep ?? defaultSleep,
    };
  }

  async enqueue(
    queueId: string,
    senderToken: string,
    packet: string,
    signingKey?: string,
    pow?: PowSolution,
    inviteToken?: string,
  ): Promise<EnqueueResult | null> {
    const delay = between(this.options.sendMinMs, this.options.sendMaxMs, this.options.random);
    if (delay > 0) await this.options.sleep(delay);
    return this.inner.enqueue(queueId, senderToken, packet, signingKey, pow, inviteToken);
  }

  async poll(
    queueId: string,
    recipientToken: string,
    limit?: number,
    signingKey?: string,
  ): Promise<PollResult> {
    const delay = between(this.options.pollMinMs, this.options.pollMaxMs, this.options.random);
    if (delay > 0) await this.options.sleep(delay);
    return this.inner.poll(queueId, recipientToken, limit, signingKey);
  }

  async ack(
    queueId: string,
    recipientToken: string,
    packetIds: string[],
    signingKey?: string,
  ): Promise<boolean> {
    const result = await this.inner.ack(queueId, recipientToken, packetIds, signingKey);
    return result !== false;
  }
}

export interface DummyTrafficOptions {
  /** Claims queue ids to write cover packets into (e.g. your own queue). */
  queueIds: string[];
  senderTokens: Record<string, string>;
  intervalMs?: number;
  enabled?: boolean;
}

/**
 * Generates random fixed-size packets for cover traffic. Callers decide whether
 * to enable it (battery trade-off); this module only produces the payloads.
 */
export class DummyTrafficScheduler {
  private readonly options: Required<Omit<DummyTrafficOptions, 'senderTokens'>> & { senderTokens: Record<string, string> };
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DummyTrafficOptions) {
    this.options = {
      queueIds: options.queueIds,
      senderTokens: options.senderTokens,
      intervalMs: options.intervalMs ?? 60_000,
      enabled: options.enabled ?? false,
    };
  }

  /** Returns a random fixed-size payload (base64) suitable for cover traffic. */
  static coverPacket(size: number, random: () => number = cryptoRandom): Uint8Array {
    const bytes = new Uint8Array(size);
    for (let i = 4; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
    return bytes;
  }

  start(transport: AnonTransport): void {
    if (!this.options.enabled || this.timer) return;
    this.timer = setInterval(() => {
      const index = Math.floor(cryptoRandom() * this.options.queueIds.length);
      const queueId = this.options.queueIds[index];
      const token = this.options.senderTokens[queueId];
      if (!queueId || !token) return;
      const bytes = DummyTrafficScheduler.coverPacket(16384);
      const payload = btoa(String.fromCharCode(...bytes));
      void transport.enqueue(queueId, token, payload);
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
