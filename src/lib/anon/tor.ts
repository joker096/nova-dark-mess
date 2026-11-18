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

/** Tauri command implemented in `src-tauri/src/anon_net.rs`. */
export const TAURI_TOR_COMMAND = 'anon_socks_request';
/** Tauri command that probes whether a local Tor SOCKS listener answers. */
export const TAURI_TOR_CHECK_COMMAND = 'anon_tor_check';
/** Default Tor SOCKS listener (`tor` daemon, Tor Browser, Orbot). */
export const DEFAULT_TOR_SOCKS_PORT = 9050;

export interface TorHttpResponse {
  status: number;
  body: string;
}

export interface TorCheckResult {
  ok: boolean;
  port: number;
  error?: string;
}

export type TorInvoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

export interface TorFetchOptions {
  socksPort?: number;
  /** Injection point for tests; defaults to the Tauri `invoke` bridge. */
  invoke?: TorInvoke;
}

async function invokeTauri(command: string, args: Record<string, unknown>): Promise<unknown> {
  const core = await import('@tauri-apps/api/core').catch(() => null);
  if (!core || typeof core.invoke !== 'function') {
    throw new Error('Tor transport requires the native Tauri shell');
  }
  return core.invoke(command, args);
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

/**
 * Probes the local SOCKS listener through the native bridge and reports
 * whether Tor (or a Tor-compatible proxy) is actually reachable. The app uses
 * this before enabling Tor mode so a misconfigured port fails loud instead of
 * breaking every relay request silently.
 */
export async function checkTorRunning(
  options: { socksPort?: number; invoke?: TorInvoke } = {},
): Promise<TorCheckResult> {
  const socksPort = options.socksPort ?? DEFAULT_TOR_SOCKS_PORT;
  const invoke = options.invoke ?? invokeTauri;
  const result = (await invoke(TAURI_TOR_CHECK_COMMAND, { socksPort })) as TorCheckResult | null;
  if (!result || typeof result.ok !== 'boolean' || typeof result.port !== 'number') {
    throw new Error('Tor check returned an invalid response');
  }
  return result;
}

/**
 * Fetch-compatible client that routes every request through the native SOCKS5
 * bridge, so the existing HTTP, proxy and pairing transports work unchanged on
 * a `.onion` relay. Only plain `http://` onion URLs are accepted: Tor
 * authenticates the v3 onion service and encrypts the circuit end to end, and
 * the sealed payload is already encrypted above that.
 */
export function createTorFetch(options: TorFetchOptions = {}): typeof fetch {
  const socksPort = options.socksPort ?? DEFAULT_TOR_SOCKS_PORT;
  const invoke = options.invoke ?? invokeTauri;

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!isOnionUrl(url)) {
      throw new TypeError('Tor transport only accepts .onion endpoints');
    }
    if (!url.startsWith('http://')) {
      throw new Error('Tor transport supports http:// .onion endpoints only');
    }
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      throw new Error(`Tor transport does not support ${method}`);
    }
    if (init?.body !== undefined && typeof init.body !== 'string') {
      throw new Error('Tor transport only supports string request bodies');
    }

    const result = (await invoke(TAURI_TOR_COMMAND, {
      request: {
        url,
        method,
        ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        socksPort,
      },
    })) as TorHttpResponse | null;

    if (!result || typeof result.status !== 'number') {
      throw new Error('Tor bridge returned an invalid response');
    }
    const body = result.body ?? '';
    const bodyless = body === '' || result.status === 204 || result.status === 205 || result.status === 304;
    return new Response(bodyless ? null : body, {
      status: result.status,
      headers: bodyless ? undefined : { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}
