/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReportSheet } from './ReportSheet';
import { loadReports, resetModerationState } from '../lib/moderation/store';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

describe('ReportSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    resetModerationState();
  });

  it('requires a reason, then queues the report and shows the case id', () => {
    render(
      <ReportSheet
        target={{ type: 'post', id: 'post-1', channelId: 'channel-1', title: 'Post title' }}
        onClose={() => {}}
      />,
    );

    const submit = screen.getByRole('button', { name: 'moderation.submit' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'moderation.reason.spam' }));
    fireEvent.change(screen.getByLabelText('moderation.detailsLabel'), {
      target: { value: 'Repeated unsolicited messages' },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    expect(screen.getByText('moderation.receivedTitle')).toBeTruthy();
    const [report] = loadReports();
    expect(report.target.id).toBe('post-1');
    expect(report.reason).toBe('spam');
    expect(report.details).toBe('Repeated unsolicited messages');
  });

  it('offers blocking an advertiser only for ad reports', () => {
    render(
      <ReportSheet
        target={{
          type: 'ad',
          id: 'campaign-1',
          advertiserId: 'advertiser-1',
          title: 'Example campaign',
        }}
        onClose={() => {}}
      />,
    );

    const block = screen.getByRole('checkbox', {
      name: /moderation.blockAdvertiser/,
    });
    fireEvent.click(screen.getByRole('radio', { name: 'moderation.reason.scam' }));
    fireEvent.click(block);
    fireEvent.click(screen.getByRole('button', { name: 'moderation.submit' }));

    expect(loadReports()[0].blockAdvertiser).toBe(true);
    expect(screen.getByText('moderation.advertiserBlocked')).toBeTruthy();
  });
});
