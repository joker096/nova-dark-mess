import { beforeEach, describe, expect, it } from 'vitest';
import {
  appealDeadline,
  canAppeal,
  loadActiveSanction,
  loadBlockingSanction,
  loadAppealForSanction,
  loadReports,
  resetModerationState,
  saveSanction,
  submitAppeal,
  submitReport,
} from './store';
import type { SanctionRecord } from '../../types/moderation';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);

function makeSanction(overrides: Partial<SanctionRecord> = {}): SanctionRecord {
  return {
    id: 'sanction-1',
    caseId: 'case-1',
    level: 'S2',
    ruleId: 'R5',
    action: 'relay_block',
    reasonCode: 'harassment',
    reason: 'Coordinated harassment',
    issuedAt: NOW - DAY,
    expiresAt: NOW + 6 * DAY,
    status: 'active',
    ...overrides,
  };
}

describe('moderation store', () => {
  beforeEach(() => {
    localStorage.clear();
    resetModerationState();
  });

  it('queues a report and keeps its target and reason', () => {
    const report = submitReport({
      target: { type: 'post', id: 'post-1', channelId: 'channel-1', title: 'Hello' },
      reason: 'spam',
      details: '  repeated messages  ',
      now: NOW,
    });

    expect(report.id).toMatch(/^rpt_/);
    expect(report.details).toBe('repeated messages');
    expect(report.status).toBe('received');
    expect(loadReports()).toEqual([report]);
  });

  it('deduplicates the same report inside the one-minute window', () => {
    const input = {
      target: { type: 'post' as const, id: 'post-1' },
      reason: 'spam' as const,
      now: NOW,
    };
    const first = submitReport(input);
    const second = submitReport({ ...input, now: NOW + 30_000 });

    expect(second.id).toBe(first.id);
    expect(loadReports()).toHaveLength(1);
  });

  it('returns an active sanction and expires it after its end date', () => {
    saveSanction(makeSanction());
    expect(loadActiveSanction(NOW)?.id).toBe('sanction-1');

    expect(loadActiveSanction(NOW + 7 * DAY)).toBeNull();
    expect(loadActiveSanction(NOW)).toBeNull();
  });

  it('only gates the app for relay and permanent blocks', () => {
    saveSanction(makeSanction({ action: 'throttle' }));
    expect(loadBlockingSanction(NOW)).toBeNull();

    saveSanction(makeSanction({ action: 'relay_block' }));
    expect(loadBlockingSanction(NOW)?.id).toBe('sanction-1');

    saveSanction(makeSanction({ action: 'permanent_block', expiresAt: null }));
    expect(loadBlockingSanction(NOW)?.action).toBe('permanent_block');
  });

  it('accepts one appeal with enough detail', () => {
    const sanction = makeSanction();
    saveSanction(sanction);
    expect(canAppeal(sanction, null, NOW)).toBe(true);
    expect(appealDeadline(sanction)).toBe(sanction.issuedAt + 90 * DAY);

    const short = submitAppeal(sanction, 'too short', NOW);
    expect(short).toEqual({ ok: false, error: 'too_short' });

    const result = submitAppeal(
      sanction,
      'The quoted message was taken out of context and the channel has no prior reports.',
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(result.appeal?.status).toBe('submitted');
    expect(result.sanction?.status).toBe('appealed');
    expect(loadAppealForSanction(sanction.id)?.id).toBe(result.appeal?.id);

    const again = submitAppeal(sanction, 'A second appeal with enough characters.', NOW + 1000);
    expect(again).toEqual({ ok: false, error: 'already' });
  });

  it('closes appeals after the 90-day window', () => {
    const sanction = makeSanction({ issuedAt: NOW - 100 * DAY, expiresAt: null });
    saveSanction(sanction);

    expect(canAppeal(sanction, null, NOW)).toBe(false);
    const result = submitAppeal(
      sanction,
      'This appeal is long enough but arrives after the deadline.',
      NOW,
    );
    expect(result).toEqual({ ok: false, error: 'closed' });
  });
});
