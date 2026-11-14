/**
 * Group join requests, stored on-device per group.
 *
 * An invite link is not membership: the invited device asks to join, and an
 * admin approves or declines. There is no server, so both sides keep the same
 * little ledger (requester fingerprints, display names, decision) and exchange
 * the request/decision over the group transport. Until an admin approves, the
 * invited device is not an admin and cannot edit the roster.
 */

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export type GroupMembership = 'pending' | 'member' | 'rejected';

export interface GroupJoinRequest {
  fingerprint: string;
  name?: string;
  status: JoinRequestStatus;
  createdAt: number;
}

const REQUESTS_KEY_PREFIX = 'nova_group_join_requests_';
const MEMBERSHIP_KEY_PREFIX = 'nova_group_membership_';

function requestsKey(chatId: string): string {
  return `${REQUESTS_KEY_PREFIX}${chatId}`;
}

function membershipKey(chatId: string): string {
  return `${MEMBERSHIP_KEY_PREFIX}${chatId}`;
}

function sanitize(value: unknown): GroupJoinRequest[] {
  if (!Array.isArray(value)) return [];
  const requests: GroupJoinRequest[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { fingerprint, name, status, createdAt } = entry as Record<string, unknown>;
    if (typeof fingerprint !== 'string' || !fingerprint) continue;
    if (status !== 'pending' && status !== 'approved' && status !== 'rejected') continue;
    requests.push({
      fingerprint,
      ...(typeof name === 'string' && name ? { name } : {}),
      status,
      createdAt: typeof createdAt === 'number' ? createdAt : 0,
    });
  }
  return requests;
}

export function loadJoinRequests(chatId: string): GroupJoinRequest[] {
  try {
    const raw = localStorage.getItem(requestsKey(chatId));
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveJoinRequests(chatId: string, requests: GroupJoinRequest[]): void {
  try {
    localStorage.setItem(requestsKey(chatId), JSON.stringify(requests));
  } catch {
    /* storage unavailable: requests stay in memory for this session */
  }
}

/**
 * Records an incoming request. A fingerprint keeps its first `createdAt`, and
 * re-asking after a decline flips the record back to pending.
 */
export function upsertJoinRequest(
  chatId: string,
  request: { fingerprint: string; name?: string; status?: JoinRequestStatus },
): GroupJoinRequest[] {
  if (!request.fingerprint) return loadJoinRequests(chatId);
  const requests = loadJoinRequests(chatId);
  const existing = requests.find((entry) => entry.fingerprint === request.fingerprint);
  const next: GroupJoinRequest = {
    fingerprint: request.fingerprint,
    ...(request.name ?? existing?.name ? { name: request.name ?? existing?.name } : {}),
    status: request.status ?? 'pending',
    createdAt: existing?.createdAt ?? Date.now(),
  };
  const merged = existing
    ? requests.map((entry) => (entry.fingerprint === request.fingerprint ? next : entry))
    : [...requests, next];
  saveJoinRequests(chatId, merged);
  return merged;
}

export function setJoinRequestStatus(
  chatId: string,
  fingerprint: string,
  status: JoinRequestStatus,
): GroupJoinRequest[] {
  const requests = loadJoinRequests(chatId);
  if (!requests.some((entry) => entry.fingerprint === fingerprint)) return requests;
  const next = requests.map((entry) =>
    entry.fingerprint === fingerprint ? { ...entry, status } : entry,
  );
  saveJoinRequests(chatId, next);
  return next;
}

export function getPendingJoinRequests(chatId: string): GroupJoinRequest[] {
  return loadJoinRequests(chatId).filter((entry) => entry.status === 'pending');
}

export function getGroupMembership(chatId: string): GroupMembership | null {
  try {
    const value = localStorage.getItem(membershipKey(chatId));
    return value === 'pending' || value === 'member' || value === 'rejected' ? value : null;
  } catch {
    return null;
  }
}

export function setGroupMembership(chatId: string, membership: GroupMembership): void {
  try {
    localStorage.setItem(membershipKey(chatId), membership);
  } catch {
    /* storage unavailable: membership stays in memory for this session */
  }
}

/** Called when an invite link is accepted, before the group screen opens. */
export function markJoinPending(chatId: string): void {
  setGroupMembership(chatId, 'pending');
}
