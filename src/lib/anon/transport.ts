import { AnonQueueTransport } from './httpRelay';
import { ProxyAnonTransport } from './proxy';
import { JitteredTransport } from './jitter';
import { createTorFetch, type TorFetchOptions } from './tor';
import { recordRelayLatency } from './relayLatency';
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
  /**
   * Route relay traffic through the native Tor SOCKS bridge (Phase I).
   * `true` uses the default local listener; an object forwards the options.
   * Requires a `.onion` relay/proxy URL and the Tauri shell.
   */
  tor?: boolean | TorFetchOptions;
}

/**
 * Builds the transport used by the anonymous stack. Preference order:
 *   1. proxy (two-hop) when configured;
 *   2. direct HTTP relay otherwise.
 * Proxy mode supports a failover list (`fallbackProxies`).
 * Jitter is applied on top in both cases.
 * `tor` replaces the network layer with the native SOCKS5 bridge, so either
 * mode can run against a `.onion` relay without changing the code above it.
 */
export function createAnonTransport(config: TransportConfig): AnonInboxTransport {
  const fetchImpl =
    config.fetchImpl ??
    (config.tor ? createTorFetch(config.tor === true ? {} : config.tor) : undefined);
  const base = config.proxy
    ? new ProxyAnonTransport({ ...config.proxy, fetchImpl })
    : new AnonQueueTransport({ baseUrl: config.relayUrl || '', fetchImpl });

  const transport: AnonTransport = config.jitter === false
  ? base
  : new JitteredTransport(base, {
    sendMinMs: 250,
    sendMaxMs: 2500,
    pollMinMs: 500,
    pollMaxMs: 5000,
    ...config.jitterOptions,
  });

  const relayUrl = config.proxy ? config.proxy.proxyUrl : config.relayUrl || '';

  /**
   * Times one transport round trip and records the latency for the relay the
   * client talks to, so the user can see the cost of the chosen mode.
   */
  const measure = <T>(call: () => T): T => {
    const start = Date.now();
    const result = call() as any;
    if (result instanceof Promise) {
      return result.then((value) => {
        recordRelayLatency(relayUrl, Date.now() - start);
        return value;
      }) as any;
    }
    recordRelayLatency(relayUrl, Date.now() - start);
    return result as any;
  };

  return {
  createQueue: (ttlMs, pow) => measure(() => base.createQueue(ttlMs, pow)),
  enqueue: (...args) => measure(() => transport.enqueue(...args)),
  poll: (...args) => measure(() => transport.poll(...args)),
  ack: (...args) => measure(() => transport.ack(...args)),
  ...(base instanceof ProxyAnonTransport
    ? { submitAbuseReport: (report: AbuseReportSubmission) => base.submitAbuseReport(report) }
    : {}),
  };
}
