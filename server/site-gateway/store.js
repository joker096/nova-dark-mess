/**
 * Disk-based JSON store for site-gateway.
 *
 * Mirrors the storage style used by server.js (receipts/, relay/, backups/):
 * one JSON file per entity under data/<entity>/, atomic writes via tmp+rename,
 * plus small index files for lookups. No SQL, no migrations — consistent with
 * the rest of the project which has no migration tooling.
 *
 * Entities:
 *   sites/{id}.json        — { id, owner_user_id, name, domains[], site_pubkey,
 *                             settings, created_at }
 *   guests/{id}.json       — { id, site_id, guest_pubkey, first_seen_at,
 *                             last_seen_at, blocked }
 *   threads/{id}.json      — { id, site_id, guest_id, status, last_page_url,
 *                             created_at, last_message_at }
 *   messages/{id}.json     — { id, thread_id, sender, ciphertext, nonce,
 *                             ephemeral_pubkey, created_at, delivered_at, read_at }
 *
 * Indexes:
 *   index/threads-by-site/{siteId}.json   — [threadId, ...]
 *   index/messages-by-thread/{threadId}.json — [messageId, ...] (newest first)
 *   index/sites-by-owner/{ownerId}.json   — [siteId, ...]
 *   index/sites-by-domain/{domain}.json   — siteId
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

function indexDir(name) {
  return join(dataDir(), 'index', name);
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

/** ──────────────────────────────────────────────────────────────────────
 * Generic entity store
 * ────────────────────────────────────────────────────────────────────── */

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

/** ──────────────────────────────────────────────────────────────────────
 * Index helpers
 * ────────────────────────────────────────────────────────────────────── */

function indexFile(indexName, key) {
  return join(indexDir(indexName), `${safeId(key)}.json`);
}

function readIndex(indexName, key, fallback = []) {
  return readJson(indexFile(indexName, key), fallback);
}

function writeIndex(indexName, key, value) {
  writeAtomic(indexFile(indexName, key), JSON.stringify(value, null, 2));
}

function pushIndex(indexName, key, value) {
  const arr = readIndex(indexName, key, []);
  if (!arr.includes(value)) {
    arr.push(value);
    writeIndex(indexName, key, arr);
  }
  return arr;
}

/** ──────────────────────────────────────────────────────────────────────
 * Site store
 * ────────────────────────────────────────────────────────────────────── */

const sites = new EntityStore('sites');

export function createSite(data) {
  const site = sites.create({
    ...data,
    kind: data.kind || 'site',
    username: data.username || null,
    confirmed: data.confirmed !== undefined ? data.confirmed : false,
    created_at: data.created_at || nowIso(),
  });
  pushIndex('sites-by-owner', site.owner_user_id, site.id);
  for (const domain of data.domains || []) {
    writeIndex('sites-by-domain', domain, site.id);
  }
  if (site.username) {
    writeIndex('sites-by-username', site.username, site.id);
  }
  return site;
}

export function getSite(id) {
  return sites.get(id);
}

export function getSiteByUsername(username) {
  const siteId = readIndex('sites-by-username', username);
  if (!siteId) return null;
  return sites.get(siteId);
}

export function updateSite(id, patch) {
  const site = sites.set(id, patch);
  // Rebuild domain indexes when domains change
  if (patch.domains) {
    // Note: stale domain entries are not purged here; acceptable for v1.
  }
  if (patch.username && patch.username !== (sites.get(id) || {}).username) {
    writeIndex('sites-by-username', patch.username, id);
  }
  return site;
}

export function listSitesByOwner(ownerUserId) {
  const ids = readIndex('sites-by-owner', ownerUserId, []);
  return ids.map((id) => sites.get(id)).filter(Boolean);
}

export function findSiteByDomain(domain) {
  const siteId = readIndex('sites-by-domain', domain);
  if (!siteId) return null;
  return sites.get(siteId);
}

export function listAllSites() {
  return sites.list();
}

/** ──────────────────────────────────────────────────────────────────────
 * Guest store
 * ────────────────────────────────────────────────────────────────────── */

const guests = new EntityStore('guests');

export function createGuest(data) {
  const guest = guests.create({
    ...data,
    first_seen_at: data.first_seen_at || nowIso(),
    last_seen_at: data.last_seen_at || nowIso(),
    blocked: Boolean(data.blocked),
  });
  return guest;
}

export function getGuest(id) {
  return guests.get(id);
}

export function updateGuest(id, patch) {
  const record = guests.set(id, { ...patch, last_seen_at: nowIso() });
  return record;
}

export function listGuestsBySite(siteId) {
  return guests.list().filter((g) => g.site_id === siteId);
}

/** ──────────────────────────────────────────────────────────────────────
 * Thread store
 * ────────────────────────────────────────────────────────────────────── */

const threads = new EntityStore('threads');

export function createThread(data) {
  const thread = threads.create({
    ...data,
    status: data.status || 'open',
    created_at: data.created_at || nowIso(),
    last_message_at: data.last_message_at || nowIso(),
  });
  pushIndex('threads-by-site', thread.site_id, thread.id);
  return thread;
}

export function getThread(id) {
  return threads.get(id);
}

export function updateThread(id, patch) {
  return threads.set(id, patch);
}

export function listThreadsBySite(siteId, opts = {}) {
  const ids = readIndex('threads-by-site', siteId, []);
  let out = ids.map((id) => threads.get(id)).filter(Boolean);
  if (opts.status && !opts.includeClosed) out = out.filter((t) => t.status === opts.status);
  out.sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
  return out;
}

export function findThreadByGuestAndSite(guestId, siteId) {
  return threads.list().find((t) => t.guest_id === guestId && t.site_id === siteId);
}

/** ──────────────────────────────────────────────────────────────────────
 * Message store
 * ────────────────────────────────────────────────────────────────────── */

const messages = new EntityStore('messages');

export function createMessage(data) {
  const message = messages.create({
    ...data,
    created_at: data.created_at || nowIso(),
  });
  pushIndex('messages-by-thread', message.thread_id, message.id);
  return message;
}

export function getMessage(id) {
  return messages.get(id);
}

export function updateMessage(id, patch) {
  return messages.set(id, patch);
}

export function listMessagesByThread(threadId, opts = {}) {
  const ids = readIndex('messages-by-thread', threadId, []);
  let out = ids.map((id) => messages.get(id)).filter(Boolean);
  out.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (opts.after) {
    const after = new Date(opts.after).getTime();
    out = out.filter((m) => new Date(m.created_at).getTime() > after);
  }
  if (typeof opts.limit === 'number') out = out.slice(0, opts.limit);
  return out;
}

export function listUndeliveredBefore(cutoffMs) {
  return messages.list().filter(
    (m) => !m.delivered_at && new Date(m.created_at).getTime() < cutoffMs,
  );
}

export function countMessages() {
  return messages.list().length;
}

/** ──────────────────────────────────────────────────────────────────────
 * Maintenance
 * ────────────────────────────────────────────────────────────────────── */

export function purgeExpiredMessages(retentionMs) {
  const cutoff = nowMs() - retentionMs;
  let removed = 0;
  for (const m of messages.list()) {
    if (!m.delivered_at && new Date(m.created_at).getTime() < cutoff) {
      messages.delete(m.id);
      removed += 1;
    }
  }
  return removed;
}

/** ──────────────────────────────────────────────────────────────────────
 * Notification store (in-app notifications for owner)
 * ────────────────────────────────────────────────────────────────────── */

const notifications = new EntityStore('notifications');

export function createNotification(data) {
  const n = notifications.create({
    ...data,
    read: false,
    created_at: data.created_at || nowIso(),
  });
  pushIndex('notifications-by-site', n.site_id, n.id);
  pushIndex('notifications-by-owner', n.owner_user_id, n.id);
  return n;
}

export function getNotification(id) {
  return notifications.get(id);
}

export function listNotifications(siteId, opts = {}) {
  const ids = readIndex('notifications-by-site', siteId, []);
  let out = ids.map((id) => notifications.get(id)).filter(Boolean);
  if (typeof opts.unread === 'boolean') out = out.filter((n) => n.read === !opts.unread);
  out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (typeof opts.limit === 'number') out = out.slice(0, opts.limit);
  return out;
}

export function markNotificationRead(id) {
  return notifications.set(id, { read: true });
}

export function listUnreadNotifications(ownerUserId) {
  const ids = readIndex('notifications-by-owner', ownerUserId, []);
  return ids.map((id) => notifications.get(id)).filter((n) => n && !n.read);
}

/** ──────────────────────────────────────────────────────────────────────
 * Handoff token store (disk-based, persistent across restarts)
 * ────────────────────────────────────────────────────────────────────── */

const HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export { HANDOFF_TTL_MS };

const handoffs = new EntityStore('handoffs');

export function createHandoffToken(threadId, guestId, siteId) {
  const token = randomToken(24);
  const record = handoffs.create({
    id: token,
    thread_id: threadId,
    guest_id: guestId,
    site_id: siteId,
    created_at: Date.now(),
    used: false,
    consumed_at: null,
  });
  setTimeout(() => deleteHandoffToken(token), HANDOFF_TTL_MS).unref?.();
  return token;
}

export function getHandoffToken(token) {
  const entry = handoffs.get(token);
  if (!entry) return null;
  if (Date.now() - entry.created_at > HANDOFF_TTL_MS) {
    deleteHandoffToken(token);
    return null;
  }
  if (entry.used) return null;
  return entry;
}

export function consumeHandoffToken(token) {
  const entry = handoffs.get(token);
  if (!entry) return null;
  if (Date.now() - entry.created_at > HANDOFF_TTL_MS) {
    deleteHandoffToken(token);
    return null;
  }
  if (entry.used) return null;
  const updated = handoffs.set(token, { used: true, consumed_at: Date.now() });
  return updated;
}

export function deleteHandoffToken(token) {
  handoffs.delete(token);
}

export function listHandoffTokens() {
  return handoffs.list().map((e) => ({ token: e.id, ...e }));
}

/** ──────────────────────────────────────────────────────────────────────
 * Metrics store: site_stats_daily (aggregates per site per day)
 * ────────────────────────────────────────────────────────────────────── */

const stats = new EntityStore('stats');

export function recordStat(siteId, date, event, increment = 1) {
  const key = `${siteId}|${date}`;
  let row = stats.get(key);
  if (!row) {
    row = { site_id: siteId, date, loaded: 0, opened: 0, first_message: 0, owner_replied: 0, handoff_shown: 0, handoff_clicked: 0, handoff_completed: 0, created_at: nowIso() };
    stats.create({ ...row, id: key });
  }
  row[event] = (row[event] || 0) + increment;
  stats.set(key, row);
  return row;
}

export function getStats(siteId, dateFrom, dateTo) {
  return stats.list().filter((s) => s.site_id === siteId && s.date >= dateFrom && s.date <= dateTo);
}

export function getStatsAll(dateFrom, dateTo) {
  return stats.list().filter((s) => s.date >= dateFrom && s.date <= dateTo);
}

/** ──────────────────────────────────────────────────────────────────────
 * Bot token store (disk-based, persistent across restarts)
 * ────────────────────────────────────────────────────────────────────── */

const botTokens = new EntityStore('bot-tokens');

export function createBotToken(siteId) {
  const token = randomToken(24);
  const record = botTokens.create({
    id: token,
    site_id: siteId,
    created_at: Date.now(),
  });
  return token;
}

export function getBotToken(token) {
  const entry = botTokens.get(token);
  if (!entry) return null;
  return entry;
}

export function deleteBotToken(token) {
  botTokens.delete(token);
}

export function listBotTokens(siteId) {
  return botTokens.list().filter((e) => e.site_id === siteId).map((e) => ({ token: e.id, ...e }));
}

/** ──────────────────────────────────────────────────────────────────────
 * OAuth 2.0 («Войти через Mess») — authorization code + PKCE
 * ────────────────────────────────────────────────────────────────────── */

const OAUTH_CODE_TTL_MS = 60 * 1000; // 60 seconds

const oauthCodes = new EntityStore('oauth-codes');
const userConsents = new EntityStore('user-consents');

export function createOAuthCode(siteId, userId, redirectUri, codeChallenge, scope) {
  const code = randomToken(24);
  oauthCodes.create({
    id: code,
    site_id: siteId,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope: scope || '',
    created_at: Date.now(),
    used: false,
  });
  setTimeout(() => deleteOAuthCode(code), OAUTH_CODE_TTL_MS).unref?.();
  return code;
}

export function deleteOAuthCode(code) {
  oauthCodes.delete(code);
}

export function getOAuthCode(code) {
  const entry = oauthCodes.get(code);
  if (!entry) return null;
  if (Date.now() - entry.created_at > OAUTH_CODE_TTL_MS) {
    deleteOAuthCode(code);
    return null;
  }
  if (entry.used) return null;
  return entry;
}

export function consumeOAuthCode(code) {
  const entry = oauthCodes.get(code);
  if (!entry) return null;
  if (Date.now() - entry.created_at > OAUTH_CODE_TTL_MS) {
    deleteOAuthCode(code);
    return null;
  }
  if (entry.used) return null;
  const updated = oauthCodes.set(code, { used: true });
  return updated;
}

export function hasUserConsent(siteId, userId, scope) {
  const key = `${siteId}|${userId}`;
  const entry = userConsents.get(key);
  if (!entry) return false;
  const scopes = scope.split(' ').filter(Boolean);
  return scopes.every((s) => entry.scopes.includes(s));
}

export function grantUserConsent(siteId, userId, scope) {
  const key = `${siteId}|${userId}`;
  const entry = userConsents.get(key) || { scopes: [], granted_at: Date.now() };
  const scopes = [...new Set([...entry.scopes, ...scope.split(' ').filter(Boolean)])];
  const updated = userConsents.set(key, { scopes, granted_at: Date.now() });
  return updated;
}

export function revokeUserConsent(siteId, userId) {
  userConsents.delete(`${siteId}|${userId}`);
}

export function listUserConsents(userId) {
  return userConsents.list()
    .filter((e) => e.id.endsWith(`|${userId}`))
    .map((e) => ({ site_id: e.id.split('|')[0], scopes: e.scopes, granted_at: e.granted_at }));
}

/** ──────────────────────────────────────────────────────────────────────
 * Site → user notifications (notify scope) — disk-based, persistent
 * ────────────────────────────────────────────────────────────────────── */

const NOTIFY_DAILY_LIMIT = 5;

const userNotifications = new EntityStore('user-notifications');
const notifyRateLimit = new EntityStore('notify-rate-limit');
const mutedSites = new EntityStore('muted-sites');

export function createUserNotification(userId, siteId, title, text, url) {
  const id = randomToken(16);
  const n = {
    id,
    site_id: siteId,
    title,
    text,
    url: url || null,
    created_at: Date.now(),
    read: false,
  };
  const rec = userNotifications.create(n);
  return rec;
}

export function getUserNotifications(userId, siteId) {
  const arr = userNotifications.list().filter((n) => n.user_id === userId);
  if (siteId) return arr.filter((n) => n.site_id === siteId);
  return arr;
}

export function markUserNotificationRead(userId, notifId) {
  const arr = userNotifications.list().filter((n) => n.user_id === userId && n.id === notifId);
  const n = arr[0];
  if (n) userNotifications.set(notifId, { read: true });
  return n;
}

export function isNotifyRateLimited(siteId, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${siteId}|${userId}|${today}`;
  const entry = notifyRateLimit.get(key);
  const count = entry ? (entry.count || 0) : 0;
  return count >= NOTIFY_DAILY_LIMIT;
}

export function incrementNotifyRateLimit(siteId, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${siteId}|${userId}|${today}`;
  const entry = notifyRateLimit.get(key) || { count: 0 };
  const updated = notifyRateLimit.set(key, { count: (entry.count || 0) + 1 });
  return updated;
}

export function isSiteMuted(siteId, userId) {
  return Boolean(mutedSites.get(`${siteId}|${userId}`));
}

export function muteSite(siteId, userId) {
  mutedSites.create({ id: `${siteId}|${userId}`, site_id: siteId, user_id: userId });
}

export function unmuteSite(siteId, userId) {
  mutedSites.delete(`${siteId}|${userId}`);
}

export function listMutedSites(userId) {
  return mutedSites.list()
    .filter((k) => k.id.endsWith(`|${userId}`))
    .map((k) => k.site_id);
}

/** ──────────────────────────────────────────────────────────────────────
 * Anonymous push registrations (phase F) — disk-based, persistent
 *
 * Stores only `pushToken -> queueId`. No sender, no content, no fingerprint.
 * One token per queue so the notification service cannot link contacts.
 * ────────────────────────────────────────────────────────────────────── */

const pushRegistrations = new EntityStore('push-registrations');

export function registerPushToken(pushToken, queueId) {
  const rec = pushRegistrations.create({ id: pushToken, push_token: pushToken, queue_id: queueId, created_at: Date.now() });
  return rec;
}

export function getPushQueueId(pushToken) {
  const rec = pushRegistrations.get(pushToken);
  return rec ? rec.queue_id : null;
}

export function listPushRegistrations() {
  return pushRegistrations.list().map((r) => ({ push_token: r.push_token, queue_id: r.queue_id, created_at: r.created_at }));
}

export function getNotifyRateLimit() {
  return NOTIFY_DAILY_LIMIT;
}
