/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { bufferToBase64 } from '../crypto/aes';
import { sealMessageAsync, unsealMessageAsync } from './sealedSender';

describe('sealedSender', () => {
  it('round trips a sealed message', async () => {
    const priv = x25519.utils.randomSecretKey();
    const pub = x25519.getPublicKey(priv);

    const env = await sealMessageAsync(bufferToBase64(pub), 'hidden');
    const plain = await unsealMessageAsync(bufferToBase64(priv), env);
    expect(plain).toBe('hidden');
  });
});
