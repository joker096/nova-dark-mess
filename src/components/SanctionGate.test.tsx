/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { SanctionGate } from './SanctionGate';
import { clearSanction, resetModerationState, saveSanction } from '../lib/moderation/store';
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
    reason: 'Coordinated harassment',
    issuedAt: Date.now() - DAY,
    expiresAt: Date.now() + 6 * DAY,
    status: 'active',
    ...overrides,
  };
}

describe('SanctionGate', () => {
  beforeEach(() => {
    localStorage.clear();
    resetModerationState();
  });

  it('keeps the app available for non-blocking sanctions', () => {
    saveSanction(sanction({ action: 'throttle' }));
    render(
      <SanctionGate>
        <div data-testid="app-content" />
      </SanctionGate>,
    );

    expect(screen.getByTestId('app-content')).toBeTruthy();
    expect(screen.queryByTestId('sanction-screen')).toBeNull();
  });

  it('replaces the app for a relay block', () => {
    saveSanction(sanction());
    render(
      <SanctionGate>
        <div data-testid="app-content" />
      </SanctionGate>,
    );

    expect(screen.getByTestId('sanction-screen')).toBeTruthy();
    expect(screen.queryByTestId('app-content')).toBeNull();
    expect(screen.getByText('moderation.restrictedTitle')).toBeTruthy();
  });

  it('restores the app when the sanction is cleared', async () => {
    saveSanction(sanction({ action: 'permanent_block', expiresAt: null }));
    render(
      <SanctionGate>
        <div data-testid="app-content" />
      </SanctionGate>,
    );

    act(() => clearSanction());

    await waitFor(() => expect(screen.getByTestId('app-content')).toBeTruthy());
    expect(screen.queryByTestId('sanction-screen')).toBeNull();
  });
});
