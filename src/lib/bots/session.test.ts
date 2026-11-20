import { describe, expect, it, vi } from 'vitest';
import { InMemoryBotStorage, type MessageSink } from './runtime';
import { BotSession } from './session';
import { createInitData, serializeInitData, verifyInitData } from './miniApp';
import type { BotOutgoingMessage, BotUpdate } from './types';

function messageUpdate(): BotUpdate {
  return {
    type: 'message',
    payload: {
      messageId: 'm1',
      chat: { id: 'chat1', kind: 'direct' },
      text: 'hello',
      isCommand: false,
      mentionsBot: false,
      from: 'fp_alice',
      timestamp: Date.now(),
    },
  };
}

describe('BotSession — blocked and disabled bots', () => {
  it('issues a stable per-bot secret for Mini App initData', async () => {
    const session = new BotSession(new InMemoryBotStorage());
    await session.ensureReady();

    const secret = await session.getWebAppSecret('echo');
    expect(secret).toMatch(/^[0-9a-f]{64}$/);

    const signed = createInitData('echo', 'me', secret!);
    expect(verifyInitData(serializeInitData(signed), secret!)).not.toBeNull();
    expect(await session.getWebAppSecret('echo')).toBe(secret);
    expect(await session.getWebAppSecret('missing-bot')).toBeNull();
  });

  it('loads local bot modules so installed bots answer', async () => {
    const sent: BotOutgoingMessage[] = [];
    const sink: MessageSink = {
      send: async (message) => { sent.push(message); },
      edit: async () => false,
      del: async () => false,
      answerCallback: async () => undefined,
      sendTyping: async () => undefined,
    };
    const session = new BotSession(new InMemoryBotStorage(), sink);
    await session.ensureReady();

    expect(session.deliverUpdate('echo', messageUpdate())).toBe(true);
    await vi.waitFor(() => {
      expect(sent.map((message) => message.text)).toContain('hello');
    });
  });

  it('stops delivering updates and callbacks while blocked', async () => {
    const session = new BotSession(new InMemoryBotStorage());
    await session.ensureReady();

    expect(session.deliverUpdate('echo', messageUpdate())).toBe(true);

    await session.setBlocked('echo', true);
    expect(session.isBlocked('echo')).toBe(true);
    expect(session.deliverUpdate('echo', messageUpdate())).toBe(false);
    expect(session.dispatchCallback('echo', 'chat1', 'm1', 'ping')).toBe(false);

    await session.setBlocked('echo', false);
    expect(session.isBlocked('echo')).toBe(false);
    expect(session.deliverUpdate('echo', messageUpdate())).toBe(true);
  });

  it('persists the block decision in the registry storage', async () => {
    const storage = new InMemoryBotStorage();
    const first = new BotSession(storage);
    await first.ensureReady();
    await first.setBlocked('novafather', true);

    const second = new BotSession(storage);
    await second.ensureReady();
    expect(second.isBlocked('novafather')).toBe(true);
  });

  it('drops updates for a disabled bot until it is enabled again', async () => {
    const session = new BotSession(new InMemoryBotStorage());
    await session.ensureReady();

    await session.setBotEnabled('echo', false);
    expect(session.deliverUpdate('echo', messageUpdate())).toBe(false);

    await session.setBotEnabled('echo', true);
    expect(session.deliverUpdate('echo', messageUpdate())).toBe(true);
  });

  it('does not treat unknown bots as blocked', async () => {
    const session = new BotSession(new InMemoryBotStorage());
    await session.ensureReady();

    expect(session.isBlocked('missing')).toBe(false);
    expect(session.deliverUpdate('missing', messageUpdate())).toBe(false);
  });
});
