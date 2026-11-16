import type { AdCampaign } from './types';

const COPY = {
  en: {
    headline: 'Quiet, on demand',
    body: 'Wireless headphones with adaptive noise cancelling and 30 days to change your mind.',
    cta: 'Take a look',
    category: 'Audio',
  },
  ru: {
    headline: 'Тишина по требованию',
    body: 'Беспроводные наушники с адаптивным шумоподавлением. 30 дней на возврат.',
    cta: 'Посмотреть',
    category: 'Аудио',
  },
} as const;

/**
 * Stand-in creative for the native card. Real campaigns arrive from the Ad
 * Service; this one keeps the prototype offline and network-free.
 */
export function getDemoCampaign(language: string): AdCampaign {
  const copy = language === 'ru' ? COPY.ru : COPY.en;
  return {
    id: 'cmp_demo_auralis_001',
    advertiserId: 'adv_demo_auralis',
    advertiserName: 'Auralis Studio',
    headline: copy.headline,
    body: copy.body,
    ctaLabel: copy.cta,
    destinationUrl: 'https://example.com/',
    category: copy.category,
    accent: '#8ca6ff',
  };
}
