/**
 * Anti-censorship transports (Etapa 9).
 *
 * Defines the transport types the app can use to reach relays when the
 * direct connection is blocked: WebTunnel, REALITY, Tor, and direct.
 *
 * The actual connection logic lives in the transport layer
 * (`src/lib/network/`); this module only defines the abstractions and
 * default bridge configurations.
 */

export type TransportType = 'direct' | 'webtunnel' | 'reality' | 'tor';

export interface TransportConfig {
  type: TransportType;
  /** Human-readable name for the UI. */
  label: string;
  /** Bridge/relay base URL(s). For Tor: .onion URL(s). */
  endpoints: string[];
  /** Whether this transport requires a native proxy (Tor SOCKS, WebTunnel client). */
  requiresNativeProxy: boolean;
  /** Fallback order — lower = tried first. */
  priority: number;
  /** Default TTL for bridge connections (ms). */
  connectionTtlMs: number;
}

export interface BridgeConfig {
  /** Bridge address (host:port or URL). */
  address: string;
  /** Transport type this bridge speaks. */
  transport: TransportType;
  /** Optional shared secret / password for the bridge. */
  secret?: string;
  /** When this bridge was last known to work (ms). */
  last_good_at?: number;
  /** Fallback order — lower = tried first. */
  priority?: number;
}

/**
 * Default anti-censorship bridge configurations.
 *
 * These are starting points; users/admins can add their own bridges.
 * None of these contain PII or keys — they're just connection hints.
 */
export const DEFAULT_BRIDGES: BridgeConfig[] = [
  {
    address: 'webtunnel.mess.cvr.name:443',
    transport: 'webtunnel',
    priority: 1,
  },
  {
    address: 'reality.mess.cvr.name:443',
    transport: 'reality',
    priority: 2,
  },
  {
    address: 'tor.mess.cvr.name:9050',
    transport: 'tor',
    secret: undefined,
    priority: 3,
  },
];

/**
 * Transport presets — full configs derived from bridges.
 */
export function transportFromBridge(bridge: BridgeConfig): TransportConfig {
  const labels: Record<TransportType, string> = {
    direct: 'Прямое соединение',
    webtunnel: 'WebTunnel',
    reality: 'REALITY',
    tor: 'Tor (.onion)',
  };
  return {
    type: bridge.transport,
    label: labels[bridge.transport],
    endpoints: [bridge.address],
    requiresNativeProxy: bridge.transport === 'tor',
    priority: bridge.priority ?? 99,
    connectionTtlMs: 5 * 60 * 1000,
  };
}

/**
 * Check if a transport requires native proxy support (Tor SOCKS, etc.).
 */
export function transportRequiresNative(type: TransportType): boolean {
  return type === 'tor';
}

/**
 * Sort bridges by priority (lower = preferred).
 */
export function sortBridgesByPriority(bridges: BridgeConfig[]): BridgeConfig[] {
  return [...bridges].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}
