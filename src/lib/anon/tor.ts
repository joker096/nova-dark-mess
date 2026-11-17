/**
 * Tor / onion routing (phase I).
 *
 * The client cannot open a SOCKS circuit from a browser webview by itself, but
 * Tauri's native layer can. From the TypeScript side, Tor support is just a
 * configuration concern: a relay or proxy base URL that ends in `.onion`. When
 * such a URL is configured, the transport talks to it through the native proxy
 * instead of the clearnet endpoint.
 *
 * Keeping this in a tiny module means the rest of the anonymous stack never
 * needs to know whether it is on Tor, a clearnet relay, or a two-hop proxy.
 */

export interface TorEndpoint {
  /** Must end in `.onion` (v3, 56 chars). */
  url: string;
  /** Local SOCKS proxy port exposed by the native/Tauri layer, if any. */
  socksPort?: number;
}

export function isOnionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('.onion');
  } catch {
    return false;
  }
}

export function normalizeTorEndpoint(input: string | TorEndpoint): TorEndpoint {
  const url = typeof input === 'string' ? input : input.url;
  if (!isOnionUrl(url)) {
    throw new Error('Tor endpoint must use a .onion hostname');
  }
  const socksPort = typeof input === 'string' ? undefined : input.socksPort;
  return { url: url.replace(/\/+$/, ''), socksPort };
}

export function describeTransport(endpoint: TorEndpoint): string {
  return socksPortLabel(endpoint.socksPort)
    ? `tor (socks ${endpoint.socksPort}) → ${endpoint.url}`
    : `tor (system proxy) → ${endpoint.url}`;
}

function socksPortLabel(port?: number): boolean {
  return typeof port === 'number' && port > 0;
}
