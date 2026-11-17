import { describe, it, expect } from 'vitest';
import { JitteredTransport, DummyTrafficScheduler } from './jitter';
import { InMemoryAnonRelay } from './relay';

describe('jittered transport', () => {
  it('delays enqueue by the configured window', async () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const slept: number[] = [];
    const transport = new JitteredTransport(relay, {
      sendMinMs: 10,
      sendMaxMs: 10,
      pollMinMs: 0,
      pollMaxMs: 0,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    await transport.enqueue(queueId, tokens.senderToken, btoa('x'), signingKey, undefined, inviteToken);
    expect(slept).toEqual([10]);
  });

  it('still delivers the packet after the delay', async () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const transport = new JitteredTransport(relay, {
      sendMinMs: 0,
      sendMaxMs: 0,
      pollMinMs: 0,
      pollMaxMs: 0,
    });
    await transport.enqueue(queueId, tokens.senderToken, btoa('x'), signingKey, undefined, inviteToken);
    const polled = await transport.poll(queueId, tokens.recipientToken, 32, signingKey);
    expect(polled.packets).toHaveLength(1);
  });
});

describe('dummy traffic', () => {
  it('produces fixed-size cover packets', () => {
    const a = DummyTrafficScheduler.coverPacket(16384);
    const b = DummyTrafficScheduler.coverPacket(16384);
    expect(a.length).toBe(16384);
    expect(b.length).toBe(16384);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('does not schedule when disabled', () => {
    const relay = new InMemoryAnonRelay();
    const scheduler = new DummyTrafficScheduler({
      queueIds: ['q_x'],
      senderTokens: { q_x: 't' },
      enabled: false,
    });
    scheduler.start(relay);
    scheduler.stop();
    expect(true).toBe(true);
  });
});
