export interface AdCampaign {
  id: string;
  advertiserId: string;
  advertiserName: string;
  headline: string;
  body: string;
  ctaLabel: string;
  destinationUrl: string;
  category: string;
  /** Accent used by the native card's built-in artwork. */
  accent: string;
}

export type AdEventType = 'impression' | 'click' | 'dismiss' | 'report';
