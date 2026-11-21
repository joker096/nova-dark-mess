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
