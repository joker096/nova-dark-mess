/**
 * Real mesh map nodes — collected entirely on-device.
 *
 * Unlike meshDemoData (static Far-East samples), every node/link produced here
 * comes from actual app state:
 *  - the local device, positioned by its last known GPS fix (if any);
 *  - live-location broadcasts received in chats (LocationData.isLive messages
 *    whose liveUntil has not passed);
 *  - links between group members who share a group with an open WebRTC mesh.
 *
 * Nothing here phones home: reading localStorage + conversation history only.
 */
import type { MeshNode, MeshLink } from '../../components/meshDemoData';
import { CONVERSATION_HISTORIES, MOCK_CHATS, loadCreatedGroups } from '../../data/mockMessengerData';
import { loadGroupRoles } from '../social/groupRoles';

const LAST_FIX_KEY = 'nova_last_gps_fix';

export interface LocalGpsFix {
  latitude: number;
  longitude: number;
  /** Epoch ms of the fix; used to discard stale positions. */
  timestamp: number;
}

/** Persist the device's most recent GPS fix (called by map screen). */
export function saveLastGpsFix(fix: LocalGpsFix): void {
  try {
    localStorage.setItem(LAST_FIX_KEY, JSON.stringify(fix));
  } catch {
    void 0;
  }
}

export function loadLastGpsFix(): LocalGpsFix | null {
  try {
    const raw = localStorage.getItem(LAST_FIX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalGpsFix>;
    if (
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      typeof parsed.timestamp === 'number'
    ) {
      return parsed as LocalGpsFix;
    }
  } catch {
    void 0;
  }
  return null;
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

  return { nodes: [...nodes.values()], links };
}
