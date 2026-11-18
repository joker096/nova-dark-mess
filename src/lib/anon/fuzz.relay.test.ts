import { describe, it, expect } from 'vitest';
import { InMemoryAnonRelay } from './relay';
import { generateQueueSigningKeyPair, signQueueCommand, verifyQueueCommand } from './signing';
import type { QueueCommandAuth } from './signing';

/**
 * Phase J: relay commands are attacker-controlled input. These tests fuzz the
 * command parser/signature layer with deterministic pseudo-random mutations and
 * require that every rejection is an ordinary Error, never a crash or hang.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomString(rand: () => number, max = 48): string {
  const length = Math.floor(rand() * (max + 1));
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.=+/';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(rand() * alphabet.length)];
  }
  return out;
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/** Flip one bit in the payload part, so the decoded signature always changes. */
function mutate(rand: () => number, value: string): string {
  const bytes = fromBase64Url(value);
  if (bytes.length === 0) return 'x';
  const at = Math.floor(rand() * Math.max(1, bytes.length - 2));
  bytes[at] ^= 1 << Math.floor(rand() * 8);
  return toBase64Url(bytes);
}

describe('anon relay command fuzz', () => {
  it('verifying arbitrary commands and signatures never throws', () => {
    const rand = mulberry32(0xa110);
    const { publicKey } = generateQueueSigningKeyPair();
    for (let i = 0; i < 500; i++) {
      const command = {
        action: ['enqueue', 'poll', 'ack', 'delete_queue', 'nope'][Math.floor(rand() * 5)] as never,
        queueId: randomString(rand),
        token: randomString(rand),
        packet: randomString(rand),
        packetIds: Array.from({ length: Math.floor(rand() * 4) }, () => randomString(rand, 12)),
        limit: Math.floor(rand() * 1000) - 500,
        signedAt: Math.floor(rand() * 4_000_000_000_000),
        commandNonce: randomString(rand, 16),
      };
      const signature = randomString(rand, 96);
      expect(verifyQueueCommand(publicKey, command, signature)).toBe(false);
    }
  });

  it('arbitrary queue ids, tokens and payloads are rejected or stored opaquely', () => {
    const rand = mulberry32(0xb234);
    const relay = new InMemoryAnonRelay();
    const queue = relay.createQueue();

    for (let i = 0; i < 200; i++) {
      const action = Math.floor(rand() * 4);
      try {
        if (action === 0) {
          relay.enqueue(
            randomString(rand),
            randomString(rand),
            randomString(rand, 256),
            queue.signingKey,
          );
        } else if (action === 1) {
          relay.poll(randomString(rand), randomString(rand), Math.floor(rand() * 64));
        } else if (action === 2) {
          relay.ack(
            randomString(rand),
            randomString(rand),
            Array.from({ length: Math.floor(rand() * 5) }, () => randomString(rand, 12)),
          );
        } else {
          relay.deleteQueue(randomString(rand), randomString(rand));
        }
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    }
  });

  it('mutated valid signatures are always rejected, never throw', () => {
    const rand = mulberry32(0xc345);
    const { publicKey, privateKey } = generateQueueSigningKeyPair();
    const signedAt = Date.now();
    for (let i = 0; i < 100; i++) {
      const auth: QueueCommandAuth = signQueueCommand(privateKey, {
        action: 'enqueue',
        queueId: 'q_fuzz',
        token: 'tok_fuzz',
        packet: 'AA==',
        signedAt,
        commandNonce: `nonce-${i}`,
      });
      const mutated: QueueCommandAuth = {
        ...auth,
        signature: mutate(rand, auth.signature),
      };
      expect(
        verifyQueueCommand(
          publicKey,
          {
            action: 'enqueue',
            queueId: 'q_fuzz',
            token: 'tok_fuzz',
            packet: 'AA==',
            signedAt: mutated.signedAt,
            commandNonce: mutated.commandNonce,
          },
          mutated.signature,
        ),
      ).toBe(false);
    }
  });

  it('random command bodies never corrupt a queue', () => {
    const rand = mulberry32(0xd456);
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const first = relay.enqueue(
      queueId,
      tokens.senderToken,
      'Zmlyc3Q=',
      signingKey,
      undefined,
      inviteToken,
    );

    for (let i = 0; i < 100; i++) {
      try {
        relay.enqueue(
          queueId,
          tokens.senderToken,
          randomString(rand, 64),
          signingKey,
          rand() < 0.3 ? { nonce: Math.floor(rand() * 1e6), digest: randomString(rand) } : undefined,
        );
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    }

    const remaining = relay.poll(queueId, tokens.recipientToken, 100, signingKey);
    expect(remaining.packets.length).toBeGreaterThanOrEqual(1);
    expect(remaining.packets.some((packet) => packet.packetId === first.packetId)).toBe(true);
    expect(relay.ack(queueId, tokens.recipientToken, [first.packetId], signingKey)).toBe(true);
  });
});
