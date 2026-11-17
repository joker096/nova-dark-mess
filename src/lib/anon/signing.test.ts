import { describe, expect, it } from 'vitest';
import {
  generateQueueSigningKeyPair,
  isQueuePrivateKey,
  isQueuePublicKey,
  queueCommandMessage,
  queueSigningPublicKey,
  signQueueCommand,
  verifyQueueCommand,
} from './signing';

describe('queue command signing', () => {
  it('generates a valid Ed25519 key pair', () => {
    const pair = generateQueueSigningKeyPair();
    expect(isQueuePrivateKey(pair.privateKey)).toBe(true);
    expect(isQueuePublicKey(pair.publicKey)).toBe(true);
    expect(queueSigningPublicKey(pair.privateKey)).toBe(pair.publicKey);
  });

  it('rejects malformed keys', () => {
    expect(isQueuePrivateKey('')).toBe(false);
    expect(isQueuePublicKey('not-a-key')).toBe(false);
    expect(isQueuePrivateKey('AAAA')).toBe(false);
  });

  it('signs and verifies an enqueue command', () => {
    const pair = generateQueueSigningKeyPair();
    const command = {
      action: 'enqueue' as const,
      queueId: 'q_test',
      token: 'sender-token',
      packet: 'payload',
    };
    const auth = signQueueCommand(pair.privateKey, command);
    expect(auth.signature).toBeTruthy();
    expect(auth.signedAt).toBeTypeOf('number');
    expect(auth.commandNonce).toBeTruthy();
    expect(verifyQueueCommand(pair.publicKey, { ...command, ...auth }, auth.signature)).toBe(true);
  });

  it('rejects a tampered command', () => {
    const pair = generateQueueSigningKeyPair();
    const auth = signQueueCommand(pair.privateKey, {
      action: 'enqueue',
      queueId: 'q_test',
      token: 'sender-token',
      packet: 'payload',
    });
    const tampered = {
      action: 'enqueue' as const,
      queueId: 'q_test',
      token: 'sender-token',
      packet: 'other-payload',
      ...auth,
    };
    expect(verifyQueueCommand(pair.publicKey, tampered, auth.signature)).toBe(false);
  });

  it('rejects a signature from another key', () => {
    const signer = generateQueueSigningKeyPair();
    const other = generateQueueSigningKeyPair();
    const command = {
      action: 'poll' as const,
      queueId: 'q_test',
      token: 'recipient-token',
      limit: 5,
    };
    const auth = signQueueCommand(signer.privateKey, command);
    expect(verifyQueueCommand(other.publicKey, { ...command, ...auth }, auth.signature)).toBe(false);
  });

  it('uses supplied timestamp and nonce', () => {
    const pair = generateQueueSigningKeyPair();
    const auth = signQueueCommand(pair.privateKey, {
      action: 'ack',
      queueId: 'q_test',
      token: 'recipient-token',
      packetIds: ['p_1'],
      signedAt: 123,
      commandNonce: 'nonce-1',
    });
    expect(auth.signedAt).toBe(123);
    expect(auth.commandNonce).toBe('nonce-1');
  });

  it('builds a stable canonical message per action', () => {
    const base = {
      queueId: 'q_test',
      token: 'token',
      signedAt: 123,
      commandNonce: 'nonce',
    };
    expect(queueCommandMessage({ ...base, action: 'enqueue', packet: 'payload' })).toContain(
      '"action":"enqueue"',
    );
    expect(() => queueCommandMessage({ ...base, action: 'unknown' as never })).toThrow(
      /unknown queue command/i,
    );
  });
});
