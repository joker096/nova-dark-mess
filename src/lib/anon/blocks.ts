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
  /** SHA-256 hex of the reporter's signing public key, when the report is authenticated. */
  reporterKeyHash?: string;
  /** Coarse category, no free text (free text could carry identifying data). */
  category: 'spam' | 'harassment' | 'illegal';
  reportedAt: number;
  uploadedAt?: number;
  /** Ed25519 signature of the report, base64. Present when the report is authenticated. */
  signature?: string;
}

export type AbuseCategory = AbuseReport['category'];

export interface AbuseReportSubmission {
  v: 1;
  reportId: string;
  queueIdHash: string;
  signingKeyHash: string;
  /** SHA-256 hex of the reporter's signing public key, present for authenticated reports. */
  reporterKeyHash?: string;
  /** Timestamp when the report was created, needed for signature verification. */
  reportedAt: number;
  category: AbuseCategory;
  /** Ed25519 signature over the report fields, base64. Present when authenticated. */
  signature?: string;
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

function abuseReportMessage(report: {
  reportId: string;
  queueIdHash: string;
  signingKeyHash: string;
  reporterKeyHash: string;
  category: AbuseCategory;
  reportedAt: number;
}): string {
  return JSON.stringify({
    reportId: report.reportId,
    queueIdHash: report.queueIdHash,
    signingKeyHash: report.signingKeyHash,
    reporterKeyHash: report.reporterKeyHash,
    category: report.category,
    reportedAt: report.reportedAt,
  });
}

/**
 * Signs an abuse report with the reporter's Ed25519 signing key so the relay
 * can verify the report came from a legitimate participant (not a random
 * submitter who guessed queue hashes). Returns the signature as base64.
 */
export async function signAbuseReport(
  privateKey: string,
  report: Pick<
    AbuseReport,
    'reportId' | 'queueIdHash' | 'signingKeyHash' | 'reporterKeyHash' | 'category' | 'reportedAt'
  >,
): Promise<string> {
  const { signQueueCommand } = await import('./signing');
  const auth = signQueueCommand(privateKey, {
    action: 'enqueue',
    queueId: report.queueIdHash,
    token: report.reportId!,
    signedAt: report.reportedAt,
    commandNonce: report.reporterKeyHash!,
  });
  return auth.signature;
}

/**
 * Verifies an Ed25519 signature on an abuse report submission. Returns true
 * when the signature was produced by the holder of `reporterKeyHash`'s
 * private key over the report fields. Returns false for hash-only reports
 * (no reporter key or signature).
 */
export async function verifyAbuseReportSignature(
  reporterPublicKey: string,
  report: Pick<
    AbuseReport,
    'reportId' | 'queueIdHash' | 'signingKeyHash' | 'reporterKeyHash' | 'category' | 'reportedAt'
  > & { signature?: string },
): Promise<boolean> {
  if (!report.reporterKeyHash || !report.signature) return false;
  const { verifyQueueCommand } = await import('./signing');
  return verifyQueueCommand(
    reporterPublicKey,
    {
      action: 'enqueue',
      queueId: report.queueIdHash,
      token: report.reportId!,
      signedAt: report.reportedAt,
      commandNonce: report.reporterKeyHash!,
    },
    report.signature,
  );
}

/**
 * Builds an authenticated abuse report with the reporter's signing key hash
 * included. The report can later be signed with `signAbuseReport` for relay
 * verification. When no reporter key is provided, the report is hash-only
 * (backwards-compatible, unauthenticated).
 */
export async function buildAbuseReport(params: {
  queueId: string;
  signingPublicKey: string;
  category: AbuseCategory;
  /** Reporter's Ed25519 signing public key, optional for authenticated reports. */
  reporterSigningPublicKey?: string;
}): Promise<AbuseReport | null> {
  const { queueId, signingPublicKey, category, reporterSigningPublicKey } = params;
  if (!/^q_[0-9a-f]{32}$/.test(queueId) || !isSigningPublicKey(signingPublicKey)) return null;
  if (!isAbuseCategory(category)) return null;
  const now = Date.now();
  const base: AbuseReport = {
    v: 1,
    reportId: randomReportId(),
    queueIdHash: await sha256Hex(queueId),
    signingKeyHash: await sha256Hex(signingPublicKey),
    category,
    reportedAt: now,
  };
  if (reporterSigningPublicKey && isSigningPublicKey(reporterSigningPublicKey)) {
    base.reporterKeyHash = await sha256Hex(reporterSigningPublicKey);
  }
  return base;
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
  /** Reporter's Ed25519 signing public key, optional for authenticated reports. */
  reporterSigningPublicKey?: string;
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
      entry.category === report.category &&
      entry.reporterKeyHash === report.reporterKeyHash,
  );
  if (pending) return pending;
  reports.unshift(report);
  saveAbuseReports(reports);
  return report;
}

/**
 * Creates a submission object ready to send to the relay. Signs the report
 * with the reporter's private key when provided, producing an authenticated
 * submission the relay can verify.
 */
export async function createAbuseReportSubmission(
  report: AbuseReport,
  reporterPrivateKey?: string,
): Promise<AbuseReportSubmission | null> {
  if (!report.reportId) return null;
  const submission: AbuseReportSubmission = {
    v: 1,
    reportId: report.reportId,
    queueIdHash: report.queueIdHash,
    signingKeyHash: report.signingKeyHash,
    reporterKeyHash: report.reporterKeyHash,
    reportedAt: report.reportedAt,
    category: report.category,
  };
  if (report.reporterKeyHash && reporterPrivateKey) {
    const { isQueuePrivateKey } = await import('./signing');
    if (isQueuePrivateKey(reporterPrivateKey)) {
      submission.signature = await signAbuseReport(reporterPrivateKey, {
        reportId: submission.reportId,
        queueIdHash: submission.queueIdHash,
        signingKeyHash: submission.signingKeyHash,
        reporterKeyHash: submission.reporterKeyHash!,
        category: submission.category,
        reportedAt: submission.reportedAt,
      });
    }
  }
  return submission;
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
