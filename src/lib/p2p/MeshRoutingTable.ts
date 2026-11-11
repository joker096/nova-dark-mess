export type RouteStatus = 'active' | 'stale' | 'broken';

export interface MeshRoute {
  destination: string;    // X25519 public key of destination node
  nextHop: string;        // X25519 public key of next hop
  path: string[];         // Full path [source, hop1, hop2, ..., destination]
  hops: number;           // Number of hops to destination
  latency: number;        // Estimated latency in ms
  reliability: number;    // 0.0 to 1.0, success rate of forwarded messages
  lastSeen: number;       // Timestamp when route was last validated
  ttl: number;            // Time-to-live in seconds (0 = no expiration)
  status: RouteStatus;
}

export interface MeshRoutingTableOptions {
  defaultTtl?: number;           // Default TTL in seconds (default: 300)
  maxRoutes?: number;            // Maximum number of routes (default: 1000)
  routeExpiryInterval?: number;  // Interval to check for expired routes (default: 60000ms)
}

export class MeshRoutingTable {
  private routes: Map<string, MeshRoute> = new Map(); // destination -> route
  private defaultTtl: number;
  private maxRoutes: number;
  private expiryTimer: NodeJS.Timeout | null = null;

  constructor(options: MeshRoutingTableOptions = {}) {
    this.defaultTtl = options.defaultTtl ?? 300;
    this.maxRoutes = options.maxRoutes ?? 1000;
  }

  /**
   * Add or update a route to a destination.
   * If a route already exists, it's updated only if the new route is better
   * (fewer hops or lower latency).
   */
  addRoute(route: MeshRoute): void {
    const existing = this.routes.get(route.destination);

    if (existing) {
      // Only update if the new route is better
      const isBetter =
        route.hops < existing.hops ||
        (route.hops === existing.hops && route.latency < existing.latency) ||
        route.reliability > existing.reliability;

      if (!isBetter) return;
    }

    // Enforce max routes limit by removing oldest stale route
    if (this.routes.size >= this.maxRoutes && !existing) {
      this.evictOldestStale();
    }

    const normalized: MeshRoute = {
      ...route,
      status: 'active',
      lastSeen: Date.now(),
      ttl: route.ttl ?? this.defaultTtl,
    };

    this.routes.set(route.destination, normalized);
  }

  /**
   * Get the best route to a destination.
   * Returns null if no active route exists.
   */
  getRoute(destination: string): MeshRoute | null {
    const route = this.routes.get(destination);
    if (!route) return null;

    if (this.isExpired(route)) {
      route.status = 'broken';
      return null;
    }

    return route;
  }

  /**
   * Get all active routes.
   */
  getAllRoutes(): MeshRoute[] {
    return Array.from(this.routes.values()).filter(
      (r) => r.status === 'active' && !this.isExpired(r),
    );
  }

  /**
   * Get routes that go through a specific next hop.
   */
  getRoutesViaNextHop(nextHop: string): MeshRoute[] {
    return Array.from(this.routes.values()).filter(
      (r) => r.nextHop === nextHop && r.status === 'active' && !this.isExpired(r),
    );
  }

  /**
   * Mark a route as stale (e.g., after a failed transmission).
   */
  markStale(destination: string): void {
    const route = this.routes.get(destination);
    if (route) {
      route.status = 'stale';
      route.reliability = Math.max(0, route.reliability - 0.1);
    }
  }

  /**
   * Mark a route as broken (e.g., after multiple failures).
   */
  markBroken(destination: string): void {
    const route = this.routes.get(destination);
    if (route) {
      route.status = 'broken';
      route.reliability = 0;
    }
  }

  /**
   * Update route metrics after a successful message forward.
   */
  recordSuccess(destination: string, latency: number): void {
    const route = this.routes.get(destination);
    if (!route) return;

    route.status = 'active';
    route.lastSeen = Date.now();
    route.latency = (route.latency * 0.7) + (latency * 0.3); // EWMA
    route.reliability = Math.min(1, route.reliability + 0.05);
  }

  /**
   * Record a failed transmission attempt.
   */
  recordFailure(destination: string): void {
    const route = this.routes.get(destination);
    if (!route) return;

    route.reliability = Math.max(0, route.reliability - 0.2);
    if (route.reliability < 0.3) {
      route.status = 'stale';
    }
  }

  /**
   * Remove a route from the table.
   */
  removeRoute(destination: string): boolean {
    return this.routes.delete(destination);
  }

  /**
   * Get the number of routes in the table.
   */
  get size(): number {
    return this.routes.size;
  }

  /**
   * Get the number of active routes.
   */
  get activeSize(): number {
    return Array.from(this.routes.values()).filter(
      (r) => r.status === 'active' && !this.isExpired(r),
    ).length;
  }

  /**
   * Find the best next hop for a destination (used by MeshRouter).
   */
  getBestNextHop(destination: string): string | null {
    const route = this.getRoute(destination);
    return route ? route.nextHop : null;
  }

  /**
   * Get the full path to a destination.
   */
  getPath(destination: string): string[] | null {
    const route = this.getRoute(destination);
    return route ? route.path : null;
  }

  /**
   * Start periodic expiry check.
   */
  startExpiryTimer(intervalMs: number = 60000): void {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryTimer = setInterval(() => {
      this.expireExpiredRoutes();
    }, intervalMs);
  }

  /**
   * Stop periodic expiry check.
   */
  stopExpiryTimer(): void {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  private isExpired(route: MeshRoute): boolean {
    if (route.ttl === 0) return false;
    const expiryTime = route.lastSeen + route.ttl * 1000;
    return Date.now() > expiryTime;
  }

  private expireExpiredRoutes(): void {
    for (const [destination, route] of this.routes) {
      if (this.isExpired(route)) {
        route.status = 'broken';
        this.routes.delete(destination);
      }
    }
  }

  private evictOldestStale(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [destination, route] of this.routes) {
      if (route.status !== 'active' && route.lastSeen < oldestTime) {
        oldestTime = route.lastSeen;
        oldest = destination;
      }
    }

    if (oldest) {
      this.routes.delete(oldest);
    }
  }
}
