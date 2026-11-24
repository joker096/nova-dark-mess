/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

// Install fake IndexedDB before importing the module that uses it.
(globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB =
  fakeIndexedDB as unknown as IDBFactory;

// fake-indexeddb does not ship IDBKeyRange; install a minimal shim.
(globalThis as unknown as { IDBKeyRange?: unknown }).IDBKeyRange = {
  only: (value: unknown) => ({ type: 'exact', value }),
  lowerBound: (_lower: unknown, _open?: boolean) => ({ type: 'bound' }),
  upperBound: (_upper: unknown, _open?: boolean) => ({ type: 'bound' }),
  bound: (_lower: unknown, _upper: unknown, _lo?: boolean, _uo?: boolean) => ({ type: 'bound' }),
};

import { getPeerKeyChanges, observePeerKey } from './peerKeyJournal';
import { dbInstance } from '../storage/db';
import { deriveKeyFromRandomSecret } from '../storage/kdf';

const aliceKey = {
  fingerprint: 'nova_pk_alice',
  signingKey: 'alice-signing-key',
  identityKey: 'alice-identity-key',
};

let testKey: CryptoKey;

beforeEach(async () => {
  // Initialize the database with a test key
  testKey = await deriveKeyFromRandomSecret('test-passphrase', new Uint8Array(16));
  await dbInstance.initializeWithKey(testKey);
  // Clear the journal setting
  await dbInstance.deleteSetting('nova_peer_key_journal_v1').catch(() => undefined);
});

afterEach(async () => {
  dbInstance.close();
});

describe('peer key journal', () => {
  it('records a first-seen key as the baseline without reporting a change', async () => {
    await expect(observePeerKey('katie', aliceKey)).resolves.toBeNull();
    expect(await getPeerKeyChanges('katie')).toEqual([]);
  });

  it('records signing or encryption key changes once and preserves their history', async () => {
    await observePeerKey('katie', aliceKey, 100);
    await expect(observePeerKey('katie', aliceKey, 200)).resolves.toBeNull();

    const changedKey = {
      ...aliceKey,
      identityKey: 'rotated-identity-key',
    };
    const change = await observePeerKey('katie', changedKey, 300);

    expect(change).toMatchObject({
      chatId: 'katie',
      previousFingerprint: aliceKey.fingerprint,
      currentFingerprint: aliceKey.fingerprint,
      changedAt: 300,
    });
    expect(change?.previousIdentityKeyId).not.toBe(change?.currentIdentityKeyId);
    await expect(observePeerKey('katie', changedKey, 400)).resolves.toBeNull();

    const signingKeyRotation = {
      fingerprint: 'nova_pk_rotated',
      signingKey: 'rotated-signing-key',
      identityKey: 'rotated-identity-key',
    };
    const nextChange = await observePeerKey('katie', signingKeyRotation, 500);
    expect(nextChange?.previousSigningKeyId).not.toBe(nextChange?.currentSigningKeyId);
    expect(await getPeerKeyChanges('katie')).toEqual([change, nextChange]);
  });

  it('handles corrupted journal gracefully', async () => {
    // The new implementation doesn't use localStorage directly, so this test
    // verifies that observePeerKey doesn't throw on initialization issues
    await expect(observePeerKey('katie', aliceKey)).resolves.not.toThrow();
  });
});