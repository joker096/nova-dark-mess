import { describe, it, expect } from 'vitest';
import { BridgeClient } from './bridge-client';
import { transportFromBridge, transportRequiresNative, DEFAULT_BRIDGES } from './transports';
import type { BridgeConfig } from './transports';

const TEST_BRIDGES: BridgeConfig[] = [
  { address: 'bridge-a.example.com:443', transport: 'webtunnel', priority: 1 },
  { address: 'bridge-b.example.com:443', transport: 'reality', priority: 2 },
  { address: 'bridge-c.example.com:9050', transport: 'tor', priority: 3 },
];

describe('BridgeClient', () => {
  it('returns bridges in priority order', () => {
    const client = new BridgeClient(TEST_BRIDGES);
    const first = client.nextBridge();
    expect(first?.address).toBe('bridge-a.example.com:443');
    expect(first?.transport).toBe('webtunnel');
  });

  it('skips bridges in cooldown', () => {
    const client = new BridgeClient(TEST_BRIDGES, 1000); // 1 second cooldown
    client.reportFailure('bridge-a.example.com:443');
    const next = client.nextBridge();
    expect(next?.address).toBe('bridge-b.example.com:443');
  });

  it('returns null when all bridges are in cooldown', () => {
    const client = new BridgeClient(TEST_BRIDGES, 1000);
    for (const b of TEST_BRIDGES) client.reportFailure(b.address);
    expect(client.nextBridge()).toBeNull();
  });

  it('reportSuccess resets failure count and cooldown', () => {
    const client = new BridgeClient(TEST_BRIDGES, 10000);
    client.reportFailure('bridge-a.example.com:443');
    expect(client.nextBridge()?.address).not.toBe('bridge-a.example.com:443');
    client.reportSuccess('bridge-a.example.com:443');
    expect(client.nextBridge()?.address).toBe('bridge-a.example.com:443');
  });

  it('getBridgeHealth returns all bridges', () => {
    const client = new BridgeClient(TEST_BRIDGES);
    const health = client.getBridgeHealth();
    expect(health).toHaveLength(3);
    expect(health.map((h) => h.address).sort()).toEqual(
      TEST_BRIDGES.map((b) => b.address).sort(),
    );
  });

  it('addBridge and removeBridge work', () => {
    const client = new BridgeClient([TEST_BRIDGES[0]]);
    expect(client.getBridgeHealth()).toHaveLength(1);
    client.addBridge(TEST_BRIDGES[1]);
    expect(client.getBridgeHealth()).toHaveLength(2);
    client.removeBridge(TEST_BRIDGES[0].address);
    expect(client.getBridgeHealth()).toHaveLength(1);
    expect(client.getBridgeHealth()[0].address).toBe(TEST_BRIDGES[1].address);
  });

  it('duplicate bridges are not added', () => {
    const client = new BridgeClient([TEST_BRIDGES[0]]);
    client.addBridge(TEST_BRIDGES[0]);
    expect(client.getBridgeHealth()).toHaveLength(1);
  });

  it('transportFromBridge maps types correctly', () => {
    const cfg = transportFromBridge(TEST_BRIDGES[2]);
    expect(cfg.type).toBe('tor');
    expect(cfg.requiresNativeProxy).toBe(true);
    expect(cfg.label).toBe('Tor (.onion)');
  });

  it('transportRequiresNative identifies tor', () => {
    expect(transportRequiresNative('tor')).toBe(true);
    expect(transportRequiresNative('direct')).toBe(false);
    expect(transportRequiresNative('webtunnel')).toBe(false);
    expect(transportRequiresNative('reality')).toBe(false);
  });

  it('DEFAULT_BRIDGES has all three transport types', () => {
    const types = [...new Set(DEFAULT_BRIDGES.map((b) => b.transport))];
    expect(types).toContain('webtunnel');
    expect(types).toContain('reality');
    expect(types).toContain('tor');
  });
});
