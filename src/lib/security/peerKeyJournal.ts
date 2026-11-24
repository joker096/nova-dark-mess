import { sha256Hex } from '../crypto/aes';
import { dbInstance } from '../storage/db';

const JOURNAL_KEY = 'nova_peer_key_journal_v1';
const MAX_CHANGES = 1000;

export interface PeerKeyMaterial {
  fingerprint: string;
  signingKey: string;
  identityKey: string;
}

interface StoredPeerKey extends PeerKeyMaterial {
  signingKeyId: string;
  identityKeyId: string;
}

export interface PeerKeyChange {
  id: string;
  chatId: string;
  previousFingerprint: string;
  currentFingerprint: string;
  previousSigningKeyId: string;
  currentSigningKeyId: string;
  previousIdentityKeyId: string;
  currentIdentityKeyId: string;
  changedAt: number;
}

interface PeerKeyJournal {
  version: 1;
  peers: Record<string, StoredPeerKey>;
  changes: PeerKeyChange[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredPeerKey(value: unknown): value is StoredPeerKey {
  return (
    isRecord(value) &&
    typeof value.fingerprint === 'string' &&
    typeof value.signingKey === 'string' &&
    typeof value.identityKey === 'string' &&
    typeof value.signingKeyId === 'string' &&
    typeof value.identityKeyId === 'string'
  );
}

function isPeerKeyChange(value: unknown): value is PeerKeyChange {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.chatId === 'string' &&
    typeof value.previousFingerprint === 'string' &&
    typeof value.currentFingerprint === 'string' &&
    typeof value.previousSigningKeyId === 'string' &&
    typeof value.currentSigningKeyId === 'string' &&
    typeof value.previousIdentityKeyId === 'string' &&
    typeof value.currentIdentityKeyId === 'string' &&
    typeof value.changedAt === 'number' &&
    Number.isFinite(value.changedAt)
  );
}

async function readJournal(): Promise<PeerKeyJournal> {
  if (!dbInstance.isReady()) {
    return { version: 1, peers: Object.create(null), changes: [] };
  }
  try {
    const raw = await dbInstance.loadSetting<string>(JOURNAL_KEY);
    if (!raw) return { version: 1, peers: Object.create(null), changes: [] };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Stored peer key history is corrupted; refusing to overwrite it.');
    }

    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isRecord(parsed.peers) ||
      !Array.isArray(parsed.changes)
    ) {
      throw new Error('Stored peer key history has an unsupported format.');
    }

    const peers: Record<string, StoredPeerKey> = Object.create(null);
    for (const [chatId, peer] of Object.entries(parsed.peers)) {
      if (!isStoredPeerKey(peer)) {
        throw new Error(`Stored peer key history contains an invalid entry for "${chatId}".`);
      }
      peers[chatId] = peer;
    }

    if (!parsed.changes.every(isPeerKeyChange)) {
      throw new Error('Stored peer key history contains an invalid change record.');
    }

    return { version: 1, peers, changes: parsed.changes };
  } catch {
    return { version: 1, peers: Object.create(null), changes: [] };
  }
}

async function writeJournal(journal: PeerKeyJournal): Promise<void> {
  if (!dbInstance.isReady()) return;
  // Prune old changes to prevent unbounded growth
  if (journal.changes.length > MAX_CHANGES) {
    journal.changes = journal.changes.slice(-MAX_CHANGES);
  }
  await dbInstance.saveSetting(JOURNAL_KEY, JSON.stringify(journal));
}

export async function observePeerKey(
  chatId: string,
  material: PeerKeyMaterial,
  changedAt = Date.now(),
): Promise<PeerKeyChange | null> {
  if (!chatId || !material.fingerprint || !material.signingKey || !material.identityKey) {
    throw new Error('Peer key journal requires a chat ID and complete identity keys.');
  }

  const journal = await readJournal();
  const previous = Object.prototype.hasOwnProperty.call(journal.peers, chatId)
    ? journal.peers[chatId]
    : undefined;
  if (
    previous &&
    previous.signingKey === material.signingKey &&
    previous.identityKey === material.identityKey
  ) {
    return null;
  }

  const [signingKeyId, identityKeyId] = await Promise.all([
    sha256Hex(material.signingKey),
    sha256Hex(material.identityKey),
  ]);
  // Use full 64-char hex (256-bit) instead of truncated 16-char for collision resistance
  const current: StoredPeerKey = {
    ...material,
    signingKeyId: signingKeyId,
    identityKeyId: identityKeyId,
  };

  if (!previous) {
    journal.peers[chatId] = current;
    await writeJournal(journal);
    return null;
  }

  const change: PeerKeyChange = {
    id: `peer-key-change-${changedAt}-${crypto.randomUUID()}`,
    chatId,
    previousFingerprint: previous.fingerprint,
    currentFingerprint: current.fingerprint,
    previousSigningKeyId: previous.signingKeyId,
    currentSigningKeyId: current.signingKeyId,
    previousIdentityKeyId: previous.identityKeyId,
    currentIdentityKeyId: current.identityKeyId,
    changedAt,
  };

  journal.peers[chatId] = current;
  journal.changes.push(change);
  await writeJournal(journal);
  return change;
}

export async function getPeerKeyChanges(chatId: string): Promise<PeerKeyChange[]> {
  const journal = await readJournal();
  return journal.changes.filter((change) => change.chatId === chatId);
}