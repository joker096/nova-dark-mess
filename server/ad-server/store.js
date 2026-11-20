/**
 * In-memory store for the ad server (MVP).
 *
 * Entities:
 *   campaigns/{id}.json  — { id, advertiser_id, channel_id, budget_cents,
 *                           cpm_cents, daily_cap, status, created_at }
 *   creatives/{id}.json  — { id, campaign_id, title, body, image_url,
 *                           click_url, erid, marked_as_ad }
 *   impressions/{id}.json — { id, campaign_id, creative_id, channel_id,
 *                            shown_at, country, device_type }
 *
 * Privacy: no user IDs, no fingerprints, no device identifiers stored.
 * Only aggregates: channel_id, campaign_id, timestamp, country, device_type.
 */

import { createHash, randomBytes } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, renameSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function dataDir() {
  return resolve(process.env.DATA_DIR || join(__dirname, 'data'));
}

function entityDir(entity) {
  return join(dataDir(), entity);
}

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

function writeAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function listFiles(dir, ext = '.json') {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(ext));
  } catch {
    return [];
  }
}

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

class EntityStore {
  constructor(entity) {
    this.entity = entity;
    this.dir = entityDir(entity);
    this.cache = new Map();
    this._loadAll();
  }

  _loadAll() {
    for (const f of listFiles(this.dir)) {
      const id = f.slice(0, -'.json'.length);
      const rec = readJson(join(this.dir, f));
      if (rec && rec.id) this.cache.set(rec.id, rec);
    }
  }

  _file(id) {
    return join(this.dir, `${safeId(id)}.json`);
  }

  create(data) {
    const id = data.id || crypto.randomUUID().replace(/-/g, '');
    const record = { ...data, id };
    writeAtomic(this._file(id), JSON.stringify(record, null, 2));
    this.cache.set(id, record);
    return record;
  }

  get(id) {
    return this.cache.get(id);
  }

  set(id, patch) {
    const current = this.cache.get(id) || {};
    const record = { ...current, ...patch, id };
    writeAtomic(this._file(id), JSON.stringify(record, null, 2));
    this.cache.set(id, record);
    return record;
  }

  delete(id) {
    const file = this._file(id);
    if (existsSync(file)) unlinkSync(file);
    this.cache.delete(id);
  }

  list() {
    return [...this.cache.values()];
  }
}

const campaigns = new EntityStore('campaigns');
const creatives = new EntityStore('creatives');
const impressions = new EntityStore('impressions');

export { campaigns, creatives, impressions, EntityStore, randomToken, nowMs, nowIso };

export function createCampaign(data) {
  return campaigns.create({
    ...data,
    status: data.status || 'active',
    created_at: data.created_at || nowIso(),
  });
}

export function getCampaign(id) {
  return campaigns.get(id);
}

export function listCampaignsByChannel(channelId) {
  return campaigns.list().filter((c) => c.channel_id === channelId && c.status === 'active');
}

export function createCreative(data) {
  return creatives.create({
    ...data,
    marked_as_ad: true,
    created_at: data.created_at || nowIso(),
  });
}

export function getCreative(id) {
  return creatives.get(id);
}

export function listCreativesByCampaign(campaignId) {
  return creatives.list().filter((c) => c.campaign_id === campaignId);
}

export function recordImpression(campaignId, creativeId, channelId, opts = {}) {
  return impressions.create({
    id: randomToken(16),
    campaign_id: campaignId,
    creative_id: creativeId,
    channel_id: channelId,
    shown_at: nowMs(),
    country: opts.country || null,
    device_type: opts.device_type || null,
  });
}

export function getImpressionsByCampaign(campaignId, from, to) {
  return impressions.list().filter(
    (i) => i.campaign_id === campaignId && i.shown_at >= from && i.shown_at <= to,
  );
}

export function getImpressionStats(channelId, from, to) {
  const rows = impressions.list().filter(
    (i) => i.channel_id === channelId && i.shown_at >= from && i.shown_at <= to,
  );
  const byCampaign = {};
  for (const row of rows) {
    byCampaign[row.campaign_id] = (byCampaign[row.campaign_id] || 0) + 1;
  }
  return { total: rows.length, by_campaign: byCampaign };
}

export function purgeExpiredImpressions(retentionMs) {
  const cutoff = nowMs() - retentionMs;
  let removed = 0;
  for (const i of impressions.list()) {
    if (i.shown_at < cutoff) {
      impressions.delete(i.id);
      removed += 1;
    }
  }
  return removed;
}
