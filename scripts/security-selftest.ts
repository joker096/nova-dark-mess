import assert from 'node:assert/strict';
import {
  createAnonymousIdentity,
  createOneTimePreKey,
  createPreKeyBundle,
  createMnemonic,
  createSignedPreKey,
  deriveIdentityFromMnemonic,
  isValidMnemonic,
  normalizeMnemonic,
  verifyPreKeyBundle,
  signWithIdentity,
  verifyIdentitySignature,
} from '../src/lib/crypto/identity';
import {
  createInboundRatchetSession,
  createOutboundRatchetSession,
  ratchetDecryptMessage,
  ratchetEncryptMessage,
  RatchetMessagePayload,
  RatchetState,
} from '../src/lib/crypto/ratchet';
import {
  encryptAESGCM,
  decryptAESGCM,
  sha256Hex,
  bufferToBase64,
  base64ToBuffer,
  bufferToHex,
  hexToBuffer,
  deriveKeyFromSecret,
} from '../src/lib/crypto/aes';
import {
  deriveKeyFromRandomSecret,
  deriveKeyFromPassphrase,
  generateSalt,
} from '../src/lib/storage/kdf';
import {
  buildTOTPUri,
  computeTOTPCode,
  generateTOTPSecret,
  verifyTOTPCode,
} from '../src/lib/p2p/totp';
import { P2PSignalingClient } from '../src/lib/p2p/signaling';
import {
  createEncryptedBackupBlob,
  restoreEncryptedBackup,
} from '../src/lib/storage/backup';
import { P2PManager } from '../src/lib/p2p/p2pManager';
import { MeshRelay } from '../src/lib/p2p/relay';

async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function testIdentity(): Promise<void> {
  const identity = await createAnonymousIdentity();
  assert.equal(identity.version, 2);
  assert.equal(identity.mnemonic.split(' ').length, 24);
  assert.ok(isValidMnemonic(identity.mnemonic));
  assert.ok(identity.fingerprint.startsWith('nova_pk_'));

  const restored = deriveIdentityFromMnemonic(identity.mnemonic, identity.createdAt);
  assert.equal(restored.fingerprint, identity.fingerprint);
  assert.equal(restored.publicKey, identity.publicKey);
  assert.equal(restored.signingPublicKey, identity.signingPublicKey);
  assert.equal(restored.privateKeyRaw, identity.privateKeyRaw);
}

async function establishSessions(): Promise<{
  alice: Awaited<ReturnType<typeof createAnonymousIdentity>>;
  bob: Awaited<ReturnType<typeof createAnonymousIdentity>>;
  aliceState: RatchetState;
  bobState: RatchetState;
  firstPayload: RatchetMessagePayload;
}> {
  const alice = await createAnonymousIdentity();
  const bob = await createAnonymousIdentity();
  const signedPreKey = createSignedPreKey(bob, 7);
  const oneTimePreKey = createOneTimePreKey(42);
  const bundle = createPreKeyBundle(bob, signedPreKey, oneTimePreKey);
  assert.equal(verifyPreKeyBundle(bundle), true);

  const outbound = await createOutboundRatchetSession(alice, bundle);
  const encrypted = await ratchetEncryptMessage(
    outbound.state,
    'hello bob',
    alice.fingerprint,
    bob.fingerprint,
    outbound.header
  );

  const bobState = await createInboundRatchetSession(
    bob,
    signedPreKey,
    oneTimePreKey,
    outbound.header
  );
  const decrypted = await ratchetDecryptMessage(bobState, encrypted.payload);
  assert.equal(decrypted.plaintext, 'hello bob');

  return {
    alice,
    bob,
    aliceState: encrypted.updatedState,
    bobState: decrypted.updatedState,
    firstPayload: encrypted.payload,
  };
}

async function testX3DHAndRatchet(): Promise<void> {
  const { alice, bob, aliceState, bobState } = await establishSessions();
  let aState = aliceState;
  let bState = bobState;

  const reply = await ratchetEncryptMessage(bState, 'hello alice', bob.fingerprint, alice.fingerprint);
  bState = reply.updatedState;
  const replyDecrypted = await ratchetDecryptMessage(aState, reply.payload);
  assert.equal(replyDecrypted.plaintext, 'hello alice');
  aState = replyDecrypted.updatedState;

  for (let i = 0; i < 6; i += 1) {
    const fromAlice = await ratchetEncryptMessage(
      aState,
      `alice-${i}`,
      alice.fingerprint,
      bob.fingerprint
    );
    aState = fromAlice.updatedState;
    const atBob = await ratchetDecryptMessage(bState, fromAlice.payload);
    assert.equal(atBob.plaintext, `alice-${i}`);
    bState = atBob.updatedState;

    const fromBob = await ratchetEncryptMessage(
      bState,
      `bob-${i}`,
      bob.fingerprint,
      alice.fingerprint
    );
    bState = fromBob.updatedState;
    const atAlice = await ratchetDecryptMessage(aState, fromBob.payload);
    assert.equal(atAlice.plaintext, `bob-${i}`);
    aState = atAlice.updatedState;
  }
}

async function testOutOfOrder(): Promise<void> {
  const { alice, bob, aliceState, bobState } = await establishSessions();
  let aState = aliceState;
  let bState = bobState;

  const payloads: RatchetMessagePayload[] = [];
  for (let i = 0; i < 4; i += 1) {
    const result = await ratchetEncryptMessage(
      aState,
      `ordered-${i}`,
      alice.fingerprint,
      bob.fingerprint
    );
    aState = result.updatedState;
    payloads.push(result.payload);
  }

  const third = await ratchetDecryptMessage(bState, payloads[2]);
  assert.equal(third.plaintext, 'ordered-2');
  bState = third.updatedState;

  const first = await ratchetDecryptMessage(bState, payloads[0]);
  assert.equal(first.plaintext, 'ordered-0');
  bState = first.updatedState;

  const second = await ratchetDecryptMessage(bState, payloads[1]);
  assert.equal(second.plaintext, 'ordered-1');
  bState = second.updatedState;

  await assert.rejects(
    ratchetDecryptMessage(bState, payloads[1]),
    /already used|Missing receive chain/
  );

  const fourth = await ratchetDecryptMessage(bState, payloads[3]);
  assert.equal(fourth.plaintext, 'ordered-3');
}

async function testTamperDetection(): Promise<void> {
  const { bob, bobState, firstPayload } = await establishSessions();
  const tampered: RatchetMessagePayload = {
    ...firstPayload,
    encryptedContent: {
      ...firstPayload.encryptedContent,
      ciphertext: firstPayload.encryptedContent.ciphertext.slice(0, -4) + 'AAAA',
    },
  };
  assert.ok(bob.fingerprint.startsWith('nova_pk_'));
  await assert.rejects(ratchetDecryptMessage(bobState, tampered));
}

async function testTotp(): Promise<void> {
  const secret = generateTOTPSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  const code = await computeTOTPCode(secret);
  assert.match(code, /^\d{6}$/);
  assert.equal(await verifyTOTPCode(secret, code), true);
  assert.equal(await verifyTOTPCode(secret, '000000'), false);

  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const rfcCode = await computeTOTPCode(rfcSecret, 59000, 30, 8);
  assert.equal(rfcCode, '94287082');

  const uri = buildTOTPUri(secret, 'alice@nova');
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.ok(uri.includes(`secret=${secret}`));
}

async function testPow(): Promise<void> {
  const nonce = await P2PSignalingClient.solvePoWChallenge('nova-pow', 1);
  assert.ok(nonce >= 0);
}

async function testP2PManagerOverRelay(): Promise<void> {
  const alice = await createAnonymousIdentity();
  const bob = await createAnonymousIdentity();
  const channelName = `nova-selftest-relay-${Date.now()}`;
  const aliceRelay = new MeshRelay(alice.fingerprint, channelName);
  const bobRelay = new MeshRelay(bob.fingerprint, channelName);

  const aliceInbox: Array<{ from: string; text: string }> = [];
  const bobInbox: Array<{ from: string; text: string }> = [];

  const aliceManager = new P2PManager({
    identity: alice,
    relay: aliceRelay,
    onMessage: (from, text) => aliceInbox.push({ from, text }),
  });
  const bobManager = new P2PManager({
    identity: bob,
    relay: bobRelay,
    onMessage: (from, text) => bobInbox.push({ from, text }),
  });

  await aliceManager.initialize();
  await bobManager.initialize();
  aliceManager.registerPeerBundle(bob.fingerprint, await bobManager.getPreKeyBundle());
  bobManager.registerPeerBundle(alice.fingerprint, await aliceManager.getPreKeyBundle());

  const queued = await aliceManager.sendMessage(bob.fingerprint, 'mesh hello');
  assert.equal(queued, true);
  await waitUntil(() => bobInbox.length === 1);
  assert.equal(bobInbox[0].text, 'mesh hello');
  assert.equal(bobInbox[0].from, alice.fingerprint);

  await bobManager.sendMessage(alice.fingerprint, 'mesh reply');
  await waitUntil(() => aliceInbox.length === 1);
  assert.equal(aliceInbox[0].text, 'mesh reply');
  assert.equal(aliceInbox[0].from, bob.fingerprint);

  await aliceManager.sendMessage(bob.fingerprint, 'second message');
  await waitUntil(() => bobInbox.length === 2);
  assert.equal(bobInbox[1].text, 'second message');

  aliceManager.close();
  bobManager.close();
}

async function testBackupRoundTrip(): Promise<void> {
  const identity = await createAnonymousIdentity();
  const payload = {
    version: 2,
    identity,
    chatsMetadata: [{ id: 'katie', name: 'Katie', isEncrypted: true }],
    exportedAt: new Date().toISOString(),
  };

  const blob = await createEncryptedBackupBlob(payload, 'strong-passphrase');
  const text = await blob.text();
  const restored = await restoreEncryptedBackup(text, 'strong-passphrase');
  assert.equal(restored.identity.fingerprint, identity.fingerprint);
  assert.deepEqual(restored.chatsMetadata, payload.chatsMetadata);

  await assert.rejects(restoreEncryptedBackup(text, 'wrong-passphrase'), /Invalid passphrase/);
  await assert.rejects(
    createEncryptedBackupBlob(payload, 'short'),
    /at least 8 characters/
  );
}

async function testKdfAndAes(): Promise<void> {
  const salt = generateSalt(16);
  assert.equal(salt.length, 16);

  // PBKDF2 from passphrase derives a usable AES-GCM key
  const pbkdfKey = await deriveKeyFromPassphrase('test-passphrase', salt);
  const enc = await encryptAESGCM('secret data', pbkdfKey);
  const dec = await decryptAESGCM(enc, pbkdfKey);
  assert.equal(dec, 'secret data');

  // HKDF from random secret derives a different usable key
  const hkdfKey = await deriveKeyFromRandomSecret('device-secret', salt);
  const enc2 = await encryptAESGCM('device data', hkdfKey);
  const dec2 = await decryptAESGCM(enc2, hkdfKey);
  assert.equal(dec2, 'device data');

  // PBKDF2 and HKDF keys must differ (compare via ciphertexts since keys are non-extractable)
  const pbkdfEnc = await encryptAESGCM('probe', pbkdfKey);
  const hkdfEnc = await encryptAESGCM('probe', hkdfKey);
  assert.notEqual(pbkdfEnc.ciphertext, hkdfEnc.ciphertext);

  // sha256Hex deterministic
  const h1 = await sha256Hex('hello');
  const h2 = await sha256Hex('hello');
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  const h3 = await sha256Hex(new Uint8Array([1, 2, 3]));
  assert.notEqual(h1, h3);

  // buffer conversions roundtrip
  const bytes = new Uint8Array([0, 1, 2, 255, 16, 32, 64]);
  assert.equal(bufferToHex(hexToBuffer(bufferToHex(bytes))), bufferToHex(bytes));
  assert.deepEqual(Array.from(base64ToBuffer(bufferToBase64(bytes))), Array.from(bytes));

  // wrong passphrase key fails to decrypt (different salt/key)
  const wrongKey = await deriveKeyFromPassphrase('wrong-passphrase', salt);
  await assert.rejects(decryptAESGCM(enc, wrongKey));
}

async function testIdentitySignVerify(): Promise<void> {
  const identity = await createAnonymousIdentity();
  const message = 'nova identity attestation';

  const signature = signWithIdentity(identity, message);
  assert.equal(typeof signature, 'string');
  assert.equal(signature.length > 0, true);

  assert.equal(verifyIdentitySignature(identity.signingPublicKey, message, signature), true);
  assert.equal(verifyIdentitySignature(identity.signingPublicKey, 'tampered message', signature), false);

  // different identity must not verify
  const other = await createAnonymousIdentity();
  assert.equal(verifyIdentitySignature(other.signingPublicKey, message, signature), false);
}

async function testPreKeys(): Promise<void> {
  const identity = await createAnonymousIdentity();

  const signedPreKey = createSignedPreKey(identity, 3);
  assert.equal(signedPreKey.keyId, 3);
  assert.ok(signedPreKey.publicKey);
  assert.ok(signedPreKey.signature);

  const oneTimePreKey = createOneTimePreKey(9);
  assert.equal(oneTimePreKey.keyId, 9);
  assert.ok(oneTimePreKey.publicKey);

  const bundle = createPreKeyBundle(identity, signedPreKey, oneTimePreKey);
  assert.equal(verifyPreKeyBundle(bundle), true);

  // tampered signed prekey must fail verification
  const tampered = {
    ...bundle,
    signedPreKey: {
      ...bundle.signedPreKey,
      publicKey: 'deadbeef',
    },
  };
  assert.equal(verifyPreKeyBundle(tampered), false);
}

async function testMnemonicDeterminism(): Promise<void> {
  const m24 = createMnemonic(24);
  assert.equal(m24.split(' ').length, 24);
  assert.equal(isValidMnemonic(m24), true);

  const m12 = createMnemonic(12);
  assert.equal(m12.split(' ').length, 12);
  assert.equal(isValidMnemonic(m12), true);

  assert.equal(isValidMnemonic('not a valid mnemonic phrase at all'), false);
  assert.equal(isValidMnemonic(''), false);

  const id1 = deriveIdentityFromMnemonic(m24, '2026-01-01T00:00:00Z');
  const id2 = deriveIdentityFromMnemonic(m24, '2026-01-01T00:00:00Z');
  assert.equal(id1.fingerprint, id2.fingerprint);
  assert.equal(id1.publicKey, id2.publicKey);

  const normalized = normalizeMnemonic(m24);
  assert.equal(isValidMnemonic(normalized), true);
}

async function testRatchetPcs(): Promise<void> {
  // Post-compromise security: after a DH ratchet step, old chain keys cannot decrypt new messages
  const alice = await createAnonymousIdentity();
  const bob = await createAnonymousIdentity();
  const signedPreKey = createSignedPreKey(bob, 1);
  const oneTimePreKey = createOneTimePreKey(1);
  const bundle = createPreKeyBundle(bob, signedPreKey, oneTimePreKey);

  const outbound = await createOutboundRatchetSession(alice, bundle);
  const bobState = await createInboundRatchetSession(bob, signedPreKey, oneTimePreKey, outbound.header);

  // Alice sends first message
  const m1 = await ratchetEncryptMessage(outbound.state, 'msg-1', alice.fingerprint, bob.fingerprint);
  const d1 = await ratchetDecryptMessage(bobState, m1.payload);
  assert.equal(d1.plaintext, 'msg-1');

  // Bob replies -> triggers DH ratchet on Alice side
  const m2 = await ratchetEncryptMessage(d1.updatedState, 'msg-2', bob.fingerprint, alice.fingerprint);
  const d2 = await ratchetDecryptMessage(m1.updatedState, m2.payload);
  assert.equal(d2.plaintext, 'msg-2');

  // After the DH ratchet, an old ratchet state (compromised) cannot decrypt new messages
  const m3 = await ratchetEncryptMessage(d2.updatedState, 'msg-3', bob.fingerprint, alice.fingerprint);
  await assert.rejects(ratchetDecryptMessage(m1.updatedState, m3.payload));
}

async function testRatchetSkippedKeys(): Promise<void> {
  const alice = await createAnonymousIdentity();
  const bob = await createAnonymousIdentity();
  const signedPreKey = createSignedPreKey(bob, 1);
  const oneTimePreKey = createOneTimePreKey(1);
  const bundle = createPreKeyBundle(bob, signedPreKey, oneTimePreKey);

  const outbound = await createOutboundRatchetSession(alice, bundle);
  const bobState = await createInboundRatchetSession(bob, signedPreKey, oneTimePreKey, outbound.header);

  // Alice sends 3 messages quickly
  const p1 = await ratchetEncryptMessage(outbound.state, 's-1', alice.fingerprint, bob.fingerprint);
  const p2 = await ratchetEncryptMessage(p1.updatedState, 's-2', alice.fingerprint, bob.fingerprint);
  const p3 = await ratchetEncryptMessage(p2.updatedState, 's-3', alice.fingerprint, bob.fingerprint);

  // Bob processes out of order: 3, then 1, then 2
  const d3 = await ratchetDecryptMessage(bobState, p3.payload);
  assert.equal(d3.plaintext, 's-3');
  let state = d3.updatedState;

  const d1 = await ratchetDecryptMessage(state, p1.payload);
  assert.equal(d1.plaintext, 's-1');
  state = d1.updatedState;

  const d2 = await ratchetDecryptMessage(state, p2.payload);
  assert.equal(d2.plaintext, 's-2');
}

async function testPowValidity(): Promise<void> {
  const nonce = await P2PSignalingClient.solvePoWChallenge('test-prefix', 4);
  assert.ok(nonce >= 0);
  const hash = await sha256Hex(`test-prefix_${nonce}`);
  assert.ok(hash.startsWith('0000'), `hash ${hash} does not start with 0000`);

  // difficulty clamped to [1,6]
  const easy = await P2PSignalingClient.solvePoWChallenge('x', 1);
  const medium = await P2PSignalingClient.solvePoWChallenge('x', 4);
  assert.ok(easy >= 0 && medium >= 0);
}

async function testBackupEdgeCases(): Promise<void> {
  const identity = await createAnonymousIdentity();

  // wrong passphrase rejected
  const blob = await createEncryptedBackupBlob(
    {
      version: 2,
      identity,
      chatsMetadata: [],
      exportedAt: new Date().toISOString(),
    },
    'correct-passphrase'
  );
  const text = await blob.text();
  await assert.rejects(restoreEncryptedBackup(text, 'wrong-passphrase'), /Invalid passphrase/);

  // short passphrase rejected
  await assert.rejects(createEncryptedBackupBlob({ version: 2, identity, chatsMetadata: [], exportedAt: new Date().toISOString() }, 'short'), /at least 8 characters/);

  // corrupted payload rejected
  await assert.rejects(restoreEncryptedBackup('not valid json at all', 'correct-passphrase'));
}

async function main(): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['identity', testIdentity],
    ['kdf + aes', testKdfAndAes],
    ['identity sign/verify', testIdentitySignVerify],
    ['prekeys', testPreKeys],
    ['mnemonic determinism', testMnemonicDeterminism],
    ['X3DH + Double Ratchet', testX3DHAndRatchet],
    ['ratchet post-compromise security', testRatchetPcs],
    ['ratchet skipped keys', testRatchetSkippedKeys],
    ['out-of-order delivery', testOutOfOrder],
    ['tamper detection', testTamperDetection],
    ['TOTP', testTotp],
    ['Proof of Work', testPow],
    ['PoW validity', testPowValidity],
    ['P2P manager over mesh relay', testP2PManagerOverRelay],
    ['encrypted backup', testBackupRoundTrip],
    ['backup edge cases', testBackupEdgeCases],
  ];

  for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
  }
  console.log(`\n${tests.length} security self-tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
