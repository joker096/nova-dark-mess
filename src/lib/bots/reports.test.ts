import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOT_REPORT_REASONS,
  clearBotReports,
  listBotReports,
  recordBotReport,
} from './reports';

describe('local bot reports', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records a report with no message content', () => {
    recordBotReport('echo', 'spam', 1000);

    expect(listBotReports()).toEqual([
      { botId: 'echo', reason: 'spam', createdAt: 1000 },
    ]);
    expect(localStorage.getItem('nova_bot_reports_v1')).not.toContain('message');
  });

  it('keeps the newest reports and caps the list', () => {
    for (let i = 0; i < 105; i += 1) {
      recordBotReport(`bot_${i}`, 'other', i);
    }

    const reports = listBotReports();
    expect(reports).toHaveLength(100);
    expect(reports[0].botId).toBe('bot_5');
    expect(reports[99].botId).toBe('bot_104');
  });

  it('drops malformed rows on read', () => {
    localStorage.setItem(
      'nova_bot_reports_v1',
      JSON.stringify([
        { botId: 'ok', reason: 'abuse', createdAt: 1 },
        { botId: 'bad', reason: 'unknown', createdAt: 2 },
        { reason: 'spam', createdAt: 3 },
        null,
      ]),
    );

    expect(listBotReports()).toEqual([
      { botId: 'ok', reason: 'abuse', createdAt: 1 },
    ]);
  });

  it('does not throw when storage is unavailable', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect(() => recordBotReport('echo', 'abuse')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('exposes the documented reasons only', () => {
    expect([...BOT_REPORT_REASONS]).toEqual([
      'spam',
      'abuse',
      'malware',
      'copyright',
      'other',
    ]);
  });

  it('clears reports', () => {
    recordBotReport('echo', 'spam');
    clearBotReports();
    expect(listBotReports()).toEqual([]);
  });
});
