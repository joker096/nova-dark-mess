import crypto from 'crypto';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.SITE_OWNER_TOKEN = 'test-token';
// A second owner, used to prove one owner cannot reach another owner's data.
process.env.OWNER_TOKENS = 'other-token:u2';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.POW_DIFFICULTY = '4'; // low difficulty for fast tests
process.env.PORT = '0'; // random port
process.env.DATA_DIR = __dirname + '/data';

const { app } = await import('./index.js');
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const base = `http://localhost:${port}`;
let failures = 0;

function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS: ${name}`); }
  else { failures++; console.log(`  FAIL: ${name} ${detail}`); }
}

function solvePow(challengeB64, difficulty) {
  const challengeBytes = Buffer.from(challengeB64, 'base64url');
  for (let nonce = 0; nonce <= 1000000; nonce++) {
    const buf = Buffer.alloc(challengeBytes.length + 8);
    challengeBytes.copy(buf, 0);
    buf.writeBigUInt64BE(BigInt(nonce), challengeBytes.length);
    const d = crypto.createHash('sha256').update(buf).digest();
    let bits = 0;
    for (const byte of d) {
      if (byte === 0) { bits += 8; continue; }
      bits += Math.clz32(byte) - 24;
      break;
    }
    if (bits >= difficulty) return { nonce, digest: d.toString('base64url') };
  }
  throw new Error('PoW too hard');
}

async function req(method, path, body, headers = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${base}${path}`, opts);
  const txt = await r.text();
  let parsed;
  try { parsed = JSON.parse(txt); } catch { parsed = txt; }
  return { status: r.status, body: parsed, headers: Object.fromEntries(r.headers.entries()) };
}

// 1. Health
let r = await req('GET', '/api/health');
check('health ok', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));

// 2. Create site (no auth → 401)
r = await req('POST', '/v1/sites', { name: 'Test', domains: ['http://localhost:3000'], owner_user_id: 'u1' });
check('create site no auth → 401', r.status === 401, JSON.stringify(r.body));

// 3. Create site (with auth)
r = await req('POST', '/v1/sites', {
  name: 'Test Site',
  domains: ['http://localhost:3000'],
  owner_user_id: 'u1',
  settings: { bot_secret: 'should-not-leak', internal_notes: 'private' },
}, { Authorization: 'Bearer test-token' });
check('create site auth → 201', r.status === 201, JSON.stringify(r.body));
check('site has site_id', typeof r.body.site_id === 'string', JSON.stringify(r.body));
check('site has site_pubkey', typeof r.body.site_pubkey === 'string', JSON.stringify(r.body));
check('site has private key', typeof r.body.site_private_key === 'string', JSON.stringify(r.body));
const siteId = r.body.site_id;
const sitePubkey = r.body.site_pubkey;

// 4. Config (public)
r = await req('GET', `/v1/widget/config?site=${siteId}`);
check('config public → 200', r.status === 200, JSON.stringify(r.body));
check('config site_pubkey matches', r.body.site_pubkey === sitePubkey, JSON.stringify(r.body));
check('config hides private settings', r.body.settings?.bot_secret === undefined && r.body.settings?.internal_notes === undefined, JSON.stringify(r.body));
check('config does not leak bot_secret value', !JSON.stringify(r.body).includes('should-not-leak'), JSON.stringify(r.body));
check('config has no private key or owner id', !('site_private_key' in r.body) && !('owner_user_id' in r.body), JSON.stringify(r.body));

// 5. Config missing site → 400
r = await req('GET', '/v1/widget/config');
check('config no site → 400', r.status === 400, JSON.stringify(r.body));

// 6. PoW challenge
r = await req('GET', `/v1/guest/pow-challenge?site=${siteId}&guest_pubkey=guestpub123`);
check('pow challenge → 200', r.status === 200, JSON.stringify(r.body));
check('pow has challengeId', typeof r.body.challengeId === 'string', JSON.stringify(r.body));
const challengeId = r.body.challengeId;

// 7. Solve PoW (difficulty 4 → should be fast)
const powSolution = solvePow(r.body.challenge.challenge, 4);

// 8. Create guest session
r = await req('POST', '/v1/guest/session', {
  site_id: siteId,
  guest_pubkey: 'guestpub123',
  challenge_id: challengeId,
  pow: powSolution,
}, { origin: 'http://localhost:3000' });
check('guest session → 200', r.status === 200, JSON.stringify(r.body));
check('has guest_token', typeof r.body.guest_token === 'string', JSON.stringify(r.body));
check('has thread_id', typeof r.body.thread_id === 'string', JSON.stringify(r.body));
const guestToken = r.body.guest_token;
const threadId = r.body.thread_id;

// 9. Session with wrong origin → 403
r = await req('POST', '/v1/guest/session', {
  site_id: siteId,
  guest_pubkey: 'guestpub456',
  challenge_id: 'unused',
  pow: powSolution,
}, { origin: 'http://evil.com' });
check('guest session bad origin → 403', r.status === 403, JSON.stringify(r.body));

// 10. Guest history (empty)
r = await req('GET', `/v1/guest/history?thread=${threadId}&token=${guestToken}`);
check('guest history → 200', r.status === 200, JSON.stringify(r.body));
check('history is array', Array.isArray(r.body.messages), JSON.stringify(r.body));

// 10b. Guest history without a guest token → 401 (thread contents are private)
r = await req('GET', `/v1/guest/history?thread=${threadId}`);
check('guest history no token → 401', r.status === 401, JSON.stringify(r.body));

// 11. Owner threads
r = await req('GET', `/v1/owner/threads?site=${siteId}`, null, { Authorization: 'Bearer test-token' });
check('owner threads → 200', r.status === 200, JSON.stringify(r.body));
check('has 1 thread', r.body.threads.length === 1, JSON.stringify(r.body));

// 12. Owner sends message
const { generateX25519KeyPair, sharedSecret, deriveAesKey, encryptAes256Gcm } = await import('./crypto.js');
const { privateKey: sitePriv, publicKey: sitePub } = generateX25519KeyPair();
const guestEphemeral = generateX25519KeyPair();
const ss = sharedSecret(sitePriv, guestEphemeral.publicKey);
const aesKey = deriveAesKey(ss, 'site-gateway-v1', threadId);
const enc = encryptAes256Gcm(aesKey, Buffer.from('Hello from owner'));
r = await req('POST', '/v1/owner/messages', {
  thread_id: threadId,
  ciphertext: enc.ciphertext,
  nonce: enc.nonce,
  ephemeral_pubkey: guestEphemeral.publicKey,
}, { Authorization: 'Bearer test-token' });
check('owner send message → 201', r.status === 201, JSON.stringify(r.body));

// 13. Owner fetches messages
r = await req('GET', `/v1/owner/messages?thread=${threadId}`, null, { Authorization: 'Bearer test-token' });
check('owner messages → 200', r.status === 200, JSON.stringify(r.body));
check('has 1 message', r.body.messages.length === 1, JSON.stringify(r.body));

// 14. Guest fetches history (should see owner message)
r = await req('GET', `/v1/guest/history?thread=${threadId}&token=${guestToken}`);
check('guest history → 200', r.status === 200, JSON.stringify(r.body));
check('guest sees 1 message', r.body.messages.length === 1, JSON.stringify(r.body));

// 15. Guest sends message (via HTTP not WS — just verify store)
// We'll just verify the message was stored. WS is tested conceptually.

// 16. Owner sites list
r = await req('GET', '/v1/owner/sites', null, { Authorization: 'Bearer test-token' });
check('owner sites → 200', r.status === 200, JSON.stringify(r.body));
check('owner sees own site', r.body.sites.some((s) => s.id === siteId), JSON.stringify(r.body));

// 17. A different owner token cannot reach this site
r = await req('GET', '/v1/owner/threads?site=' + siteId, null, { Authorization: 'Bearer other-token' });
check('foreign owner threads → 403', r.status === 403, JSON.stringify(r.body));
r = await req('GET', `/v1/owner/messages?thread=${threadId}`, null, { Authorization: 'Bearer other-token' });
check('foreign owner messages → 403', r.status === 403, JSON.stringify(r.body));
r = await req('PATCH', `/v1/owner/sites/${siteId}`, { settings: { greeting: 'hijacked' } }, { Authorization: 'Bearer other-token' });
check('foreign owner patch site → 403', r.status === 403, JSON.stringify(r.body));
r = await req('POST', '/v1/owner/messages', {
  thread_id: threadId,
  ciphertext: 'AAAA',
  nonce: 'BBBB',
  ephemeral_pubkey: 'CCCC',
}, { Authorization: 'Bearer other-token' });
check('foreign owner cannot post to thread → 403', r.status === 403, JSON.stringify(r.body));
r = await req('PATCH', `/v1/owner/threads/${threadId}/close`, null, { Authorization: 'Bearer other-token' });
check('foreign owner cannot close thread → 403', r.status === 403, JSON.stringify(r.body));
r = await req('GET', `/v1/owner/notifications?site=${siteId}`, null, { Authorization: 'Bearer other-token' });
check('foreign owner notifications → 403', r.status === 403, JSON.stringify(r.body));
r = await req('GET', '/v1/owner/sites', null, { Authorization: 'Bearer other-token' });
check('foreign owner sees no sites', Array.isArray(r.body.sites) && r.body.sites.length === 0, JSON.stringify(r.body));

// 18. A guest token cannot read another guest's thread
const challenge2 = await req('GET', `/v1/guest/pow-challenge?site=${siteId}&guest_pubkey=guestpub789`);
const guest2 = await req('POST', '/v1/guest/session', {
  site_id: siteId,
  guest_pubkey: 'guestpub789',
  challenge_id: challenge2.body.challengeId,
  pow: solvePow(challenge2.body.challenge.challenge, 4),
}, { origin: 'http://localhost:3000' });
check('second guest session → 200', guest2.status === 200, JSON.stringify(guest2.body));
check('second guest has own thread', guest2.body.thread_id !== threadId, JSON.stringify(guest2.body));
r = await req('GET', `/v1/guest/history?thread=${guest2.body.thread_id}`, null, { Authorization: `Bearer ${guestToken}` });
check('guest history foreign thread → 403', r.status === 403, JSON.stringify(r.body));
r = await req('GET', `/v1/guest/history?thread=${guest2.body.thread_id}&token=${guestToken}`);
check('guest history foreign thread via query token → 403', r.status === 403, JSON.stringify(r.body));
r = await req('GET', `/v1/guest/history?thread=${threadId}`, null, { Authorization: `Bearer ${guest2.body.guest_token}` });
check('second guest cannot read first thread → 403', r.status === 403, JSON.stringify(r.body));

// 19. OAuth authorize renders a consent screen instead of auto-approving
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
const redirectUri = 'http://localhost:3000/oauth-callback';
const oauthState = 'state-' + crypto.randomBytes(4).toString('hex');
const authorizePath = `/oauth/authorize?client_id=${siteId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${oauthState}&code_challenge=${codeChallenge}&code_challenge_method=S256&scope=notify`;
async function postConsent(fields) {
  const rr = await fetch(`${base}/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });
  return { status: rr.status, location: rr.headers.get('location'), body: await rr.text() };
}

r = await req('GET', authorizePath);
check('authorize renders consent page', r.status === 200 && /name="request_id"/.test(String(r.body)), String(r.body).slice(0, 120));
const requestId = String(r.body).match(/name="request_id" value="([^"]+)"/)?.[1];
check('authorize has request id', typeof requestId === 'string' && requestId.length > 0);

let consent = await postConsent({ request_id: requestId, decision: 'allow', owner_token: 'wrong-token' });
check('authorize wrong token → 401', consent.status === 401, String(consent.body).slice(0, 120));

consent = await postConsent({ request_id: requestId, decision: 'allow', owner_token: 'test-token' });
check('authorize valid token → 302', consent.status === 302 && !!consent.location, String(consent.body).slice(0, 120));
const consentUrl = new URL(consent.location || 'http://invalid');
check('authorize keeps state', consentUrl.searchParams.get('state') === oauthState, consent.location);
const oauthCode = consentUrl.searchParams.get('code');
check('authorize issues code', typeof oauthCode === 'string' && oauthCode.length > 0);

consent = await postConsent({ request_id: requestId, decision: 'allow', owner_token: 'test-token' });
check('authorize request is single-use', consent.status === 400, String(consent.body).slice(0, 120));

// 20. The code exchanges for a token bound to the authenticated user
r = await req('POST', '/oauth/token', {
  grant_type: 'authorization_code',
  code: oauthCode,
  redirect_uri: redirectUri,
  code_verifier: codeVerifier,
  client_id: siteId,
});
check('oauth token → 200', r.status === 200 && typeof r.body.access_token === 'string', JSON.stringify(r.body));
const idPayload = JSON.parse(Buffer.from(String(r.body.id_token).split('.')[1], 'base64url').toString());
check('id_token sub is the authenticated user', idPayload.sub === `site:${siteId}:user:u1`, idPayload.sub);

// 21. Deny returns access_denied and no code
r = await req('GET', authorizePath);
const denyRequestId = String(r.body).match(/name="request_id" value="([^"]+)"/)?.[1];
consent = await postConsent({ request_id: denyRequestId, decision: 'deny' });
const denyUrl = new URL(consent.location || 'http://invalid');
check('deny → access_denied', consent.status === 302 && denyUrl.searchParams.get('error') === 'access_denied', consent.location);
check('deny issues no code', denyUrl.searchParams.get('code') === null, consent.location);

// Shutdown
server.close();
wss.close();
console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
