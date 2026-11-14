/**
 * Store-and-forward delivery for group join requests and decisions.
 *
 * The invitee may close the group right after asking to join, and the admin may
 * approve while the requester's chat is closed, so a request cannot depend on
 * an open room channel. Both sides persist a small outbox on-device and the
 * mesh relay re-broadcasts it until a peer carries it; nothing is stored on a
 * server and the payloads stay encrypted group control messages.
 */

import type { GroupPayload } from '../p2p/groupManager';
import { MeshRelay, RELAY_BROADCAST } from '../p2p/relay';
import {
  getGroupMembership,
  setGroupMembership,
  setJoinRequestStatus,
  upsertJoinRequest,
} from './groupJoinRequests';

export const JOIN_OUTBOX_KEY = 'nova_group_join_outbox';
/** Fired on `window` whenever a relayed request/decision changed local state. */
export const JOIN_REQUESTS_CHANGED_EVENT = 'nova:join-requests-changed';

/** First retry delay; each further attempt doubles it up to the cap. */
export const JOIN_RETRY_BASE_MS = 5_000;
export const JOIN_RETRY_MAX_MS = 5 * 60_000;

/** Exponential backoff after `attempts` failures: 5 s, 10 s, 20 s … capped. */
export function joinRetryDelay(attempts: number): number {
  const step = Math.max(0, Math.min(attempts - 1, 8));
  return Math.min(JOIN_RETRY_MAX_MS, JOIN_RETRY_BASE_MS * 2 ** step);
}

export interface JoinRelayJob {
  id: string;
  groupId: string;
  kind: 'request' | 'response';
  /** For a request: the device asking to join. For a response: the target. */
  fingerprint: string;
  name?: string;
  approved?: boolean;
  createdAt: number;
  /** Delivery attempts so far; drives the backoff below. */
  attempts?: number;
  /** Timestamp before which the job is not retried. */
  nextAttemptAt?: number;
}

function readOutbox(): JoinRelayJob[] {
  try {
    const raw = localStorage.getItem(JOIN_OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is JoinRelayJob =>
        typeof entry?.id === 'string' &&
        typeof entry?.groupId === 'string' &&
        (entry?.kind === 'request' || entry?.kind === 'response') &&
        typeof entry?.fingerprint === 'string',
    );
  } catch {
    return [];
  }
}

function writeOutbox(jobs: JoinRelayJob[]): void {
  try {
    localStorage.setItem(JOIN_OUTBOX_KEY, JSON.stringify(jobs));
  } catch {
    /* storage unavailable: the job still goes out through the live relay */
  }
}

function makeId(): string {
  return `join-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadJoinOutbox(): JoinRelayJob[] {
  return readOutbox();
}

export function clearJoinOutbox(): void {
  writeOutbox([]);
}

function queueJob(job: Omit<JoinRelayJob, 'id' | 'createdAt'>): JoinRelayJob {
  const jobs = readOutbox();
  const existing = jobs.find(
    (entry) =>
      entry.groupId === job.groupId &&
      entry.kind === job.kind &&
      entry.fingerprint === job.fingerprint,
  );
  if (existing) return existing;
  const entry: JoinRelayJob = {
    ...job,
    id: makeId(),
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
  };
  writeOutbox([...jobs, entry]);
  return entry;
}

/** Queues a join request so it can be delivered while the group is closed. */
export function queueJoinRequestRelay(
  groupId: string,
  fingerprint: string,
  name?: string,
): JoinRelayJob | null {
  if (!groupId || !fingerprint) return null;
  return queueJob({ groupId, kind: 'request', fingerprint, ...(name ? { name } : {}) });
}

/** Queues an admin decision for a requester who may currently be offline. */
export function queueJoinResponseRelay(
  groupId: string,
  fingerprint: string,
  approved: boolean,
): JoinRelayJob | null {
  if (!groupId || !fingerprint) return null;
  return queueJob({ groupId, kind: 'response', fingerprint, approved });
}

/** Converts a group control payload into an outbox job, if it is one. */
export function enqueueJoinPayload(payload: GroupPayload): JoinRelayJob | null {
  if (payload.type === 'group_join_request') {
    return queueJoinRequestRelay(payload.groupId, payload.fingerprint, payload.name);
  }
  if (payload.type === 'group_join_response') {
    return queueJoinResponseRelay(payload.groupId, payload.fingerprint, payload.approved);
  }
  return null;
}

function jobToPayload(job: JoinRelayJob): GroupPayload {
  if (job.kind === 'request') {
    return {
      type: 'group_join_request',
      groupId: job.groupId,
      fingerprint: job.fingerprint,
      ...(job.name ? { name: job.name } : {}),
    };
  }
  return {
    type: 'group_join_response',
    groupId: job.groupId,
    fingerprint: job.fingerprint,
    approved: job.approved === true,
  };
}

export interface JoinFlushResult {
  sent: number;
  failed: number;
  /** Jobs still waiting out their backoff window. */
  deferred: number;
}

/**
 * Broadcasts every queued job whose backoff window has elapsed. A failed job
 * stays in the outbox with a doubled retry delay, so a peer-less device does not
 * hammer the relay on every tick.
 */
export function flushJoinOutbox(
  relay: Pick<MeshRelay, 'send'>,
  now = Date.now(),
): JoinFlushResult {
  const jobs = readOutbox();
  const remaining: JoinRelayJob[] = [];
  let sent = 0;
  let deferred = 0;

  for (const job of jobs) {
    if ((job.nextAttemptAt ?? 0) > now) {
      remaining.push(job);
      deferred++;
      continue;
    }

    if (relay.send(RELAY_BROADCAST, jobToPayload(job))) {
      sent++;
      continue;
    }

    const attempts = (job.attempts ?? 0) + 1;
    remaining.push({ ...job, attempts, nextAttemptAt: now + joinRetryDelay(attempts) });
  }

  writeOutbox(remaining);
  return { sent, failed: remaining.length - deferred, deferred };
}

/** Milliseconds until the earliest queued job is due, or null if none wait. */
export function nextJoinOutboxDelay(now = Date.now()): number | null {
  const jobs = readOutbox();
  if (jobs.length === 0) return null;
  return Math.min(...jobs.map((job) => Math.max(0, (job.nextAttemptAt ?? 0) - now)));
}

/** Clears backoff so the next flush retries every queued job immediately. */
export function resetJoinOutboxBackoff(): void {
  const jobs = readOutbox();
  if (jobs.length === 0) return;
  writeOutbox(jobs.map((job) => ({ ...job, attempts: 0, nextAttemptAt: 0 })));
}

export interface ApplyJoinPayloadOptions {
  localFingerprint: string;
  /** Only admins record incoming requests; everyone else ignores them. */
  isAdminOf?: (groupId: string) => boolean;
}

export type AppliedJoinPayload =
  | { kind: 'request'; groupId: string; fingerprint: string; name?: string }
  | { kind: 'response'; groupId: string; fingerprint: string; approved: boolean };

/**
 * Persists a relayed request or decision on-device. Returns what was applied so
 * the caller can surface a toast / refresh the chat list.
 */
export function applyJoinPayload(
  payload: GroupPayload,
  options: ApplyJoinPayloadOptions,
): AppliedJoinPayload | null {
  const { localFingerprint, isAdminOf } = options;

  if (payload.type === 'group_join_request') {
    const fingerprint = payload.fingerprint || '';
    if (!fingerprint || fingerprint === localFingerprint) return null;
    if (isAdminOf && !isAdminOf(payload.groupId)) return null;
    upsertJoinRequest(payload.groupId, {
      fingerprint,
      ...(payload.name ? { name: payload.name } : {}),
    });
    notifyChange(payload.groupId);
    return {
      kind: 'request',
      groupId: payload.groupId,
      fingerprint,
      ...(payload.name ? { name: payload.name } : {}),
    };
  }

  if (payload.type === 'group_join_response') {
    if (!payload.fingerprint || payload.fingerprint !== localFingerprint) return null;
    // Only a device that actually asked to join reacts to a decision.
    if (!getGroupMembership(payload.groupId)) return null;
    const membership = payload.approved ? 'member' : 'rejected';
    setGroupMembership(payload.groupId, membership);
    setJoinRequestStatus(payload.groupId, localFingerprint, payload.approved ? 'approved' : 'rejected');
    notifyChange(payload.groupId);
    return {
      kind: 'response',
      groupId: payload.groupId,
      fingerprint: payload.fingerprint,
      approved: payload.approved,
    };
  }

  return null;
}

function notifyChange(groupId: string): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(JOIN_REQUESTS_CHANGED_EVENT, { detail: { groupId } }));
}

/** Tells the chat list and badges that the local join bookkeeping changed. */
export function notifyJoinRequestsChanged(groupId: string): void {
  notifyChange(groupId);
}

/** The session relay, so Settings can show and retry unsent traffic. */
let activeJoinRelay: JoinRequestRelay | null = null;

export function getActiveJoinRelay(): JoinRequestRelay | null {
  return activeJoinRelay;
}

/** Clears backoff, flushes through the session relay, returns what stays queued. */
export function retryJoinOutboxNow(): number {
  resetJoinOutboxBackoff();
  activeJoinRelay?.flush();
  return loadJoinOutbox().length;
}

export interface JoinRequestRelayOptions {
  localFingerprint: string;
  relay?: MeshRelay;
  isAdminOf?: (groupId: string) => boolean;
  onApplied?: (applied: AppliedJoinPayload) => void;
}

/**
 * Keeps one mesh relay alive for the whole app session (not just while a group
 * is open) and applies join traffic that arrives while the chat is closed.
 */
export class JoinRequestRelay {
  private readonly relay: MeshRelay;
  private readonly localFingerprint: string;
  private readonly isAdminOf?: (groupId: string) => boolean;
  private readonly onApplied?: (applied: AppliedJoinPayload) => void;
  private started = false;

  constructor(options: JoinRequestRelayOptions) {
    this.localFingerprint = options.localFingerprint;
    this.relay = options.relay ?? new MeshRelay(options.localFingerprint);
    this.isAdminOf = options.isAdminOf;
    this.onApplied = options.onApplied;
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    activeJoinRelay = this;
    this.relay.onDeliver((envelope) => {
      const payload = envelope.payload as GroupPayload | undefined;
      if (!payload || typeof payload !== 'object') return;
      const applied = applyJoinPayload(payload, {
        localFingerprint: this.localFingerprint,
        isAdminOf: this.isAdminOf,
      });
      if (applied) this.onApplied?.(applied);
    });
    this.flush();
  }

  public flush(): JoinFlushResult {
    return flushJoinOutbox(this.relay);
  }

  /** Ignores the backoff windows and flushes everything due right now. */
  public retryNow(): JoinFlushResult {
    resetJoinOutboxBackoff();
    return this.flush();
  }

  public stop(): void {
    this.started = false;
    if (activeJoinRelay === this) activeJoinRelay = null;
    this.relay.close();
  }
}
