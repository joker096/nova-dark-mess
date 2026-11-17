/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it } from 'vitest';
import { getPeerKeyChanges, observePeerKey } from './peerKeyJournal';

const aliceKey = {
  fingerprint: 'nova_pk_alice',
  signingKey: 'alice-signing-key',
  identityKey: 'alice-identity-key',
};

afterEach(() => {
  localStorage.clear();
});

describe('peer key journal', () => {
  it('records a first-seen key as the baseline without reporting a change', async () => {
    await expect(observePeerKey('katie', aliceKey)).resolves.toBeNull();
    expect(getPeerKeyChanges('katie')).toEqual([]);
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
    expect(getPeerKeyChanges('katie')).toEqual([change, nextChange]);
  });

  it('refuses to replace a corrupted journal', async () => {
    localStorage.setItem('nova_peer_key_journal_v1', '{invalid');
    await expect(observePeerKey('katie', aliceKey)).rejects.toThrow('corrupted');
    expect(localStorage.getItem('nova_peer_key_journal_v1')).toBe('{invalid');
  });
});
