/**
 * Symmetric group session for anonymous fan-out groups.
 *
 * One shared AES-256-GCM key encrypts every message addressed to the group.
 * The sender writes a single sealed envelope into each member's own queue
 * (client fan-out), so the relay learns nothing about group membership or
 * size — only unrelated queue writes. Traffic cost grows linearly with the
 * member count, which is why fan-out groups are capped at roughly 50-100.
 *
 * On any membership change the key is rotated (version + 1) and redistributed
 * to the remaining members, so a removed member cannot decrypt future group
 * messages (forward secrecy within the limits of client-side key distribution).
 */

const GROUP_ALGORITHM = { name: 'AES-GCM', length: 256 };
const NONCE_BYTES = 12;
const GROUP_KEY_MESSAGE_TYPE = 'nova-anon-group-key';
const GROUP_ID_RE = /^g_[0-9a-f]{32}$/;

export interface GroupSession {
  /** Random group id, prefixed with `g_`. */
  id: string;
  /** Key version; incremented on every membership change. */
  version: number;
  /** JWK form of the shared AES-GCM key (exportable for storage/transit). */
  keyJwk: JsonWebKey;
  /** QueueIds of current members. */
  members: string[];
  createdAt: number;
  rotatedAt: number;
}

export interface GroupKeyDistribution {
  type: typeof GROUP_KEY_MESSAGE_TYPE;
  groupId: string;
  version: number;
  keyJwk: JsonWebKey;
}

export interface GroupMessageEnvelope {
  type: 'nova-anon-group';
  groupId: string;
  version: number;
  iv: string;
  ciphertext: string;
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (typeof value !== 'string') return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const buffer = new ArrayBuffer(binary.length);
    const out = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function generateGroupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(GROUP_ALGORITHM, true, ['encrypt', 'decrypt']);
}

export async function exportKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return (await crypto.subtle.exportKey('jwk', key)) as JsonWebKey;
}

export async function importKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, GROUP_ALGORITHM, true, ['encrypt', 'decrypt']);
}

export async function createGroupSession(memberQueueIds: string[]): Promise<GroupSession> {
  const key = await generateGroupKey();
  return {
    id: `g_${crypto.randomUUID().replace(/-/g, '')}`,
    version: 1,
    keyJwk: await exportKeyJwk(key),
    members: [...memberQueueIds],
    createdAt: Date.now(),
    rotatedAt: Date.now(),
  };
}

/**
 * Rotate the group key after a membership change. Only the remaining members
 * should receive the new key; a removed member never gets it and can no
 * longer decrypt messages sealed under the new version.
 */
export async function rotateGroupSession(
  session: GroupSession,
  remainingMemberQueueIds: string[],
): Promise<GroupSession> {
  const key = await generateGroupKey();
  return {
    ...session,
    version: session.version + 1,
    keyJwk: await exportKeyJwk(key),
    members: [...remainingMemberQueueIds],
    rotatedAt: Date.now(),
  };
}

/** Seal a plaintext under the shared group key. All members can open it. */
export async function sealGroupMessage(
  session: GroupSession,
  plaintext: string,
): Promise<GroupMessageEnvelope> {
  const key = await importKeyJwk(session.keyJwk);
  const iv = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    type: 'nova-anon-group',
    groupId: session.id,
    version: session.version,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
}

/** Open a group message envelope under the shared group key. */
export async function openGroupMessage(
  session: GroupSession,
  envelope: GroupMessageEnvelope,
): Promise<string | null> {
  if (envelope.groupId !== session.id) return null;
  const key = await importKeyJwk(session.keyJwk);
  const iv = fromBase64Url(envelope.iv);
  const ciphertext = fromBase64Url(envelope.ciphertext);
  if (!iv || !ciphertext) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
      key,
      ciphertext as unknown as ArrayBuffer,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/**
 * Encode the group session key into the body of a personal message that is
 * sent to one member through `sendAnonMessage` (sealed under that member's
 * personal key). Only the intended member can recover the group key.
 */
export function encodeGroupKeyDistribution(session: GroupSession): string {
  const distribution: GroupKeyDistribution = {
    type: GROUP_KEY_MESSAGE_TYPE,
    groupId: session.id,
    version: session.version,
    keyJwk: session.keyJwk,
  };
  return JSON.stringify(distribution);
}

export function decodeGroupKeyDistribution(body: string): GroupKeyDistribution | null {
  try {
    const parsed = JSON.parse(body) as Partial<GroupKeyDistribution>;
    if (
      parsed.type !== GROUP_KEY_MESSAGE_TYPE ||
      typeof parsed.groupId !== 'string' ||
      !GROUP_ID_RE.test(parsed.groupId) ||
      typeof parsed.version !== 'number' ||
      !Number.isInteger(parsed.version) ||
      parsed.version < 1 ||
      !isValidGroupKeyJwk(parsed.keyJwk)
    ) {
      return null;
    }
    return parsed as GroupKeyDistribution;
  } catch {
    return null;
  }
}

function isValidGroupKeyJwk(value: unknown): value is JsonWebKey {
  if (!value || typeof value !== 'object') return false;
  const jwk = value as Record<string, unknown>;
  if (jwk.kty !== 'oct' || typeof jwk.k !== 'string') return false;
  return fromBase64Url(jwk.k)?.length === 32;
}

export type GroupInboundPayload =
  | { kind: 'key'; distribution: GroupKeyDistribution }
  | { kind: 'message'; envelope: GroupMessageEnvelope };

/**
 * Classify a plaintext received from a queue as a group key distribution or a
 * group message envelope. Returns null for ordinary 1:1 text.
 */
export function parseGroupPayload(body: string): GroupInboundPayload | null {
  if (!body.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed.type === GROUP_KEY_MESSAGE_TYPE) {
      const distribution = decodeGroupKeyDistribution(body);
      return distribution ? { kind: 'key', distribution } : null;
    }
    if (
      parsed.type === 'nova-anon-group' &&
      typeof parsed.groupId === 'string' &&
      GROUP_ID_RE.test(parsed.groupId) &&
      typeof parsed.version === 'number' &&
      Number.isInteger(parsed.version) &&
      parsed.version >= 1 &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ciphertext === 'string'
    ) {
      return { kind: 'message', envelope: parsed as unknown as GroupMessageEnvelope };
    }
  } catch {
    return null;
  }
  return null;
}

/** Build a receiver-side session from a distributed key (members unknown). */
export function sessionFromGroupKeyDistribution(
  distribution: GroupKeyDistribution,
): GroupSession | null {
  if (
    !GROUP_ID_RE.test(distribution.groupId) ||
    !Number.isInteger(distribution.version) ||
    distribution.version < 1 ||
    !isValidGroupKeyJwk(distribution.keyJwk)
  ) {
    return null;
  }
  const now = Date.now();
  return {
    id: distribution.groupId,
    version: distribution.version,
    keyJwk: distribution.keyJwk,
    members: [],
    createdAt: now,
    rotatedAt: now,
  };
}

/**
 * Adopt a distributed key if it is the first one or strictly newer than the
 * current version. Older keys are ignored (the current session is returned, so
 * a replayed distribution cannot roll the key back); equal versions are
 * idempotent; foreign-group keys are rejected.
 */
export function adoptGroupKey(
  current: GroupSession | null,
  distribution: GroupKeyDistribution,
): GroupSession | null {
  if (current && current.id !== distribution.groupId) return null;
  if (current && distribution.version < current.version) return current;
  if (current && distribution.version === current.version) return current;
  return sessionFromGroupKeyDistribution(distribution);
}
