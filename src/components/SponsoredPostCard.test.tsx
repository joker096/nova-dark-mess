/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SponsoredPostCard } from './SponsoredPostCard';
import type { AdCampaign } from '../lib/ads/types';
import { clearLocalAdPrefs, isAdDismissed, isAdvertiserBlocked } from '../lib/ads/localAds';
import { resetModerationState } from '../lib/moderation/store';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

const campaign: AdCampaign = {
  id: 'campaign-1',
  advertiserId: 'advertiser-1',
  advertiserName: 'Auralis Studio',
  headline: 'Quiet, on demand',
  body: 'Wireless headphones with adaptive noise cancelling.',
  ctaLabel: 'Take a look',
  destinationUrl: 'https://example.com/',
  category: 'Audio',
  accent: '#8ca6ff',
};

describe('SponsoredPostCard', () => {
  beforeEach(() => {
    localStorage.clear();
    resetModerationState();
  });

  it('renders a native card with a visible ad label and no overlay media', () => {
    render(<SponsoredPostCard campaign={campaign} />);

    expect(screen.getByTestId('sponsored-post-card')).toBeTruthy();
    expect(screen.getAllByText('ads.label').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quiet, on demand').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /ads.whyThisAd/ })).toBeTruthy();
  });

  it('hides the card and remembers the dismissal', () => {
    const onDismissed = vi.fn();
    render(<SponsoredPostCard campaign={campaign} onDismissed={onDismissed} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'ads.hideAd' })[0]);

    expect(screen.queryByTestId('sponsored-post-card')).toBeNull();
    expect(isAdDismissed(campaign.id)).toBe(true);
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('opens the disclosure sheet without profiling claims', () => {
    render(<SponsoredPostCard campaign={campaign} />);
    fireEvent.click(screen.getByRole('button', { name: /ads.whyThisAd/ }));

    expect(screen.getByTestId('ad-disclosure-sheet')).toBeTruthy();
    expect(screen.getByText('ads.whyPoint1')).toBeTruthy();
    expect(screen.getByText('ads.whyPoint2')).toBeTruthy();
  });

  it('returns a hidden card after local ad preferences are reset', async () => {
    localStorage.setItem('nova_ads_dismissed_v1', JSON.stringify([campaign.id]));
    render(<SponsoredPostCard campaign={campaign} />);
    expect(screen.queryByTestId('sponsored-post-card')).toBeNull();

    act(() => clearLocalAdPrefs());

    await waitFor(() => expect(screen.getByTestId('sponsored-post-card')).toBeTruthy());
  });

  it('reports the ad and can block the advertiser', () => {
    render(<SponsoredPostCard campaign={campaign} />);
    fireEvent.click(screen.getByRole('button', { name: /ads.reportAd/ }));

    fireEvent.click(screen.getByRole('radio', { name: 'moderation.reason.scam' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /moderation.blockAdvertiser/ }));
    fireEvent.click(screen.getByRole('button', { name: 'moderation.submit' }));

    expect(screen.queryByTestId('sponsored-post-card')).toBeNull();
    expect(isAdvertiserBlocked(campaign.advertiserId)).toBe(true);
  });
});
