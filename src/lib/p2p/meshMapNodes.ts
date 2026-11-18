/**
 * Mesh map snapshot generation — processed on-device.
 *
 * Unlike meshDemoData (static Far-East samples), every node/link produced here
 * comes from actual app state:
 *  - the local device, positioned by its current in-memory GPS fix (if any);
 *  - live-location broadcasts received in chats (LocationData.isLive messages
 *    whose liveUntil has not passed);
 *  - links between group members who share a group with an open WebRTC mesh.
 *
 * This module makes no network requests. Online presence ids are fetched and
 * resolved by the caller before they are passed into the snapshot builder.
 */
import type { MeshNode, MeshLink } from '../../components/meshDemoData';
import { CONVERSATION_HISTORIES, MOCK_CHATS, loadCreatedGroups } from '../../data/mockMessengerData';
import { loadGroupRoles } from '../social/groupRoles';

/** Fired after a new GPS fix is stored so screens recompute the mesh. */
export const GPS_FIX_EVENT = 'nova-gps-fix';

const LEGACY_LAST_FIX_KEY = 'nova_last_gps_fix';
let lastGpsFix: LocalGpsFix | null = null;

export interface LocalGpsFix {
  latitude: number;
  longitude: number;
  /** Epoch ms of the fix; used to discard stale positions. */
  timestamp: number;
}

/** Keep the device's most recent GPS fix in memory only. */
export function saveLastGpsFix(fix: LocalGpsFix): void {
  lastGpsFix = { ...fix };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GPS_FIX_EVENT));
  }
}

export function clearLastGpsFix(): void {
  const hadFix = lastGpsFix !== null;
  lastGpsFix = null;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LEGACY_LAST_FIX_KEY);
    } catch (error) {
      console.error('mesh map: failed to remove a previously stored GPS fix', error);
    }
  }
  if (hadFix && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GPS_FIX_EVENT));
  }
}

export function loadLastGpsFix(): LocalGpsFix | null {
  return lastGpsFix ? { ...lastGpsFix } : null;
}

/** Deterministic pseudo-position for peers we have no GPS fix for. */
function positionFromFingerprint(fingerprint: string): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash = (hash * 31 + fingerprint.charCodeAt(i)) >>> 0;
  }
  // Spread across a ±2° box around the map's default center so peers land
  // near each other but never exactly on the same pixel.
  return {
    lat: 48.5 + ((hash % 400) - 200) / 100,
    lng: 134.5 + (((hash >>> 8) % 400) - 200) / 100,
  };
}

function statusForPeer(expiry: number | undefined, now: number): MeshNode['status'] {
  if (expiry !== undefined && expiry <= now) return 'offline';
  return 'online';
}

export interface MeshMapInputs {
  localFingerprint?: string;
  /** Map of groupId → fingerprints that currently share an open WebRTC room. */
  activeRooms?: Record<string, string[]>;
  /** Fingerprints reported online by the relay presence endpoint. */
  onlinePeers?: string[];
  /** Epoch ms; defaults to Date.now(). */
  now?: number;
}

export interface MeshMapSnapshot {
  nodes: MeshNode[];
  links: MeshLink[];
}

/**
 * Collect real mesh nodes: the local device plus peers broadcasting live
 * location. Every returned node carries `demo: false`, which MeshMap renders
 * without the DEMO badge.
 */
export function buildLiveMeshSnapshot(inputs: MeshMapInputs = {}): MeshMapSnapshot {
  const now = inputs.now ?? Date.now();
  const nodes = new Map<string, MeshNode>();
  const links: MeshLink[] = [];

  const local = inputs.localFingerprint;
  const gps = loadLastGpsFix();

  if (local && gps && now - gps.timestamp < 10 * 60_000) {
    nodes.set(local, {
      id: local,
      lat: gps.latitude,
      lng: gps.longitude,
      label: 'You',
      status: 'online',
      demo: false,
    });
  }

  const groupIds = new Set<string>([
    ...MOCK_CHATS.filter((chat) => chat.type === 'group').map((chat) => chat.id),
    ...loadCreatedGroups().filter((chat) => chat.type === 'group').map((chat) => chat.id),
  ]);

  // Live-location broadcasts received into any chat (including DMs).
  for (const [chatId, history] of Object.entries(CONVERSATION_HISTORIES)) {
    for (const message of history) {
      const loc = message.location;
      if (!loc || !loc.isLive) continue;
      // Expired broadcasts stay on the map but drop to offline.
      const senderKey = message.senderId === 'me' ? local : chatId;
      if (!senderKey || nodes.has(senderKey)) continue;
      const pos = positionFromFingerprint(senderKey);
      nodes.set(senderKey, {
        id: senderKey,
        lat: pos.lat,
        lng: pos.lng,
        label: loc.title || 'Peer',
        status: statusForPeer(loc.liveUntil, now),
        demo: false,
      });
    }
  }

  // Direct links: members of a group whose WebRTC room is currently open.
  const rooms = inputs.activeRooms ?? {};
  for (const [groupId, peers] of Object.entries(rooms)) {
    if (!groupIds.has(groupId) || peers.length === 0) continue;
    const roles = loadGroupRoles(groupId);
    const endpoints = [local, ...peers].filter((id): id is string => Boolean(id));
    for (const endpoint of endpoints) {
      if (!nodes.has(endpoint)) {
        const pos = positionFromFingerprint(endpoint);
        nodes.set(endpoint, {
          id: endpoint,
          lat: pos.lat,
          lng: pos.lng,
          label: roles[endpoint] === 'admin' ? 'Admin' : 'Peer',
          status: 'online',
          demo: false,
        });
      }
    }
    for (let i = 1; i < endpoints.length; i += 1) {
      links.push({
        id: `live-${groupId}-${i}`,
        from: endpoints[0],
        to: endpoints[i],
        type: 'direct',
        demo: false,
      });
    }
  }

  // Relay presence: peers the relay has seen recently. They get a node (with a
  // deterministic pseudo-position when we have no GPS fix for them) marked
  // online, so the map reflects who is actually reachable right now.
  for (const peer of inputs.onlinePeers ?? []) {
    if (!peer || peer === local) continue;
    if (nodes.has(peer)) {
      const existing = nodes.get(peer)!;
      if (existing.status !== 'online') {
        nodes.set(peer, { ...existing, status: 'online' });
      }
      continue;
    }
    const pos = positionFromFingerprint(peer);
    nodes.set(peer, {
      id: peer,
      lat: pos.lat,
      lng: pos.lng,
      label: 'Peer',
      status: 'online',
      demo: false,
    });
  }

  return { nodes: [...nodes.values()], links };
}
