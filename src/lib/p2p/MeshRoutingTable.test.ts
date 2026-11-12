/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeshRoutingTable, type MeshRoute } from './MeshRoutingTable';

vi.useFakeTimers();

describe('MeshRoutingTable', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds and retrieves a route', () => {
    const table = new MeshRoutingTable();

    const route: MeshRoute = {
      destination: 'node-b',
      nextHop: 'node-b',
      path: ['node-a', 'node-b'],
      hops: 1,
      latency: 50,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    };

    table.addRoute(route);
    const retrieved = table.getRoute('node-b');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.destination).toBe('node-b');
    expect(retrieved!.nextHop).toBe('node-b');
    expect(retrieved!.hops).toBe(1);
  });

  it('returns null for unknown destination', () => {
    const table = new MeshRoutingTable();
    expect(table.getRoute('unknown')).toBeNull();
  });

  it('prefers shorter path when adding duplicate route', () => {
    const table = new MeshRoutingTable();

    // Add longer path first
    table.addRoute({
      destination: 'node-c',
      nextHop: 'node-b',
      path: ['node-a', 'node-b', 'node-c'],
      hops: 2,
      latency: 100,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    // Add shorter path
    table.addRoute({
      destination: 'node-c',
      nextHop: 'node-c',
      path: ['node-a', 'node-c'],
      hops: 1,
      latency: 200,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    const route = table.getRoute('node-c');
    expect(route!.hops).toBe(1);
    expect(route!.nextHop).toBe('node-c');
  });

  it('prefers lower latency when hops are equal', () => {
    const table = new MeshRoutingTable();

    table.addRoute({
      destination: 'node-d',
      nextHop: 'node-x',
      path: ['node-a', 'node-x', 'node-d'],
      hops: 2,
      latency: 100,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    table.addRoute({
      destination: 'node-d',
      nextHop: 'node-y',
      path: ['node-a', 'node-y', 'node-d'],
      hops: 2,
      latency: 50,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    const route = table.getRoute('node-d');
    expect(route!.nextHop).toBe('node-y');
    expect(route!.latency).toBe(50);
  });

  it('marks route as stale', () => {
    const table = new MeshRoutingTable();

    table.addRoute({
      destination: 'node-e',
      nextHop: 'node-e',
      path: ['node-a', 'node-e'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    table.markStale('node-e');
    const route = table.getRoute('node-e');
    expect(route!.status).toBe('stale');
    expect(route!.reliability).toBe(0.9);
  });

  it('marks route as broken', () => {
    const table = new MeshRoutingTable();

    table.addRoute({
      destination: 'node-f',
      nextHop: 'node-f',
      path: ['node-a', 'node-f'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    table.markBroken('node-f');
    const route = table.getRoute('node-f');
    expect(route!.status).toBe('broken');
    expect(route!.reliability).toBe(0);
  });

  it('records success and updates latency', () => {
    const table = new MeshRoutingTable();

    table.addRoute({
      destination: 'node-g',
      nextHop: 'node-g',
      path: ['node-a', 'node-g'],
      hops: 1,
      latency: 100,
      reliability: 0.5,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    table.recordSuccess('node-g', 20);
    const route = table.getRoute('node-g');
    expect(route!.status).toBe('active');
    expect(route!.reliability).toBe(0.55);
    // EWMA: 100 * 0.7 + 20 * 0.3 = 76
    expect(route!.latency).toBeCloseTo(76, 0);
  });

  it('records failure and reduces reliability', () => {
    const table = new MeshRoutingTable();

    table.addRoute({
      destination: 'node-h',
      nextHop: 'node-h',
      path: ['node-a', 'node-h'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    table.recordFailure('node-h');
    const route = table.getRoute('node-h');
    expect(route!.reliability).toBe(0.8);
  });

  it('removes a route', () => {
    const table = new MeshRoutingTable();

    table.addRoute({
      destination: 'node-i',
      nextHop: 'node-i',
      path: ['node-a', 'node-i'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    expect(table.removeRoute('node-i')).toBe(true);
    expect(table.getRoute('node-i')).toBeNull();
    expect(table.removeRoute('node-i')).toBe(false);
  });

  it('returns correct size and activeSize', () => {
    const table = new MeshRoutingTable();

    expect(table.size).toBe(0);
    expect(table.activeSize).toBe(0);

    table.addRoute({
      destination: 'node-j',
      nextHop: 'node-j',
      path: ['node-a', 'node-j'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    table.addRoute({
      destination: 'node-k',
      nextHop: 'node-k',
      path: ['node-a', 'node-k'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 0,
      status: 'active',
    });

    expect(table.size).toBe(2);
    expect(table.activeSize).toBe(2);
  });

  it('gets best next hop and path', () => {
    const table = new MeshRoutingTable();

    table.addRoute({
      destination: 'node-l',
      nextHop: 'node-m',
      path: ['node-a', 'node-m', 'node-l'],
      hops: 2,
      latency: 50,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 300,
      status: 'active',
    });

    expect(table.getBestNextHop('node-l')).toBe('node-m');
    expect(table.getPath('node-l')).toEqual(['node-a', 'node-m', 'node-l']);
    expect(table.getBestNextHop('unknown')).toBeNull();
    expect(table.getPath('unknown')).toBeNull();
  });

  it('expires routes based on TTL', () => {
    const table = new MeshRoutingTable({ defaultTtl: 1 }); // 1 second TTL

    table.addRoute({
      destination: 'node-n',
      nextHop: 'node-n',
      path: ['node-a', 'node-n'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 1,
      status: 'active',
    });

    expect(table.getRoute('node-n')).not.toBeNull();

    // Advance time past TTL
    vi.setSystemTime(Date.now() + 2000);
    expect(table.getRoute('node-n')).toBeNull();
  });

  it('does not expire routes with ttl=0', () => {
    const table = new MeshRoutingTable();

    table.addRoute({
      destination: 'node-o',
      nextHop: 'node-o',
      path: ['node-a', 'node-o'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 0,
      status: 'active',
    });

    vi.setSystemTime(Date.now() + 10000);
    expect(table.getRoute('node-o')).not.toBeNull();
  });

  it('starts and stops expiry timer', () => {
    const table = new MeshRoutingTable();

    expect(table.size).toBe(0);
    table.startExpiryTimer(1000);
    table.stopExpiryTimer();
    expect(table.size).toBe(0);
  });

  it('uses default TTL when not specified', () => {
    const table = new MeshRoutingTable({ defaultTtl: 60 });

    table.addRoute({
      destination: 'node-p',
      nextHop: 'node-p',
      path: ['node-a', 'node-p'],
      hops: 1,
      latency: 30,
      reliability: 1.0,
      lastSeen: Date.now(),
      ttl: 60,
      status: 'active',
    });

    const route = table.getRoute('node-p');
    expect(route!.ttl).toBe(60);
  });
});
