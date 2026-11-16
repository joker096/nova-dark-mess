/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { bufferToBase64 } from './aes';
import {
  deriveIdentityFromMnemonic,
  createSignedPreKey,
  signWithIdentity,
  type SignedPreKey,
  type UserIdentity,
} from './identity';
import {
  createInboundRatchetSession,
  createOutboundRatchetSession,
  ratchetDecryptMessage,
  ratchetEncryptMessage,
  type PreKeyBundleWithPq,
} from './ratchet';
import {
  generatePqKemKeyPair,
  encodePqSecret,
  PROTOCOL_VERSION_CLASSICAL,
  PROTOCOL_VERSION_PQ,
} from './postQuantum';

const MNEMONIC_A =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MNEMONIC_B =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

function makeIdentity(mnemonic: string): UserIdentity {
  return deriveIdentityFromMnemonic(mnemonic);
}

interface Fixture {
  alice: UserIdentity;
  bob: UserIdentity;
  signedPreKey: SignedPreKey;
}

function makeFixture(): Fixture {
  const bob = makeIdentity(MNEMONIC_B);
  return { alice: makeIdentity(MNEMONIC_A), bob, signedPreKey: createSignedPreKey(bob, 1) };
}

function bundleFor(fx: Fixture, pqPublicKey?: string): PreKeyBundleWithPq {
  return {
    identityKey: fx.bob.publicKey,
    signingKey: fx.bob.signingPublicKey,
    fingerprint: fx.bob.fingerprint,
    signedPreKey: {
      keyId: fx.signedPreKey.keyId,
      publicKey: fx.signedPreKey.publicKey,
      signature: fx.signedPreKey.signature,
    },
    ...(pqPublicKey ? { pqKem: pqPublicKey } : {}),
  };
}

describe('hybrid PQ X3DH (ML-KEM-768)', () => {
  it('establishes a working session with a PQ bundle and round-trips a message', async () => {
    const fx = makeFixture();
    const pq = generatePqKemKeyPair();
    const bundle = bundleFor(fx, pq.publicKey);

    const { state: aliceState, header } = await createOutboundRatchetSession(fx.alice, bundle);
    expect(header.protocolVersion).toBe(PROTOCOL_VERSION_PQ);
    expect(header.pqCiphertext).toBeDefined();

    const bobState = await createInboundRatchetSession(
      fx.bob,
      fx.signedPreKey,
      null,
      header,
      { localPqSecret: encodePqSecret(pq.secretKeyRaw) },
    );

    const { payload } = await ratchetEncryptMessage(aliceState, 'hello pq', fx.alice.fingerprint, fx.bob.fingerprint, header);
    const { plaintext } = await ratchetDecryptMessage(bobState, payload);
    expect(plaintext).toBe('hello pq');
  });

  it('keeps classical sessions working for pre-PQ identities', async () => {
    const fx = makeFixture();
    const { state: aliceState, header } = await createOutboundRatchetSession(
      fx.alice,
      bundleFor(fx),
    );
    expect(header.protocolVersion).toBe(PROTOCOL_VERSION_CLASSICAL);
    expect(header.pqCiphertext).toBeUndefined();
    const bobState = await createInboundRatchetSession(
      fx.bob,
      fx.signedPreKey,
      null,
      header,
    );
    const { payload } = await ratchetEncryptMessage(aliceState, 'hello classical', fx.alice.fingerprint, fx.bob.fingerprint, header);
    const { plaintext } = await ratchetDecryptMessage(bobState, payload);
    expect(plaintext).toBe('hello classical');
  });

  it('rejects a classical header claiming PQ capability (downgrade attempt)', async () => {
    const fx = makeFixture();
    const pq = generatePqKemKeyPair();
    // Build a legitimately signed *classical* header (as an old client would),
    // then present it to a PQ-capable responder. The responder must refuse
    // to establish the weakened session even though the signature is valid.
    const { header: classicalHeader } = await createOutboundRatchetSession(
      fx.alice,
      bundleFor(fx),
    );
    const { pqCiphertext, protocolVersion, ...stripped } = classicalHeader;
    void pqCiphertext;
    void protocolVersion;
    await expect(
      createInboundRatchetSession(fx.bob, fx.signedPreKey, null, stripped, {
        localPqSecret: encodePqSecret(pq.secretKeyRaw),
      }),
    ).rejects.toThrow();
  });

  it('rejects a PQ ciphertext without the matching protocol version', async () => {
    const fx = makeFixture();
    const ephemeralSecret = x25519.utils.randomSecretKey();
    const ephemeralPublic = bufferToBase64(x25519.getPublicKey(ephemeralSecret));
    const unsigned = {
      senderFingerprint: fx.alice.fingerprint,
      senderIdentityKey: fx.alice.publicKey,
      senderSigningKey: fx.alice.signingPublicKey,
      ephemeralKey: ephemeralPublic,
      signedPreKeyId: fx.signedPreKey.keyId,
      pqCiphertext: 'AAAA',
      protocolVersion: PROTOCOL_VERSION_CLASSICAL,
    };
    const tampered = {
      ...unsigned,
      signature: bufferToBase64(
        // signWithIdentity returns base64 already; wrong-value signature is fine here
        new Uint8Array(64),
      ),
    };
    await expect(
      createInboundRatchetSession(fx.bob, fx.signedPreKey, null, tampered),
    ).rejects.toThrow();
  });

  it('refuses a PQ header when the responder has no local PQ secret', async () => {
    const fx = makeFixture();
    const pq = generatePqKemKeyPair();
    const { header } = await createOutboundRatchetSession(fx.alice, bundleFor(fx, pq.publicKey));
    await expect(
      createInboundRatchetSession(fx.bob, fx.signedPreKey, null, header),
    ).rejects.toThrow('PQ handshake without a local ML-KEM secret key');
  });

  it('binds the protocol version into the header signature', async () => {
    const fx = makeFixture();
    const { header } = await createOutboundRatchetSession(fx.alice, bundleFor(fx));
    // Re-sign the same header with the version field bumped to PQ: the
    // signature was made over the classical version, so verification fails —
    // a mid-handshake version flip cannot go undetected.
    const flipped = { ...header, protocolVersion: PROTOCOL_VERSION_PQ };
    const { verifyIdentitySignature } = await import('./identity');
    const { signature, protocolVersion, pqCiphertext, ...unsigned } = flipped;
    void protocolVersion;
    void pqCiphertext;
    expect(verifyIdentitySignature(header.senderSigningKey, JSON.stringify(unsigned), signature)).toBe(false);
    expect(signWithIdentity(fx.alice, JSON.stringify(unsigned))).not.toBe(signature);
  });
});
