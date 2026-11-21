import type { RelayEndpoint } from './relays';
import { isAllowedRelayUrl } from './session';

/**
 * Relay endpoints the build ships with, primary first.
 *
 * Every URL is an independent base URL of the anonymous relay (`server.js`
 * `/api/anon/*`). Several operators or several hosts of the same operator keep
 * the messenger working when one of them disappears: the landing page, its
 * DNS, or a single provider going dark is exactly the failure this list exists
 * for. An empty URL (build without a relay) yields an empty list, so the app
 * stays in local-only mode.
 */
export function relayEndpointsFromEnv(...urls: Array<string | undefined | null>): RelayEndpoint[] {
  const seen = new Set<string>();
  const endpoints: RelayEndpoint[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim().replace(/\/+$/, '');
    if (!url || seen.has(url) || !isAllowedRelayUrl(url)) continue;
    seen.add(url);
    endpoints.push({ id: url, url });
  }
  return endpoints;
}

/**
 * Relay plan for a conversation whose relays sit on different hosts.
 *
 * Rotation (`rotateInbox`) re-creates the queue on the next relay only when the
 * inbox carries more than one endpoint. A cross-host relay is a different
 * server, so the queue must first be moved onto the first endpoint of the list
 * — the same host the user already sends to — and only then rotated. Building
 * the plan at contact time also makes the contacts recorded in the invitation
 * agree on the rotation order with the other side.
 *
 * A queue that lives on a host outside the list (a single-relay invite from an
 * older build) gets no plan: it keeps living where its invite says it does.
 *
 * `currentRelayUrl` is where this conversation's own queue lives, `relayUrl`
 * is the peer's relay. A queue on the configured host takes the configured
 * order as-is; a queue on another host runs its own list that ends with the
 * configured relays, so rotation crosses hosts inside that one conversation.
 */
export function planRelayEndpoints(
  currentRelayUrl: string,
  relayUrl: string,
  relays: RelayEndpoint[],
): RelayEndpoint[] {
  if (relays.length === 0) return [];
  const current = currentRelayUrl.trim().replace(/\/+$/, '');
  const own = relays.find((relay) => relay.url === current);
  if (own) return relays;
  const queue = relayUrl.trim().replace(/\/+$/, '');
  if (queue !== current) return relays;
  // The own queue sits on an older, unlisted relay: rotate between that relay
  // and the configured one instead of pinning every queue to a single host.
  return [{ id: current, url: current }, ...relays.filter((relay) => relay.url !== current)];
}
