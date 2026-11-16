import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildLiveMeshSnapshot,
  loadLastGpsFix,
  saveLastGpsFix,
} from './meshMapNodes';
import { CONVERSATION_HISTORIES } from '../../data/mockMessengerData';

const NOW = 1_700_000_000_000;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // Restore the preloaded Kyiv location message that other suites may rely on.
  const katie = CONVERSATION_HISTORIES['katie'] ?? [];
  katie.length = 0;
});

describe('buildLiveMeshSnapshot', () => {
  it('produces no live nodes when the device has no GPS fix and no chats broadcast live location', () => {
    const snapshot = buildLiveMeshSnapshot({ now: NOW });
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.links).toEqual([]);
  });

  it('adds the local device node from a fresh GPS fix', () => {
    saveLastGpsFix({ latitude: 50.45, longitude: 30.52, timestamp: NOW - 1_000 });
    expect(loadLastGpsFix()?.latitude).toBeCloseTo(50.45);

    const snapshot = buildLiveMeshSnapshot({
      localFingerprint: 'nova_pk_me',
      now: NOW,
    });
    const selfNode = snapshot.nodes.find((node) => node.id === 'nova_pk_me');
    expect(selfNode).toBeDefined();
    expect(selfNode?.demo).toBe(false);
    expect(selfNode?.lat).toBeCloseTo(50.45);
    expect(selfNode?.status).toBe('online');
  });

  it('ignores a GPS fix older than 10 minutes', () => {
    saveLastGpsFix({ latitude: 50.45, longitude: 30.52, timestamp: NOW - 11 * 60_000 });
    const snapshot = buildLiveMeshSnapshot({
      localFingerprint: 'nova_pk_me',
      now: NOW,
    });
    expect(snapshot.nodes.find((node) => node.id === 'nova_pk_me')).toBeUndefined();
  });

  it('marks an expired live-location peer as offline but keeps it on the map', () => {
    const katie = CONVERSATION_HISTORIES['katie'];
    katie.push({
      id: 'test-live',
      senderId: 'other',
      time: 'now',
      location: {
        latitude: 50.1,
        longitude: 30.1,
        title: 'Peer broadcast',
        isLive: true,
        liveUntil: NOW - 60_000,
      },
    });

    const snapshot = buildLiveMeshSnapshot({ now: NOW });
    const peer = snapshot.nodes.find((node) => node.id === 'katie');
    expect(peer).toBeDefined();
    expect(peer?.status).toBe('offline');
    expect(peer?.demo).toBe(false);
  });

  it('creates direct links for a group with an active WebRTC room', () => {
    saveLastGpsFix({ latitude: 50.45, longitude: 30.52, timestamp: NOW });
    const snapshot = buildLiveMeshSnapshot({
      localFingerprint: 'nova_pk_me',
      activeRooms: { thailand: ['nova_pk_peer_a'] },
      now: NOW,
    });
    expect(snapshot.nodes.some((node) => node.id === 'nova_pk_peer_a')).toBe(true);
    const link = snapshot.links.find((l) => l.type === 'direct');
    expect(link?.from).toBe('nova_pk_me');
    expect(link?.to).toBe('nova_pk_peer_a');
    expect(link?.demo).toBe(false);
  });

  it('does not create links for chats without an active room', () => {
    const snapshot = buildLiveMeshSnapshot({
      localFingerprint: 'nova_pk_me',
      activeRooms: { thailand: [] },
      now: NOW,
    });
    expect(snapshot.links).toEqual([]);
  });
});
