import { AnonQueueTransport } from './httpRelay';
import { ProxyAnonTransport } from './proxy';
import { JitteredTransport } from './jitter';
import type { AnonTransport, CreatedQueue } from './types';
import type { PowChallenge } from './spam';
import type { AbuseReportSubmission } from './blocks';

export interface AnonInboxTransport extends AnonTransport {
  createQueue(ttlMs?: number, pow?: PowChallenge): Promise<CreatedQueue | null> | CreatedQueue | null;
  submitAbuseReport?(report: AbuseReportSubmission): Promise<boolean>;
}

export interface TransportConfig {
  /** Clearnet relay base URL. */
  relayUrl?: string;
  /** Optional proxy configuration (two-hop mode, with failover list). */
  proxy?: {
    proxyUrl: string;
    relayId: string;
    relayPublicKey: string;
    /** Additional proxy base URLs tried in order when the primary fails. */
    fallbackProxies?: string[];
  };
  /** Whether to add timing jitter. Defaults to true. */
  jitter?: boolean;
  /** Jitter overrides. */
  jitterOptions?: { sendMinMs?: number; sendMaxMs?: number; pollMinMs?: number; pollMaxMs?: number };
  fetchImpl?: typeof fetch;
}

/**
 * Builds the transport used by the anonymous stack. Preference order:
 *   1. proxy (two-hop) when configured;
 *   2. direct HTTP relay otherwise.
 * Proxy mode supports a failover list (`fallbackProxies`).
 * Jitter is applied on top in both cases.
 */
export function createAnonTransport(config: TransportConfig): AnonInboxTransport {
  const base = config.proxy
    ? new ProxyAnonTransport({ ...config.proxy, fetchImpl: config.fetchImpl })
    : new AnonQueueTransport({ baseUrl: config.relayUrl || '', fetchImpl: config.fetchImpl });

  const transport: AnonTransport = config.jitter === false
  ? base
  : new JitteredTransport(base, {
    sendMinMs: 250,
    sendMaxMs: 2500,
    pollMinMs: 500,
    pollMaxMs: 5000,
    ...config.jitterOptions,
  });

  return {
  createQueue: (ttlMs, pow) => base.createQueue(ttlMs, pow),
  enqueue: (...args) => transport.enqueue(...args),
  poll: (...args) => transport.poll(...args),
  ack: (...args) => transport.ack(...args),
  ...(base instanceof ProxyAnonTransport
    ? { submitAbuseReport: (report: AbuseReportSubmission) => base.submitAbuseReport(report) }
    : {}),
  };
}
