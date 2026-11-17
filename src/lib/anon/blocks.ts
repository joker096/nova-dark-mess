/**
 * Local block lists for the anonymous stack.
 *
 * Blocking happens on the recipient's device, never on the relay: the relay
 * cannot link identities, so it has nothing meaningful to block. A sender is
 * identified by the Ed25519 queue signing public key carried (out-of-band,
 * verified per command) in the invite, and by the invite token of their queue.
 * Neither value is a global identity — a blocked sender can create a fresh
 * queue, but they need a new invite chain to reach this recipient again, and
 * repeated blocks feed the abuse report (see `reportAbuse`).
 */

export interface BlockedSender {
  /** Ed25519 public key the sender's relay commands are signed with. */
  signingPublicKey: string;
  /** Where the invite came from, free-form, never sent anywhere. */
  note?: string;
  blockedAt: number;
}

const STORAGE_KEY = 'nova_anon_block_list_v1';
const REPORTS_KEY = 'nova_anon_abuse_reports_v1';
const MAX_ENTRIES = 1000;
const MAX_REPORTS = 200;
let sessionBlockList: BlockedSender[] | null = null;
let sessionAbuseReports: AbuseReport[] | null = null;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function isSigningPublicKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

export function loadBlockList(): BlockedSender[] {
  if (sessionBlockList !== null) return [...sessionBlockList];
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (entry): entry is BlockedSender =>
        entry &&
        typeof entry === 'object' &&
        isSigningPublicKey(entry.signingPublicKey) &&
        Number.isFinite(entry.blockedAt),
    );
  } catch {
    return [];
  }
}

function saveBlockList(entries: BlockedSender[]): void {
  sessionBlockList = entries.slice(0, MAX_ENTRIES);
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sessionBlockList));
    sessionBlockList = null;
  } catch {
    // Storage full or unavailable: blocking stays in-memory for this session.
  }
}

export function isBlocked(signingPublicKey: string): boolean {
  if (!isSigningPublicKey(signingPublicKey)) return false;
  return loadBlockList().some((entry) => entry.signingPublicKey === signingPublicKey);
}

export function blockSender(signingPublicKey: string, note?: string): boolean {
  if (!isSigningPublicKey(signingPublicKey)) return false;
  const entries = loadBlockList();
  if (entries.some((entry) => entry.signingPublicKey === signingPublicKey)) return true;
  entries.unshift({ signingPublicKey, ...(note ? { note } : {}), blockedAt: Date.now() });
  saveBlockList(entries);
  return true;
}

export function unblockSender(signingPublicKey: string): boolean {
  if (!isSigningPublicKey(signingPublicKey)) return false;
  const entries = loadBlockList();
  const next = entries.filter((entry) => entry.signingPublicKey !== signingPublicKey);
  if (next.length === entries.length) return false;
  saveBlockList(next);
  return true;
}

export function clearBlockList(): void {
  sessionBlockList = [];
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
    sessionBlockList = null;
  } catch {
    // The in-memory list is still cleared when browser storage is unavailable.
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Abuse reporting that cannot deanonymize.
//
// A report contains ONLY hashes of the abusive queue id and signing public
// key — never the invite, tokens, relay URL, or timing. Relays that choose to
// consume reports can rate-limit queue creation from reported signing keys
// without learning who reported whom. Reports stay local unless the user
// explicitly uploads them to their own relay operator.
// ───────────────────────────────────────────────────────────────────────────

export interface AbuseReport {
  v: 1;
  /** Random id used only to make retries idempotent. */
  reportId?: string;
  /** SHA-256 hex of the reported queue id (relay can match it exactly). */
  queueIdHash: string;
  /** SHA-256 hex of the sender's signing public key. */
  signingKeyHash: string;
  /** Coarse category, no free text (free text could carry identifying data). */
  category: 'spam' | 'harassment' | 'illegal';
  reportedAt: number;
  uploadedAt?: number;
}

export type AbuseCategory = AbuseReport['category'];

export interface AbuseReportSubmission {
  v: 1;
  reportId: string;
  queueIdHash: string;
  signingKeyHash: string;
  category: AbuseCategory;
}

export function isAbuseCategory(value: unknown): value is AbuseCategory {
  return value === 'spam' || value === 'harassment' || value === 'illegal';
}

function randomReportId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildAbuseReport(params: {
  queueId: string;
  signingPublicKey: string;
  category: AbuseCategory;
}): Promise<AbuseReport | null> {
  const { queueId, signingPublicKey, category } = params;
  if (!/^q_[0-9a-f]{32}$/.test(queueId) || !isSigningPublicKey(signingPublicKey)) return null;
  if (!isAbuseCategory(category)) return null;
  return {
    v: 1,
    reportId: randomReportId(),
    queueIdHash: await sha256Hex(queueId),
    signingKeyHash: await sha256Hex(signingPublicKey),
    category,
    reportedAt: Date.now(),
  };
}

export function loadAbuseReports(): AbuseReport[] {
  if (sessionAbuseReports !== null) return [...sessionAbuseReports];
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(REPORTS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (entry): entry is AbuseReport =>
        entry &&
        typeof entry === 'object' &&
        entry.v === 1 &&
        (entry.reportId === undefined || /^[0-9a-f]{32}$/.test(entry.reportId)) &&
        typeof entry.queueIdHash === 'string' &&
        typeof entry.signingKeyHash === 'string' &&
        isAbuseCategory(entry.category) &&
        Number.isFinite(entry.reportedAt) &&
        (entry.uploadedAt === undefined || Number.isFinite(entry.uploadedAt)),
    );
  } catch {
    return [];
  }
}

function saveAbuseReports(reports: AbuseReport[]): void {
  sessionAbuseReports = reports.slice(0, MAX_REPORTS);
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(REPORTS_KEY, JSON.stringify(sessionAbuseReports));
    sessionAbuseReports = null;
  } catch {
    // Same trade-off as the block list: local-only this session.
  }
}

export async function recordAbuseReport(params: {
  queueId: string;
  signingPublicKey: string;
  category: AbuseCategory;
}): Promise<AbuseReport | null> {
  const report = await buildAbuseReport(params);
  if (!report) return null;
  const reports = loadAbuseReports();
  const pending = reports.find(
    (entry) =>
      entry.reportId &&
      entry.uploadedAt === undefined &&
      entry.queueIdHash === report.queueIdHash &&
      entry.signingKeyHash === report.signingKeyHash &&
      entry.category === report.category,
  );
  if (pending) return pending;
  reports.unshift(report);
  saveAbuseReports(reports);
  return report;
}

export function markAbuseReportUploaded(reportId: string): boolean {
  if (!/^[0-9a-f]{32}$/.test(reportId)) return false;
  const reports = loadAbuseReports();
  const index = reports.findIndex((report) => report.reportId === reportId);
  if (index < 0) return false;
  reports[index] = { ...reports[index], uploadedAt: Date.now() };
  saveAbuseReports(reports);
  return true;
}

export function clearAbuseReports(): void {
  sessionAbuseReports = [];
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(REPORTS_KEY);
    sessionAbuseReports = null;
  } catch {
    // The in-memory reports are still cleared when browser storage is unavailable.
  }
}
