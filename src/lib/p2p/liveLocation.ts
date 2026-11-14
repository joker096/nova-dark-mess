/**
 * Live location sharing in groups: fan-out of ephemeral position updates
 * with expiry and simple geofencing helpers.
 */

export interface LiveLocationPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
  expiresAt: number;
}

export interface LiveLocationUpdate {
  chatId: string;
  userId: string;
  point: LiveLocationPoint;
}

export interface LiveLocationManagerOptions {
  now?: () => number;
  onBroadcast?: (update: LiveLocationUpdate) => void | Promise<void>;
}

export class LiveLocationManager {
  private readonly now: () => number;
  private readonly onBroadcast?: LiveLocationManagerOptions['onBroadcast'];
  private readonly active = new Map<string, Map<string, LiveLocationPoint>>();

  constructor(options: LiveLocationManagerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.onBroadcast = options.onBroadcast;
  }

  public async start(
    chatId: string,
    userId: string,
    point: { latitude: number; longitude: number; accuracy?: number },
    durationMs: number,
  ): Promise<LiveLocationUpdate> {
    const now = this.now();
    const update: LiveLocationUpdate = {
      chatId,
      userId,
      point: {
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        timestamp: now,
        expiresAt: now + durationMs,
      },
    };
    this.store(update);
    await this.onBroadcast?.(update);
    return update;
  }

  public async update(
    chatId: string,
    userId: string,
    point: { latitude: number; longitude: number; accuracy?: number },
  ): Promise<LiveLocationUpdate | null> {
    const existing = this.active.get(chatId)?.get(userId);
    if (!existing || this.isExpired(existing)) return null;
    const remaining = existing.expiresAt - this.now();
    if (remaining <= 0) return null;
    return this.start(chatId, userId, point, remaining);
  }

  public stop(chatId: string, userId: string): void {
    this.active.get(chatId)?.delete(userId);
  }

  public getActive(chatId: string): LiveLocationUpdate[] {
    const now = this.now();
    const chat = this.active.get(chatId);
    if (!chat) return [];
    const result: LiveLocationUpdate[] = [];
    for (const [userId, point] of chat.entries()) {
      if (point.expiresAt > now) {
        result.push({ chatId, userId, point });
      } else {
        chat.delete(userId);
      }
    }
    return result;
  }

  public isExpired(point: LiveLocationPoint): boolean {
    return point.expiresAt <= this.now();
  }

  /** Haversine distance in meters. */
  public distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  public withinGeofence(
    point: { latitude: number; longitude: number },
    center: { latitude: number; longitude: number },
    radiusMeters: number,
  ): boolean {
    return this.distanceMeters(point, center) <= radiusMeters;
  }

  private store(update: LiveLocationUpdate): void {
    if (!this.active.has(update.chatId)) {
      this.active.set(update.chatId, new Map());
    }
    this.active.get(update.chatId)!.set(update.userId, update.point);
  }
}
