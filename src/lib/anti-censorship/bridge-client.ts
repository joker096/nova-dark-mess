/**
 * Bridge client (Etapa 9).
 *
 * Manages a list of anti-censorship bridges and attempts connections through
 * them when the direct path is blocked. Bridges are tried in priority order
 * with per-bridge failure cooldowns.
 */

import type { BridgeConfig, TransportConfig } from './transports';
import { sortBridgesByPriority, transportFromBridge } from './transports';

export interface BridgeHealth {
  address: string;
  failures: number;
  cooldownUntil: number; // ms
  lastAttempt?: number;
}

export class BridgeClient {
  private bridges: BridgeConfig[];
  private health: Map<string, BridgeHealth> = new Map();
  private readonly cooldownMs: number;

  constructor(bridges: BridgeConfig[], cooldownMs = 5 * 60 * 1000) {
    this.bridges = sortBridgesByPriority(bridges);
    this.cooldownMs = cooldownMs;
    for (const b of this.bridges) {
      this.health.set(b.address, {
        address: b.address,
        failures: 0,
        cooldownUntil: 0,
      });
    }
  }

  /** Returns the next healthy bridge to try, or null if all are in cooldown. */
  nextBridge(): BridgeConfig | null {
    const now = Date.now();
    let best: BridgeConfig | null = null;
    let bestHealth: BridgeHealth | null = null;

    for (const b of this.bridges) {
      const h = this.health.get(b.address);
      if (!h) continue;
      if (now < h.cooldownUntil) continue; // in cooldown
      if (!bestHealth || h.failures < bestHealth.failures) {
        best = b;
        bestHealth = h;
      }
    }
    return best;
  }

  /** Mark a bridge as failed; it enters cooldown. */
  reportFailure(address: string): void {
    const h = this.health.get(address);
    if (!h) return;
    h.failures += 1;
    h.cooldownUntil = Date.now() + this.cooldownMs * h.failures;
  }

  /** Mark a bridge as healthy; reset failure count and cooldown. */
  reportSuccess(address: string): void {
    const h = this.health.get(address);
    if (!h) return;
    h.failures = 0;
    h.cooldownUntil = 0;
    h.lastAttempt = Date.now();
  }

  /** Get health info for all bridges (for UI diagnostics). */
  getBridgeHealth(): BridgeHealth[] {
    return [...this.health.values()].sort((a, b) => a.address.localeCompare(b.address));
  }

  /** Get all configured bridges with their transport configs. */
  getBridgesWithConfig(): Array<BridgeConfig & { transport: TransportConfig }> {
    return this.bridges.map((b) => ({ ...b, transport: transportFromBridge(b) }));
  }

  /** Add a user-configured bridge. */
  addBridge(bridge: BridgeConfig): void {
    if (this.bridges.find((b) => b.address === bridge.address)) return;
    this.bridges.push(bridge);
    this.bridges = sortBridgesByPriority(this.bridges);
    this.health.set(bridge.address, {
      address: bridge.address,
      failures: 0,
      cooldownUntil: 0,
    });
  }

  /** Remove a bridge. */
  removeBridge(address: string): void {
    this.bridges = this.bridges.filter((b) => b.address !== address);
    this.health.delete(address);
  }
}
