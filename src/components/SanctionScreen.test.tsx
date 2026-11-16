/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SanctionScreen } from './SanctionScreen';
import { loadAppealForSanction, resetModerationState, saveSanction } from '../lib/moderation/store';
import type { SanctionRecord } from '../types/moderation';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

const DAY = 24 * 60 * 60 * 1000;

function sanction(overrides: Partial<SanctionRecord> = {}): SanctionRecord {
  return {
    id: 'sanction-1',
    caseId: 'case-1',
    level: 'S2',
    ruleId: 'R10',
    action: 'relay_block',
    reasonCode: 'harassment',
    reason: 'Coordinated harassment in comments',
    issuedAt: Date.now() - DAY,
    expiresAt: Date.now() + 6 * DAY,
    status: 'active',
    ...overrides,
  };
}

describe('SanctionScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    resetModerationState();
  });

  it('shows a clear standing when there is no sanction', () => {
    render(<SanctionScreen onClose={() => {}} />);

    expect(screen.getByText('moderation.clearTitle')).toBeTruthy();
    expect(screen.getByText('moderation.clearStatus')).toBeTruthy();
    expect(screen.queryByText('moderation.restrictedTitle')).toBeNull();
  });

  it('shows the reason, level and expiry for an active sanction', () => {
    saveSanction(sanction());
    render(<SanctionScreen onClose={() => {}} />);

    expect(screen.getByText('moderation.restrictedTitle')).toBeTruthy();
    expect(screen.getByText(/S2/)).toBeTruthy();
    expect(screen.getByText('Coordinated harassment in comments')).toBeTruthy();
    expect(screen.getByText('moderation.relayPausedTitle')).toBeTruthy();
  });

  it('submits one appeal and shows its status', () => {
    saveSanction(sanction());
    render(<SanctionScreen onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('moderation.appealTitle'), {
      target: {
        value: 'The comment was quoted from another channel and I have no prior moderation cases.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /moderation.appealSubmit/ }));

    expect(screen.getByText('moderation.appealStatusSubmitted')).toBeTruthy();
    expect(loadAppealForSanction('sanction-1')).not.toBeNull();
    expect(screen.queryByLabelText('moderation.appealTitle')).toBeNull();
  });

  it('cannot be dismissed in blocked mode but still accepts an appeal', () => {
    saveSanction(sanction());
    const onClose = vi.fn();
    render(<SanctionScreen mode="blocked" onClose={onClose} />);

    expect(screen.queryByRole('button', { name: 'common.close' })).toBeNull();
    expect(screen.queryByRole('button', { name: /common.back/ })).toBeNull();
    fireEvent.click(screen.getByTestId('sanction-screen'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('moderation.appealTitle')).toBeTruthy();
  });

  it('treats an expired sanction as no active restriction', () => {
    saveSanction(sanction({ expiresAt: Date.now() - 1000 }));
    render(<SanctionScreen onClose={() => {}} />);

    expect(screen.getByText('moderation.clearTitle')).toBeTruthy();
  });
});
