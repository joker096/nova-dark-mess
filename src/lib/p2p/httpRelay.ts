/**
 * HTTP store-and-forward relay transport.
 *
 * Thin, stateless client for the production relay endpoint (server.js
 * `/api/relay`). Envelopes are opaque encrypted blobs; the relay never sees
 * plaintext or identity. Used as a fallback when no direct peers are online.
 */

import type { RelayEnvelope } from './relay';

export interface HttpRelayConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function pushRelayEnvelope(
  config: HttpRelayConfig,
  envelope: RelayEnvelope,
): Promise<boolean> {
  const fetchFn = config.fetchImpl || fetch;
  try {
    const res = await fetchFn(`${normalizeBase(config.baseUrl)}/api/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envelope }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pullRelayEnvelopes(
  config: HttpRelayConfig,
  destination: string,
): Promise<RelayEnvelope[]> {
  const fetchFn = config.fetchImpl || fetch;
  try {
    const res = await fetchFn(
      `${normalizeBase(config.baseUrl)}/api/relay/${encodeURIComponent(destination)}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { envelopes?: RelayEnvelope[] };
    return Array.isArray(data.envelopes) ? data.envelopes : [];
  } catch {
    return [];
  }
}

export class HttpRelayTransport {
  private readonly config: HttpRelayConfig;
  constructor(config: HttpRelayConfig) {
    this.config = config;
  }
  public push(envelope: RelayEnvelope): Promise<boolean> {
    return pushRelayEnvelope(this.config, envelope);
  }
  public pull(destination: string): Promise<RelayEnvelope[]> {
    return pullRelayEnvelopes(this.config, destination);
  }
}
