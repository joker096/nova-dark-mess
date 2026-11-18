// End-to-end smoke test of the one-time invite token flow over HTTP.
const BASE = 'http://localhost:8080';

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  // 1. Create a queue.
  const created = await post('/api/anon/queues', {});
  if (created.status !== 201 || !created.body.inviteToken) {
    console.error('FAIL create:', created.status, created.body);
    process.exit(1);
  }
  const { queueId, senderToken, recipientToken, inviteToken } = created.body;
  console.log('created queue', queueId, 'inviteToken len', inviteToken.length);

  const packet = Buffer.alloc(16384, 7).toString('base64');

  // 2. First enqueue without the token must be rejected.
  const noToken = await post('/api/anon/enqueue', { queueId, senderToken, packet });
  console.log('enqueue without token ->', noToken.status, noToken.body.reason);
  if (noToken.status !== 400 || noToken.body.reason !== 'INVITE_TOKEN_REQUIRED') process.exit(1);

  // 3. Wrong token rejected.
  const wrong = await post('/api/anon/enqueue', { queueId, senderToken, packet, inviteToken: 'A'.repeat(43) });
  console.log('enqueue wrong token ->', wrong.status, wrong.body.reason);
  if (wrong.status !== 403 || wrong.body.reason !== 'INVALID_INVITE_TOKEN') process.exit(1);

  // 4. Correct token accepted.
  const first = await post('/api/anon/enqueue', { queueId, senderToken, packet, inviteToken });
  console.log('enqueue with token ->', first.status, first.body.ok);
  if (first.status !== 202) process.exit(1);

  // 5. Token burned: second enqueue without token succeeds now.
  const second = await post('/api/anon/enqueue', { queueId, senderToken, packet });
  console.log('second enqueue after burn ->', second.status, second.body.ok);
  if (second.status !== 202) process.exit(1);

  // 6. Recipient can poll.
  const poll = await post('/api/anon/poll', { queueId, recipientToken, limit: 10 });
  console.log('poll ->', poll.status, 'packets:', poll.body.packets?.length);
  if (poll.status !== 200 || poll.body.packets.length !== 2) process.exit(1);

  console.log('ONE-TIME INVITE E2E: PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
