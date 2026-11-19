import crypto from 'crypto';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.SITE_OWNER_TOKEN = 'e2e-token';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.POW_DIFFICULTY = '2';
process.env.PORT = '0';
process.env.DATA_DIR = __dirname + '/data';

const { app, server, wss } = await import('./index.js');
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const base = `http://localhost:${port}`;
let failures = 0;

function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS: ${name}`); }
  else { failures++; console.log(`  FAIL: ${name} ${detail}`); }
}

async function req(method, path, body, headers = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${base}${path}`, opts);
  const txt = await r.text();
  let parsed;
  try { parsed = JSON.parse(txt); } catch { parsed = txt; }
  return { status: r.status, body: parsed };
}

// 1. Create site
let r = await req('POST', '/v1/sites', { name: 'E2E Site', domains: ['http://localhost:3000'], owner_user_id: 'u1' }, { Authorization: 'Bearer e2e-token' });
check('create site', r.status === 201, JSON.stringify(r.body));
const siteId = r.body.site_id;
const sitePubkey = r.body.site_pubkey;
const sitePrivkey = r.body.site_private_key;

// 2. Guest: config
r = await req('GET', `/v1/widget/config?site=${siteId}`);
check('config', r.status === 200 && r.body.site_pubkey === sitePubkey, JSON.stringify(r.body));

// 3. Guest: PoW challenge
r = await req('GET', `/v1/guest/pow-challenge?site=${siteId}&guest_pubkey=guestpub-e2e`);
check('pow challenge', r.status === 200, JSON.stringify(r.body));
const { challengeId, challenge, difficulty } = r.body;

// 4. Solve PoW
const challengeBytes = Buffer.from(challenge.challenge, 'base64url');
let nonce = 0;
let solutionDigest = '';
while (true) {
  const buf = Buffer.alloc(challengeBytes.length + 8);
  challengeBytes.copy(buf, 0);
  buf.writeBigUInt64BE(BigInt(nonce), challengeBytes.length);
  const digest = crypto.createHash('sha256').update(buf).digest();
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24;
    break;
  }
  if (bits >= difficulty) {
    solutionDigest = digest.toString('base64url');
    break;
  }
  nonce++;
}

// 5. Guest: create session
r = await req('POST', '/v1/guest/session', {
  site_id: siteId, guest_pubkey: 'guestpub-e2e', challenge_id: challengeId, pow: { nonce, digest: solutionDigest },
}, { origin: 'http://localhost:3000' });
check('guest session', r.status === 200, JSON.stringify(r.body));
const guestToken = r.body.guest_token;
const threadId = r.body.thread_id;

// 6. Guest WS: connect and receive owner message
const guestWs = new WebSocket(`ws://localhost:${port}/v1/guest/ws?token=${encodeURIComponent(guestToken)}`);
const guestMsgs = [];
let wsError = null;
guestWs.onopen = () => {};
guestWs.onmessage = (ev) => { guestMsgs.push(JSON.parse(ev.data)); };
guestWs.onerror = (ev) => { wsError = ev; console.log('WS ERROR:', ev); };
guestWs.onclose = () => { console.log('WS CLOSED'); };

await new Promise((res) => guestWs.onopen = () => res());
await new Promise(res => setTimeout(res, 300));
console.log('readyState:', guestWs.readyState, 'msgs:', guestMsgs.length, 'error:', wsError);

// 7. Owner sends message via REST (simulate encrypted)
const { x25519 } = await import('@noble/curves/ed25519.js');
const guestEphemeral = x25519.utils.randomSecretKey();
const sitePriv = Buffer.from(sitePrivkey, 'base64url');
const shared = x25519.getSharedSecret(sitePriv, x25519.getPublicKey(guestEphemeral));
// Send valid base64url strings (32 bytes decoded)
r = await req('POST', '/v1/owner/messages', {
  thread_id: threadId,
  ciphertext: Buffer.from('test-ciphertext-padding-for-32-bytes-length-check').toString('base64url'),
  nonce: Buffer.alloc(12).toString('base64url'),
  ephemeral_pubkey: Buffer.from(x25519.getPublicKey(guestEphemeral)).toString('base64url'),
}, { Authorization: 'Bearer e2e-token' });
check('owner send message', r.status === 201, JSON.stringify(r.body));

// Wait for guest WS to receive
await new Promise(res => setTimeout(res, 500));
const ownerMsg = guestMsgs.find(m => m.type === 'message.new' && m.sender === 'owner');
check('guest receives owner message via WS', !!ownerMsg, JSON.stringify(guestMsgs));

// 8. Guest sends message via WS
guestWs.send(JSON.stringify({
  type: 'message', thread_id: threadId, ciphertext: 'guest-ct', nonce: 'guest-nonce', ephemeral_pubkey: 'guest-ephem'
}));
await new Promise(res => setTimeout(res, 500));

// 9. Owner fetches messages (polling REST since no owner WS client connected)
r = await req('GET', `/v1/owner/messages?thread=${threadId}`, null, { Authorization: 'Bearer e2e-token' });
check('owner can fetch messages', r.status === 200, JSON.stringify(r.body));
const guestMsg = r.body.messages.find(m => m.sender === 'guest');
check('owner sees guest message', !!guestMsg, JSON.stringify(r.body));

// 10. Guest reconnects and gets history (offline delivery)
const guestToken2 = guestToken; // same token
const guestWs2 = new WebSocket(`ws://localhost:${port}/v1/guest/ws?token=${encodeURIComponent(guestToken2)}`);
const guestMsgs2 = [];
guestWs2.onmessage = (ev) => { guestMsgs2.push(JSON.parse(ev.data)); };
await new Promise(res => guestWs2.onopen = () => res());
await new Promise(res => setTimeout(res, 500));
const historyMsg = guestMsgs2.find(m => m.type === 'message.new' && m.sender === 'owner');
check('guest receives undelivered message on reconnect', !!historyMsg, JSON.stringify(guestMsgs2));

// 11. Unauthorized domain rejected
r = await req('POST', '/v1/guest/session', {
  site_id: siteId, guest_pubkey: 'guestpub-evil', challenge_id: challengeId, pow: { nonce, digest: solutionDigest },
}, { origin: 'http://evil.com' });
check('unauthorized domain rejected', r.status === 403, JSON.stringify(r.body));

// Shutdown
guestWs.close(); guestWs2.close(); wss.close(); server.close();
console.log(`\n${failures === 0 ? 'ALL E2E TESTS PASSED' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
