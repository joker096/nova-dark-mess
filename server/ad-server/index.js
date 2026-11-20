/**
 * Ad Server — MVP for native channel ads (Etapa 7).
 *
 * Privacy-first: no user IDs, no fingerprints, no device identifiers.
 * Ads only in public channel feeds — never in private chats, groups, calls,
 * or push notifications.
 *
 * Endpoints:
 *   GET    /v1/ads?channel_id=ID  — pick an ad creative for a channel
 *   POST   /v1/ads/impression     — record an impression (anonymous)
 *   GET    /v1/ads/stats?channel_id=ID&from=...&to=...  — aggregate stats
 *   POST   /v1/ads/campaigns      — advertiser creates a campaign
 *   POST   /v1/ads/creatives      — advertiser creates a creative
 */

import express from 'express';
import {
  createCampaign, getCampaign, listCampaignsByChannel,
  createCreative, getCreative, listCreativesByCampaign,
  recordImpression, getImpressionStats, purgeExpiredImpressions,
} from './store.js';

const app = express();
app.use(express.json({ limit: '64kb' }));

const PORT = parseInt(process.env.PORT || '8082', 10);
const IMPRESSION_RETENTION_MS = parseInt(process.env.IMPRESSION_RETENTION_DAYS || '30', 10) * 24 * 60 * 60 * 1000;

// Periodic cleanup of old impressions
setInterval(() => purgeExpiredImpressions(IMPRESSION_RETENTION_MS), 60 * 60 * 1000).unref?.();

// ──────────────────────────────────────────────────────────────────────
// GET /v1/ads — pick an ad for a channel
// ──────────────────────────────────────────────────────────────────────
app.get('/v1/ads', (req, res) => {
  const { channel_id } = req.query;
  if (!channel_id || typeof channel_id !== 'string') {
    return res.status(400).json({ error: 'channel_id required' });
  }

  const campaigns = listCampaignsByChannel(channel_id);
  if (campaigns.length === 0) {
    return res.status(204).end(); // no ad available
  }

  // Deterministic pick: first active campaign (MVP — manual sales, no auction yet)
  const campaign = campaigns[0];
  const creatives = listCreativesByCampaign(campaign.id);
  if (creatives.length === 0) {
    return res.status(204).end();
  }

  const creative = creatives[0];
  return res.json({
    ad: {
      creative_id: creative.id,
      campaign_id: campaign.id,
      title: creative.title,
      body: creative.body,
      image_url: creative.image_url,
      click_url: creative.click_url,
      erid: creative.erid || null,
      marked_as_ad: true,
    },
  });
});

// ──────────────────────────────────────────────────────────────────────
// POST /v1/ads/impression — record an anonymous impression
// ──────────────────────────────────────────────────────────────────────
app.post('/v1/ads/impression', (req, res) => {
  const { campaign_id, creative_id, channel_id, country, device_type } = req.body;
  if (!campaign_id || !creative_id || !channel_id) {
    return res.status(400).json({ error: 'campaign_id, creative_id, channel_id required' });
  }

  recordImpression(campaign_id, creative_id, channel_id, { country, device_type });
  return res.status(201).json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────────
// GET /v1/ads/stats — aggregate impression stats (no user data)
// ──────────────────────────────────────────────────────────────────────
app.get('/v1/ads/stats', (req, res) => {
  const { channel_id, from, to } = req.query;
  if (!channel_id || typeof channel_id !== 'string') {
    return res.status(400).json({ error: 'channel_id required' });
  }

  const fromMs = from ? parseInt(from, 10) : 0;
  const toMs = to ? parseInt(to, 10) : Date.now();

  const stats = getImpressionStats(channel_id, fromMs, toMs);
  return res.json({ channel_id, from: fromMs, to: toMs, ...stats });
});

// ──────────────────────────────────────────────────────────────────────
// POST /v1/ads/campaigns — advertiser creates a campaign
// ──────────────────────────────────────────────────────────────────────
app.post('/v1/ads/campaigns', (req, res) => {
  const { advertiser_id, channel_id, budget_cents, cpm_cents, daily_cap } = req.body;
  if (!advertiser_id || !channel_id || !budget_cents) {
    return res.status(400).json({ error: 'advertiser_id, channel_id, budget_cents required' });
  }

  const campaign = createCampaign({
    advertiser_id,
    channel_id,
    budget_cents: parseInt(budget_cents, 10),
    cpm_cents: cpm_cents ? parseInt(cpm_cents, 10) : 0,
    daily_cap: daily_cap ? parseInt(daily_cap, 10) : null,
  });
  return res.status(201).json({ campaign });
});

// ──────────────────────────────────────────────────────────────────────
// POST /v1/ads/creatives — advertiser creates a creative
// ──────────────────────────────────────────────────────────────────────
app.post('/v1/ads/creatives', (req, res) => {
  const { campaign_id, title, body, image_url, click_url, erid } = req.body;
  if (!campaign_id || !title || !click_url) {
    return res.status(400).json({ error: 'campaign_id, title, click_url required' });
  }

  const creative = createCreative({
    campaign_id,
    title,
    body: body || '',
    image_url: image_url || null,
    click_url,
    erid: erid || null,
  });
  return res.status(201).json({ creative });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Ad server listening on :${PORT}`);
});

export default app;
