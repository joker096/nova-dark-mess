import { describe, it, expect } from 'vitest';
import {
  ROUTING_VERSION,
  generateRoutingKeyPair,
  openRoutingEnvelope,
  routingPublicKey,
  sealRoutingEnvelope,
} from './routing';

describe('sealed routing envelope', () => {
  it('round-trips a relay command', async () => {
    const pair = generateRoutingKeyPair();
    const route = {
      action: 'enqueue' as const,
      queueId: 'q_0123456789abcdef0123456789abcdef',
      token: 'sender-token-that-must-not-leak',
      packet: 'cGFja2V0',
    };

    const envelope = await sealRoutingEnvelope(pair.publicKey, route);
    expect(envelope.v).toBe(ROUTING_VERSION);

    const opened = await openRoutingEnvelope(pair.privateKey, envelope);
    expect(opened).toMatchObject({ v: ROUTING_VERSION, ...route });
    expect(opened.iat).toBeGreaterThan(Date.now() - 5000);
    expect(opened.nonce.length).toBeGreaterThanOrEqual(16);
  });

  it('does not expose queue ids, tokens or packets in the serialized envelope', async () => {
    const pair = generateRoutingKeyPair();
    const route = {
      action: 'enqueue' as const,
      queueId: 'q_feedfacefeedfacefeedfacefeedface',
      token: 'token-value-visible-only-to-relay',
      packet: 'cGFja2V0LXBsYWludGV4dA==',
    };

    const serialized = JSON.stringify(await sealRoutingEnvelope(pair.publicKey, route));
    expect(serialized).not.toContain(route.queueId);
    expect(serialized).not.toContain(route.token);
    expect(serialized).not.toContain(route.packet);
  });

  it('rejects the wrong relay key', async () => {
    const pair = generateRoutingKeyPair();
    const other = generateRoutingKeyPair();
    const envelope = await sealRoutingEnvelope(pair.publicKey, {
      action: 'poll',
      queueId: 'q_0123456789abcdef0123456789abcdef',
      token: 'recipient-token',
      limit: 32,
    });

    await expect(openRoutingEnvelope(other.privateKey, envelope)).rejects.toThrow();
  });

  it('rejects a tampered envelope', async () => {
    const pair = generateRoutingKeyPair();
    const envelope = await sealRoutingEnvelope(pair.publicKey, {
      action: 'ack',
      queueId: 'q_0123456789abcdef0123456789abcdef',
      token: 'recipient-token',
      packetIds: ['p_1'],
    });
    const tampered = { ...envelope, ct: `${envelope.ct.slice(0, -4)}AAAA` };

    await expect(openRoutingEnvelope(pair.privateKey, tampered)).rejects.toThrow();
  });

  it('derives the pinned public key from the private key', () => {
    const pair = generateRoutingKeyPair();
    expect(routingPublicKey(pair.privateKey)).toBe(pair.publicKey);
  });
});
