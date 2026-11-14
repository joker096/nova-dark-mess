import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveLocationManager } from './liveLocation';

describe('LiveLocationManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts and lists active locations', async () => {
    const manager = new LiveLocationManager();
    vi.setSystemTime(1000);
    await manager.start('chat1', 'user1', { latitude: 1, longitude: 2 }, 5000);

    const active = manager.getActive('chat1');
    expect(active).toHaveLength(1);
    expect(active[0].userId).toBe('user1');
    expect(active[0].point.expiresAt).toBe(6000);
  });

  it('expires locations', async () => {
    const manager = new LiveLocationManager();
    vi.setSystemTime(1000);
    await manager.start('chat1', 'user1', { latitude: 1, longitude: 2 }, 1000);

    vi.setSystemTime(2500);
    expect(manager.getActive('chat1')).toHaveLength(0);
    expect(manager.isExpired(manager.getActive('chat1')[0]?.point ?? { latitude: 0, longitude: 0, timestamp: 0, expiresAt: 1500 })).toBe(true);
  });

  it('updates remaining duration', async () => {
    const manager = new LiveLocationManager();
    vi.setSystemTime(1000);
    await manager.start('chat1', 'user1', { latitude: 1, longitude: 2 }, 5000);
    vi.setSystemTime(2000);
    const updated = await manager.update('chat1', 'user1', { latitude: 3, longitude: 4 });
    expect(updated?.point.expiresAt).toBe(6000);
    expect(updated?.point.latitude).toBe(3);
  });

  it('stops sharing', async () => {
    const manager = new LiveLocationManager();
    vi.setSystemTime(1000);
    await manager.start('chat1', 'user1', { latitude: 1, longitude: 2 }, 5000);
    manager.stop('chat1', 'user1');
    expect(manager.getActive('chat1')).toHaveLength(0);
  });

  it('computes distance and geofence', () => {
    const manager = new LiveLocationManager();
    const distance = manager.distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.001 });
    expect(distance).toBeGreaterThan(0);
    expect(manager.withinGeofence({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }, 1)).toBe(true);
  });
});
