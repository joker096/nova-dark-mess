/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TransportManager,
  type TransportBackend,
  type TransportType,
} from './TransportManager';

vi.useFakeTimers();

function createMockBackend(
  id: TransportType,
  options: {
    name?: string;
    priority?: number;
    isAvailable?: boolean;
    isBlocked?: boolean;
    latency?: number;
    connectShouldFail?: boolean;
    sendShouldFail?: boolean;
  } = {},
): TransportBackend {
  const {
    name = id,
    priority = 0,
    isAvailable = true,
    isBlocked = false,
    latency = 10,
    connectShouldFail = false,
    sendShouldFail = false,
  } = options;

  const sentMessages: Uint8Array[] = [];

  return {
    id,
    name,
    priority,
    isAvailable,
    isBlocked,
    latency,
    lastProbe: null,
    connect: async () => {
      if (connectShouldFail) throw new Error(`Connect failed for ${id}`);
    },
    disconnect: async () => {
    },
    send: async (data: Uint8Array) => {
      if (sendShouldFail) throw new Error(`Send failed for ${id}`);
      sentMessages.push(data);
    },
    onMessage: undefined,
    onStatusChange: undefined,
  };
}

describe('TransportManager', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('selects highest priority available backend on connect', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 10, isAvailable: false });
    const websocket = createMockBackend('websocket', { priority: 5 });
    const mesh = createMockBackend('mesh', { priority: 1 });

    const tm = new TransportManager({
      backends: [webrtc, websocket, mesh],
    });

    expect(tm.getStatus().current).toBe('mesh');
  });

  it('connects to selected backend', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const tm = new TransportManager({ backends: [webrtc] });

    await tm.connect();
    expect(tm.getStatus().status).toBe('connected');
    expect(tm.getStatus().current).toBe('webrtc');
  });

  it('fails connect when no backends available', async () => {
    const webrtc = createMockBackend('webrtc', { isAvailable: false, isBlocked: true });
    const tm = new TransportManager({ backends: [webrtc] });

    await expect(tm.connect()).rejects.toThrow('No available transport backend');
  });

  it('disconnects from backend', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const tm = new TransportManager({ backends: [webrtc] });

    await tm.connect();
    await tm.disconnect();
    expect(tm.getStatus().status).toBe('disconnected');
    expect(tm.getStatus().current).toBeNull();
  });

  it('sends data through active backend', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const tm = new TransportManager({ backends: [webrtc] });

    await tm.connect();
    await tm.send(new Uint8Array([1, 2, 3]));
    // No error means success
    expect(tm.getStatus().status).toBe('connected');
  });

  it('fails over to next backend when current fails', async () => {
    const webrtc = createMockBackend('webrtc', {
      priority: 1,
      sendShouldFail: true,
    });
    const websocket = createMockBackend('websocket', { priority: 2 });

    const tm = new TransportManager({ backends: [webrtc, websocket] });
    await tm.connect();
    expect(tm.getStatus().current).toBe('webrtc');

    // Trigger failover by causing consecutive failures
    for (let i = 0; i < 3; i++) {
      try {
        await tm.send(new Uint8Array([1]));
      } catch {
        // Expected to fail
      }
    }

    // After failover threshold, should switch to websocket
    expect(tm.getStatus().current).toBe('websocket');
  });

  it('manually selects a backend', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const websocket = createMockBackend('websocket', { priority: 2 });

    const tm = new TransportManager({ backends: [webrtc, websocket] });
    await tm.connect();
    expect(tm.getStatus().current).toBe('webrtc');

    await tm.selectBackend('websocket');
    expect(tm.getStatus().current).toBe('websocket');
  });

  it('cannot select blocked backend', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const websocket = createMockBackend('websocket', {
      priority: 2,
      isBlocked: true,
    });

    const tm = new TransportManager({ backends: [webrtc, websocket] });
    await tm.connect();

    await expect(tm.selectBackend('websocket')).rejects.toThrow(
      'is not available',
    );
  });

  it('tracks backend stats in getStatus', async () => {
    const webrtc = createMockBackend('webrtc', {
      priority: 1,
      latency: 42,
    });
    const websocket = createMockBackend('websocket', {
      priority: 2,
      latency: 100,
      isBlocked: true,
    });

    const tm = new TransportManager({ backends: [webrtc, websocket] });
    const status = tm.getStatus();

    expect(status.backends.webrtc.available).toBe(true);
    expect(status.backends.webrtc.blocked).toBe(false);
    expect(status.backends.webrtc.latency).toBe(42);
    expect(status.backends.websocket.available).toBe(true);
    expect(status.backends.websocket.blocked).toBe(true);
    expect(status.backends.websocket.latency).toBe(100);
  });

  it('notifies status change handlers', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const tm = new TransportManager({ backends: [webrtc] });

    const handler = vi.fn();
    tm.onStatusChange(handler);

    await tm.connect();
    expect(handler).toHaveBeenCalled();

    const lastCall = handler.mock.calls[handler.mock.calls.length - 1][0];
    expect(lastCall.status).toBe('connected');
    expect(lastCall.current).toBe('webrtc');
  });

  it('notifies message handlers', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const tm = new TransportManager({ backends: [webrtc] });

    const handler = vi.fn();
    tm.onMessage(handler);

    await tm.connect();
    const testData = new Uint8Array([1, 2, 3]);

    // Simulate incoming message from backend
    if (webrtc.onMessage) {
      webrtc.onMessage(testData);
    }

    expect(handler).toHaveBeenCalledWith(testData);
  });

  it('starts and stops probing', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const tm = new TransportManager({
      backends: [webrtc],
      autoProbeInterval: 1000,
    });

    tm.startProbing();
    // Should not throw
    tm.stopProbing();
  });

  it('reports correct backends list', async () => {
    const webrtc = createMockBackend('webrtc', { priority: 1 });
    const websocket = createMockBackend('websocket', { priority: 2 });

    const tm = new TransportManager({ backends: [webrtc, websocket] });
    const backends = tm.getBackends();

    expect(backends.length).toBe(2);
    expect(backends[0].id).toBe('webrtc');
    expect(backends[1].id).toBe('websocket');
  });
});
