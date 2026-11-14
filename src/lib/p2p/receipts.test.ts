import { describe, it, expect, vi } from 'vitest';
import { ReceiptManager } from './receipts';

describe('ReceiptManager', () => {
  it('sends receipts to peer', async () => {
    const send = vi.fn();
    const manager = new ReceiptManager({ localFingerprint: 'me', sendToPeer: send });
    await manager.sendReceipt('peer', 'chat1', 'read', 'm1');
    expect(send).toHaveBeenCalledWith('peer', expect.objectContaining({ type: 'read', messageId: 'm1', recipientFingerprint: 'peer' }));
  });

  it('handles incoming signals for local recipient', () => {
    const onSignal = vi.fn();
    const manager = new ReceiptManager({ localFingerprint: 'me', onSignal });
    manager.handleIncoming({ type: 'typing', chatId: 'chat1', senderFingerprint: 'peer', recipientFingerprint: 'me', timestamp: 1 });
    expect(onSignal).toHaveBeenCalled();
  });

  it('ignores signals not addressed to local recipient', () => {
    const onSignal = vi.fn();
    const manager = new ReceiptManager({ localFingerprint: 'me', onSignal });
    manager.handleIncoming({ type: 'typing', chatId: 'chat1', senderFingerprint: 'peer', recipientFingerprint: 'other', timestamp: 1 });
    expect(onSignal).not.toHaveBeenCalled();
  });
});
