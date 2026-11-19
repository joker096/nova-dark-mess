/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPluginHost, type Plugin, type PluginEvent } from './pluginHost';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makePlugin(name: string, overrides: Partial<Plugin> = {}): Plugin {
  return {
    name,
    onRegister: overrides.onRegister,
    onEvent: overrides.onEvent,
    onUnregister: overrides.onUnregister,
  };
}

describe('createPluginHost', () => {
  it('registers and lists plugins', () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    const h1 = host.register(makePlugin('plugin-a'));
    const h2 = host.register(makePlugin('plugin-b'));

    expect(host.list()).toEqual(['plugin-a', 'plugin-b']);
    expect(h1.name).toBe('plugin-a');
    expect(h2.name).toBe('plugin-b');
  });

  it('rejects duplicate plugin names', () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    host.register(makePlugin('duplicate'));
    expect(() => host.register(makePlugin('duplicate'))).toThrow(
      "Plugin 'duplicate' is already registered",
    );
  });

  it('unregisters a plugin', () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    const handle1 = host.register(makePlugin('temp'));
    expect(host.list()).toContain('temp');
    const handle2 = host.register(makePlugin('temp2'));
    expect(host.list()).toContain('temp2');
    handle1.unregister();
    expect(host.list()).not.toContain('temp');
    handle2.unregister();
    expect(host.list()).toEqual([]);
  });

  it('calls onRegister with context', async () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    let ctx: any = null;
    const plugin = makePlugin('reg-test', {
      onRegister: (c) => {
        ctx = c;
        c.setConfig('key', 'value');
      },
    });
    host.register(plugin);
    expect(ctx).not.toBeNull();
    expect(ctx.getConfig('key')).toBe('value');
    expect(ctx.getConfig('missing')).toBeNull();
  });

  it('emits events to all registered plugins', async () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    const events: PluginEvent[] = [];
    const plugin = makePlugin('listener', {
      onEvent: (e) => {
        events.push(e);
      },
    });
    host.register(plugin);

    const event: PluginEvent = {
      type: 'message:send',
      chatId: 'chat-1',
      messageId: 'msg-1',
      timestamp: 12345,
    };
    await host.emit(event);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it('delivers webhooks through the context', async () => {
    const host = createPluginHost({ fetchImpl: fetchMock, webhookBaseUrl: 'http://localhost:9999' });
    let webhookCalled = false;
    const plugin = makePlugin('webhook-plugin', {
      onRegister: (ctx) => {
        void ctx.webhook('/hook', { event: 'test' }).then((ok) => {
          webhookCalled = ok;
        });
      },
    });
    host.register(plugin);

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:9999/hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test' }),
    });
    expect(webhookCalled).toBe(true);
  });

  it('webhook returns false on fetch failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const host = createPluginHost({ fetchImpl: fetchMock });
    let result = false;
    const plugin = makePlugin('wh-fail', {
      onRegister: async (ctx) => {
        result = await ctx.webhook('/hook', { x: 1 });
      },
    });
    host.register(plugin);
    await new Promise((r) => setTimeout(r, 0));
    expect(result).toBe(false);
  });

  it('context returns null for unknown plugin', () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    expect(host.context('nope')).toBeNull();
  });

  it('calls onUnregister when plugin is removed', async () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    let unregistered = false;
    const plugin = makePlugin('unreg', {
      onUnregister: () => {
        unregistered = true;
      },
    });
    const handle = host.register(plugin);
    handle.unregister();
    expect(unregistered).toBe(true);
  });

  it('isolates plugin config storage', () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    host.register(makePlugin('p1'));
    host.register(makePlugin('p2'));

    const c1 = host.context('p1')!;
    const c2 = host.context('p2')!;
    c1.setConfig('key', 'p1-value');
    c2.setConfig('key', 'p2-value');

    expect(c1.getConfig('key')).toBe('p1-value');
    expect(c2.getConfig('key')).toBe('p2-value');
  });

  it('emits events to multiple plugins', async () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    const eventsA: PluginEvent[] = [];
    const eventsB: PluginEvent[] = [];

    host.register(makePlugin('a', { onEvent: (e) => { eventsA.push(e); } }));
    host.register(makePlugin('b', { onEvent: (e) => { eventsB.push(e); } }));

    const event: PluginEvent = {
      type: 'contact:add',
      contactId: 'c1',
      timestamp: 999,
    };
    await host.emit(event);

    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(1);
    expect(eventsA[0]).toEqual(event);
    expect(eventsB[0]).toEqual(event);
  });

  it('continues emitting when one plugin throws', async () => {
    const host = createPluginHost({ fetchImpl: fetchMock });
    const events: PluginEvent[] = [];
    host.register(makePlugin('thrower', {
      onEvent: () => {
        throw new Error('boom');
      },
    }));
    host.register(makePlugin('listener', {
      onEvent: (e) => { events.push(e); },
    }));

    const event: PluginEvent = {
      type: 'call:start',
      callId: 'call-1',
      peerId: 'peer-1',
      timestamp: 5,
    };
    // Should not throw even though one plugin throws
    await expect(host.emit(event)).resolves.toBeUndefined();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });
});
