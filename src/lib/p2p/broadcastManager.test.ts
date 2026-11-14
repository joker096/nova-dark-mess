import { describe, it, expect, vi } from 'vitest';
import { BroadcastManager } from './broadcastManager';

describe('BroadcastManager', () => {
  it('fans out to recipients and reports delivery', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const onDelivered = vi.fn();
    const manager = new BroadcastManager({ localFingerprint: 'me', sendToPeer: send, onDelivered });
    const id = await manager.send([{ id: '1', fingerprint: 'p1' }, { id: '2', fingerprint: 'p2' }], 'hi');
    expect(send).toHaveBeenCalledTimes(2);
    expect(onDelivered).toHaveBeenCalledTimes(2);
    expect(id).toContain('bc-');
  });

  it('reports failures', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    const onFailed = vi.fn();
    const manager = new BroadcastManager({ localFingerprint: 'me', sendToPeer: send, onFailed });
    await manager.send([{ id: '1', fingerprint: 'p1' }], 'hi');
    expect(onFailed).toHaveBeenCalledWith(expect.stringContaining('bc-'), 'p1', expect.any(Error));
  });
});
