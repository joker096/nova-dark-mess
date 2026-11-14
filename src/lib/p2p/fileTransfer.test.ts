import { describe, it, expect, vi } from 'vitest';
import { FileTransferManager } from './fileTransfer';

const encoder = new TextEncoder();

describe('FileTransferManager', () => {
  it('sends metadata and chunks', async () => {
    const send = vi.fn();
    const manager = new FileTransferManager({ chunkSize: 4, sendToPeer: send });
    const id = await manager.startTransfer('peer', 'hello.txt', encoder.encode('hello world'));

    expect(id).toHaveLength(24);
    const metaCall = send.mock.calls.find(([, msg]) => msg.type === 'file_meta');
    expect(metaCall?.[1].meta.totalChunks).toBe(3);
    expect(send.mock.calls.filter(([, msg]) => msg.type === 'file_chunk')).toHaveLength(3);
  });

  it('reassembles chunks and verifies sha256', async () => {
    const send = vi.fn();
    const manager = new FileTransferManager({ chunkSize: 4, sendToPeer: send });
    const onComplete = vi.fn();
    const receiver = new FileTransferManager({ chunkSize: 4, sendToPeer: send, onComplete });

    const id = await manager.startTransfer('peer', 'hello.txt', encoder.encode('hello world'));
    const calls = send.mock.calls.map(([, msg]) => msg);
    const meta = calls.find((msg) => msg.type === 'file_meta').meta;
    const chunks = calls.filter((msg) => msg.type === 'file_chunk');

    await receiver.handleIncoming('peer', { type: 'file_meta', meta });
    for (const chunk of chunks) {
      await receiver.handleIncoming('peer', chunk);
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(new TextDecoder().decode(result.data)).toBe('hello world');
    expect(result.transferId).toBe(id);
    expect(send).toHaveBeenCalledWith('peer', expect.objectContaining({ type: 'file_complete', transferId: id }));
  });

  it('requests missing chunks on resume', async () => {
    const send = vi.fn();
    const manager = new FileTransferManager({ sendToPeer: send });
    const meta = {
      transferId: 't1',
      fileName: 'a.bin',
      fileSize: 8,
      chunkSize: 4,
      totalChunks: 2,
      sha256: 'x',
    };

    await manager.handleIncoming('peer', { type: 'file_meta', meta });
    await manager.handleIncoming('peer', { type: 'file_meta', meta });
    expect(send).toHaveBeenCalledWith('peer', { type: 'file_resume', transferId: 't1', missing: [0, 1] });
  });

  it('rejects outgoing files over the configured size limit', async () => {
    const send = vi.fn();
    const onError = vi.fn();
    const manager = new FileTransferManager({ maxFileSize: 4, sendToPeer: send, onError });

    await expect(
      manager.startTransfer('peer', 'big.bin', encoder.encode('12345')),
    ).rejects.toThrow(/limit/i);
    expect(send).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('rejects incoming metadata that exceeds the size limit', async () => {
    const send = vi.fn();
    const onError = vi.fn();
    const manager = new FileTransferManager({ maxFileSize: 10, sendToPeer: send, onError });

    await manager.handleIncoming('peer', {
      type: 'file_meta',
      meta: {
        transferId: 't1',
        fileName: 'huge.bin',
        fileSize: 11,
        chunkSize: 4,
        totalChunks: 3,
        sha256: 'x',
      },
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), 't1');
    expect(send).toHaveBeenCalledWith(
      'peer',
      expect.objectContaining({ type: 'file_abort', transferId: 't1' }),
    );
    expect(manager.getIncoming('t1')).toBeUndefined();
  });

  it('aborts when a chunk is larger than declared', async () => {
    const send = vi.fn();
    const onError = vi.fn();
    const manager = new FileTransferManager({ sendToPeer: send, onError });

    await manager.handleIncoming('peer', {
      type: 'file_meta',
      meta: {
        transferId: 't1',
        fileName: 'a.bin',
        fileSize: 4,
        chunkSize: 4,
        totalChunks: 1,
        sha256: 'x',
      },
    });
    await manager.handleIncoming('peer', {
      type: 'file_chunk',
      transferId: 't1',
      index: 0,
      data: btoa('12345678'),
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), 't1');
    expect(manager.getIncoming('t1')).toBeUndefined();
  });

  it('cancels a transfer and tells the peer', async () => {
    const send = vi.fn();
    const manager = new FileTransferManager({ chunkSize: 4, sendToPeer: send });
    const id = await manager.startTransfer('peer', 'a.txt', encoder.encode('abcd'));
    send.mockClear();

    await manager.cancelTransfer(id, 'user cancelled');

    expect(manager.getOutgoing(id)).toBeUndefined();
    expect(send).toHaveBeenCalledWith('peer', {
      type: 'file_abort',
      transferId: id,
      reason: 'user cancelled',
    });
  });

  it('ignores out-of-range resume indexes', async () => {
    const send = vi.fn();
    const manager = new FileTransferManager({ chunkSize: 4, sendToPeer: send });
    const id = await manager.startTransfer('peer', 'a.txt', encoder.encode('abcdefgh'));
    send.mockClear();

    await manager.handleIncoming('peer', {
      type: 'file_resume',
      transferId: id,
      missing: [-1, 99],
    });

    expect(send).not.toHaveBeenCalled();
  });

  it('aborts on hash mismatch and notifies the actual peer', async () => {
    const send = vi.fn();
    const onError = vi.fn();
    const manager = new FileTransferManager({ sendToPeer: send, onError });
    const meta = {
      transferId: 't1',
      fileName: 'a.bin',
      fileSize: 4,
      chunkSize: 4,
      totalChunks: 1,
      sha256: 'bad',
    };

    await manager.handleIncoming('peer-x', { type: 'file_meta', meta });
    await manager.handleIncoming('peer-x', {
      type: 'file_chunk',
      transferId: 't1',
      index: 0,
      data: btoa('abcd'),
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), 't1');
    expect(send).toHaveBeenCalledWith('peer-x', expect.objectContaining({ type: 'file_abort', transferId: 't1' }));
  });
});
