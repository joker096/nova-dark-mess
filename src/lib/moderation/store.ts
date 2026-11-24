import type {
  ModerationAppeal,
  ModerationReport,
  ReportReasonId,
  ReportTarget,
  SanctionRecord,
  SanctionStatus,
} from '../../types/moderation';

const REPORTS_KEY = 'nova_moderation_reports_v1';
const SANCTION_KEY = 'nova_moderation_sanction_v1';
const APPEALS_KEY = 'nova_moderation_appeals_v1';

export const SANCTION_CHANGED_EVENT = 'nova:sanction-changed';

const MAX_REPORTS = 100;
const MAX_APPEALS = 20;
const APPEAL_MIN_LENGTH = 20;
const APPEAL_MAX_LENGTH = 2000;
const APPEAL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 60 * 1000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private windows; the caller still gets
    // the in-memory report so the UI can confirm the action.
  }
}

function notifySanctionChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SANCTION_CHANGED_EVENT));
  }
}

function randomHex(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(len / 2)));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len);
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${randomHex(8)}`;
}

export interface SubmitReportInput {
  target: ReportTarget;
  reason: ReportReasonId;
  details?: string;
  blockAdvertiser?: boolean;
  now?: number;
}

/**
 * Queues a report on the device. The moderation service is not part of this
 * build yet, so nothing is sent over the network; the local queue is the
 * source the future relay sync will drain.
 */
export function submitReport(input: SubmitReportInput): ModerationReport {
  const now = input.now ?? Date.now();
  const reports = loadReports();
  const duplicate = reports.find(
    (report) =>
      report.target.type === input.target.type &&
      report.target.id === input.target.id &&
      report.reason === input.reason &&
      now - report.createdAt < DUPLICATE_WINDOW_MS,
  );
  if (duplicate) return duplicate;

  const report: ModerationReport = {
    id: createId('rpt'),
    target: input.target,
    reason: input.reason,
    details: input.details?.trim().slice(0, 500) || undefined,
    createdAt: now,
    status: 'received',
    blockAdvertiser: input.blockAdvertiser || undefined,
  };
  writeJson(REPORTS_KEY, [report, ...reports].slice(0, MAX_REPORTS));
  return report;
}

export function loadReports(): ModerationReport[] {
  const value = readJson<ModerationReport[]>(REPORTS_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function loadActiveSanction(now = Date.now()): SanctionRecord | null {
  const sanction = readJson<SanctionRecord | null>(SANCTION_KEY, null);
  if (!sanction || typeof sanction !== 'object') return null;
  if (sanction.status !== 'active' && sanction.status !== 'appealed') return null;
  if (sanction.expiresAt !== null && sanction.expiresAt <= now) {
    saveSanction({ ...sanction, status: 'expired' }, false);
    return null;
  }
  return sanction;
}

/** Actions that stop the client from publishing and messaging entirely. */
export function isBlockingAction(action: SanctionRecord['action']): boolean {
  return action === 'relay_block' || action === 'permanent_block';
}

/** Returns an active sanction only when it must gate the whole app. */
export function loadBlockingSanction(now = Date.now()): SanctionRecord | null {
  const sanction = loadActiveSanction(now);
  return sanction && isBlockingAction(sanction.action) ? sanction : null;
}

export function saveSanction(sanction: SanctionRecord, notify = true): void {
  writeJson(SANCTION_KEY, sanction);
  if (notify) notifySanctionChanged();
}

export function clearSanction(): void {
  try {
    localStorage.removeItem(SANCTION_KEY);
  } catch {
    // ignore
  }
  notifySanctionChanged();
}

export function loadAppeals(): ModerationAppeal[] {
  const value = readJson<ModerationAppeal[]>(APPEALS_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function loadAppealForSanction(sanctionId: string): ModerationAppeal | null {
  return loadAppeals().find((appeal) => appeal.sanctionId === sanctionId) ?? null;
}

export function appealDeadline(sanction: SanctionRecord): number {
  return sanction.issuedAt + APPEAL_WINDOW_MS;
}

export function canAppeal(
  sanction: SanctionRecord,
  appeal: ModerationAppeal | null,
  now = Date.now(),
): boolean {
  if (appeal) return false;
  if (sanction.status !== 'active') return false;
  if (sanction.expiresAt !== null && sanction.expiresAt <= now) return false;
  return now <= appealDeadline(sanction);
}

export type AppealError = 'empty' | 'too_short' | 'too_long' | 'closed' | 'already';

export interface SubmitAppealResult {
  ok: boolean;
  error?: AppealError;
  appeal?: ModerationAppeal;
  sanction?: SanctionRecord;
}

export function submitAppeal(
  sanction: SanctionRecord,
  text: string,
  now = Date.now(),
): SubmitAppealResult {
  const body = text.trim();
  if (!body) return { ok: false, error: 'empty' };
  if (body.length < APPEAL_MIN_LENGTH) return { ok: false, error: 'too_short' };
  if (body.length > APPEAL_MAX_LENGTH) return { ok: false, error: 'too_long' };

  const existing = loadAppealForSanction(sanction.id);
  if (existing) return { ok: false, error: 'already' };
  if (!canAppeal(sanction, null, now)) return { ok: false, error: 'closed' };

  const appeal: ModerationAppeal = {
    id: createId('apl'),
    sanctionId: sanction.id,
    text: body,
    createdAt: now,
    status: 'submitted',
  };
  const appeals = loadAppeals();
  writeJson(APPEALS_KEY, [appeal, ...appeals].slice(0, MAX_APPEALS));

  const next: SanctionRecord = { ...sanction, status: 'appealed' as SanctionStatus };
  saveSanction(next);
  return { ok: true, appeal, sanction: next };
}

export function resetModerationState(): void {
  try {
    localStorage.removeItem(REPORTS_KEY);
    localStorage.removeItem(SANCTION_KEY);
    localStorage.removeItem(APPEALS_KEY);
  } catch {
    // ignore
  }
}

export const MODERATION_LIMITS = {
  appealMinLength: APPEAL_MIN_LENGTH,
  appealMaxLength: APPEAL_MAX_LENGTH,
  appealWindowMs: APPEAL_WINDOW_MS,
  maxReports: MAX_REPORTS,
} as const;
