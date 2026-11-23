/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  createSenderKey,
  createDistributionMessage,
  processDistributionMessage,
  senderKeyEncrypt,
  senderKeyDecrypt,
} from './senderKeys';

describe('senderKeys', () => {
  it('encrypts and decrypts a message round trip', async () => {
    const sender = createSenderKey();
    const recipientState = processDistributionMessage(createDistributionMessage(sender));

    const { message, state: senderState } = await senderKeyEncrypt(sender, 'hello group');
    const { plaintext, state: recipientState2 } = await senderKeyDecrypt(
      recipientState,
      message,
    );

    expect(plaintext).toBe('hello group');
    expect(senderState.iteration).toBe(1);
    expect(recipientState2.iteration).toBe(1);
  });

  it('handles multiple sequential messages', async () => {
    const sender = createSenderKey();
    let recipientState = processDistributionMessage(createDistributionMessage(sender));
    let senderState = sender;

    const texts = ['first', 'second', 'third'];
    for (const text of texts) {
      const enc = await senderKeyEncrypt(senderState, text);
      senderState = enc.state;
      const dec = await senderKeyDecrypt(recipientState, enc.message);
      recipientState = dec.state;
      expect(dec.plaintext).toBe(text);
    }
  });

  it('rejects a tampered signature', async () => {
    const sender = createSenderKey();
    const recipientState = processDistributionMessage(createDistributionMessage(sender));

    const { message } = await senderKeyEncrypt(sender, 'secret');
    // Flip the first character to a value it is guaranteed not to already be.
    // Replacing it with a fixed letter could leave the signature unchanged.
    const flip = message.signature[0] === 'A' ? 'B' : 'A';
    const tampered = { ...message, signature: `${flip}${message.signature.slice(1)}` };

    await expect(senderKeyDecrypt(recipientState, tampered)).rejects.toThrow();
  });

  it('rejects a tampered ciphertext', async () => {
    const sender = createSenderKey();
    const recipientState = processDistributionMessage(createDistributionMessage(sender));

    const { message } = await senderKeyEncrypt(sender, 'secret');
    const tampered = { ...message, ciphertext: message.ciphertext.slice(0, -4) + 'AAAA' };

    await expect(senderKeyDecrypt(recipientState, tampered)).rejects.toThrow();
  });

  it('rejects messages from an unknown key id', async () => {
    const sender = createSenderKey();
    const recipientState = processDistributionMessage(createDistributionMessage(sender));

    const { message } = await senderKeyEncrypt(sender, 'secret');
    const bad = { ...message, keyId: message.keyId + 1 };

    await expect(senderKeyDecrypt(recipientState, bad)).rejects.toThrow(/key id mismatch/i);
  });

  it('decrypts out-of-order messages using skipped keys', async () => {
    const sender = createSenderKey();
    let senderState = sender;
    let recipientState = processDistributionMessage(createDistributionMessage(sender));

    const messages = [];
    for (const text of ['first', 'second', 'third']) {
      const enc = await senderKeyEncrypt(senderState, text);
      senderState = enc.state;
      messages.push(enc.message);
    }

    // Deliver the newest message first, then the two older ones.
    const third = await senderKeyDecrypt(recipientState, messages[2]);
    recipientState = third.state;
    expect(third.plaintext).toBe('third');

    const first = await senderKeyDecrypt(recipientState, messages[0]);
    recipientState = first.state;
    expect(first.plaintext).toBe('first');

    const second = await senderKeyDecrypt(recipientState, messages[1]);
    expect(second.plaintext).toBe('second');
  });

  it('rejects a replayed skipped message', async () => {
    const sender = createSenderKey();
    let senderState = sender;
    let recipientState = processDistributionMessage(createDistributionMessage(sender));

    const first = await senderKeyEncrypt(senderState, 'first');
    senderState = first.state;
    const second = await senderKeyEncrypt(senderState, 'second');

    const decryptedSecond = await senderKeyDecrypt(recipientState, second.message);
    recipientState = decryptedSecond.state;
    const decryptedFirst = await senderKeyDecrypt(recipientState, first.message);
    expect(decryptedFirst.plaintext).toBe('first');

    await expect(senderKeyDecrypt(decryptedFirst.state, first.message)).rejects.toThrow(
      /already processed/i,
    );
  });

  it('cannot encrypt without a signing private key (remote state)', async () => {
    const sender = createSenderKey();
    const remote = processDistributionMessage(createDistributionMessage(sender));

    await expect(senderKeyEncrypt(remote, 'x')).rejects.toThrow();
  });
});
