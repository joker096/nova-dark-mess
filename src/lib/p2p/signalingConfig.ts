/**
 * Resolve the WebSocket signaling endpoint.
 *
 * `VITE_SIGNALING_URL` wins when set (useful when signaling runs on a separate
 * host). Otherwise it is derived from the configured relay URL, because the
 * relay server exposes `/api/signaling` on the same origin.
 *
 * Returns undefined when neither is configured: calls then cannot leave the
 * local device, and the UI says so instead of silently using the in-page bus.
 */
export function resolveSignalingUrl(): string | undefined {
  const explicit = (import.meta.env.VITE_SIGNALING_URL ?? '').trim();
  if (explicit) return explicit;

  const relay = (import.meta.env.VITE_ANON_RELAY_URL ?? '').trim();
  if (!relay) return undefined;

  try {
    const url = new URL(relay);
    // Skip local/private IPs that are clearly not signaling servers (e.g. AI
    // Studio internal addresses like 127.24.1.1). Only allow localhost/127.0.0.1
    // for explicit local development, or public hosts.
    const hostname = url.hostname;
    if (
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      hostname !== '::1' &&
      (hostname.startsWith('127.') || // 127.0.0.0/8
        hostname.startsWith('10.') || // 10.0.0.0/8
        hostname.startsWith('172.1') || // 172.16.0.0/12 (172.16-172.31)
        hostname.startsWith('172.2') ||
        hostname.startsWith('172.3') ||
        hostname.startsWith('192.168.')) // 192.168.0.0/16
    ) {
      return undefined;
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/api/signaling';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

/**
 * TURN servers supplied at build time, used when the user has not configured
 * any in Settings → Privacy. Format: comma-separated `turn:`/`turns:` URLs.
 */
export function resolveTurnServers(): RTCIceServer[] {
  const urls = (import.meta.env.VITE_TURN_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) return [];

  const username = (import.meta.env.VITE_TURN_USERNAME ?? '').trim();
  const credential = (import.meta.env.VITE_TURN_CREDENTIAL ?? '').trim();
  const server: RTCIceServer = { urls };
  if (username) server.username = username;
  if (credential) server.credential = credential;
  return [server];
}
