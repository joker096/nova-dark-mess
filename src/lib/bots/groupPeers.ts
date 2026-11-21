/**
 * Per-group roster of bot members whose mesh fingerprint we know (Phase B4).
 *
 * A gateway bot is a normal P2P participant but usually not in the WebRTC
 * room, so group frames addressed to it must go over the encrypted 1:1
 * session. The roster is deliberately explicit: only fingerprints of
 * installed gateway bots are stored, never every group member.
 */
import type { InstalledBot } from './runtime';

export const BOT_GROUP_PEERS_KEY = 'nova_bot_group_peers';

type RosterStore = Record<string, unknown>;

function readStore(): RosterStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOT_GROUP_PEERS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as RosterStore)
      : {};
  } catch {
    return {};
  }
}

function writeStore(store: RosterStore): void {
  try {
    localStorage.setItem(BOT_GROUP_PEERS_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable: the in-memory roster still works this session */
  }
}

export function loadBotGroupPeers(chatId: string): string[] {
  const peers = readStore()[chatId];
  return Array.isArray(peers)
    ? peers.filter((peer): peer is string => typeof peer === 'string')
    : [];
}

function persist(chatId: string, peers: string[]): string[] {
  const unique = [...new Set(peers)];
  const store = readStore();
  if (unique.length === 0) delete store[chatId];
  else store[chatId] = unique;
  writeStore(store);
  return unique;
}

/** Fingerprints of installed bots that have a known mesh identity. */
export function botPeerFingerprints(bots: readonly InstalledBot[]): Set<string> {
  return new Set(
    bots
      .map((bot) => bot.peerFingerprint?.trim())
      .filter((fingerprint): fingerprint is string => Boolean(fingerprint)),
  );
}

/**
 * Add a group member to the bot roster when it is an installed gateway bot.
 * Ordinary members are ignored, so group traffic keeps using the room/outbox.
 */
export function registerBotGroupPeer(
  chatId: string,
  member: string,
  bots: readonly InstalledBot[],
): string[] {
  const peers = loadBotGroupPeers(chatId);
  if (!botPeerFingerprints(bots).has(member)) return peers;
  return persist(chatId, [...peers, member]);
}

export function unregisterBotGroupPeer(chatId: string, member: string): string[] {
  return persist(chatId, loadBotGroupPeers(chatId).filter((peer) => peer !== member));
}

/**
 * Reconcile the roster with the current member list and installed bots.
 * Drops uninstalled bots and members who left; never promotes a human.
 */
export function syncBotGroupPeers(
  chatId: string,
  members: readonly string[],
  bots: readonly InstalledBot[],
): string[] {
  const known = botPeerFingerprints(bots);
  const current = new Set(members);
  return persist(
    chatId,
    loadBotGroupPeers(chatId).filter((peer) => current.has(peer) && known.has(peer)),
  );
}
