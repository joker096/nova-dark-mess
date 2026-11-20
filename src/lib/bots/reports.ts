/**
 * Local-only bot reports (docs/bots-roadmap.md §B8).
 *
 * There is no central moderation server in Nova: reporting a bot records the
 * report on this device so the user can see what they reported and the app can
 * surface it later (for example when exporting diagnostics). Nothing is sent
 * anywhere and no message content is stored — only the bot id, a coarse
 * reason, and a timestamp.
 */

export const BOT_REPORT_REASONS = ['spam', 'abuse', 'malware', 'copyright', 'other'] as const;

export type BotReportReason = (typeof BOT_REPORT_REASONS)[number];

export interface BotReport {
  botId: string;
  reason: BotReportReason;
  createdAt: number;
}

const REPORTS_KEY = 'nova_bot_reports_v1';
const MAX_REPORTS = 100;

function isReport(value: unknown): value is BotReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<BotReport>;
  return (
    typeof report.botId === 'string' &&
    report.botId.length > 0 &&
    typeof report.reason === 'string' &&
    (BOT_REPORT_REASONS as readonly string[]).includes(report.reason) &&
    typeof report.createdAt === 'number'
  );
}

/** Returns stored reports, dropping malformed rows. */
export function listBotReports(): BotReport[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReport).slice(-MAX_REPORTS);
  } catch {
    return [];
  }
}

/** Appends a report and returns the updated list. Never throws. */
export function recordBotReport(
  botId: string,
  reason: BotReportReason,
  now = Date.now(),
): BotReport[] {
  const report: BotReport = { botId, reason, createdAt: now };
  const reports = [...listBotReports(), report].slice(-MAX_REPORTS);
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  } catch {
    /* storage may be unavailable; reporting must not break the chat */
  }
  return reports;
}

/** For tests and "clear local reports" affordances. */
export function clearBotReports(): void {
  try {
    localStorage.removeItem(REPORTS_KEY);
  } catch {
    /* ignore */
  }
}
