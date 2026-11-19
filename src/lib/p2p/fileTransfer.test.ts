import { describe, it, expect, vi } from 'vitest';
import { FileTransferManager, type SerializedTransferState } from './fileTransfer';

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

describe('FileTransferManager persistence (cross-restart resumption)', () => {
  const encoder = new TextEncoder();

  function makePersistence() {
    let state: SerializedTransferState | null = null;
    return {
      state,
      saveState: vi.fn(async (s: SerializedTransferState) => { state = s; }),
      loadState: vi.fn(async () => state),
      clearState: vi.fn(async () => { state = null; }),
      getState: () => state,
    };
  }

  it('saves state after starting an outgoing transfer', async () => {
    const p = makePersistence();
    const send = vi.fn();
    const manager = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    await manager.startTransfer('peer', 'hello.txt', encoder.encode('hello world'));

    expect(p.saveState).toHaveBeenCalled();
    const saved = p.getState();
    expect(saved!.outgoing).toHaveLength(1);
    expect(saved!.outgoing[0].meta.fileName).toBe('hello.txt');
    expect(saved!.outgoing[0].chunks).toHaveLength(3);
    expect(saved!.incoming).toHaveLength(0);
  });

  it('restores outgoing transfer state on construction', async () => {
    const p = makePersistence();
    const send = vi.fn();

    // First manager: start a transfer and save state.
    const manager1 = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    await manager1.startTransfer('peer', 'hello.txt', encoder.encode('hello world'));
    await new Promise((r) => setTimeout(r, 0)); // let saveState complete

    // Second manager: load the saved state.
    const manager2 = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    await new Promise((r) => setTimeout(r, 0)); // let loadState complete

    expect(manager2.getAllTransferIds()).toContain(manager1.getAllTransferIds()[0]);
    const outgoing = manager2.getOutgoing(manager1.getAllTransferIds()[0]);
    expect(outgoing).not.toBeUndefined();
    expect(outgoing!.meta.fileName).toBe('hello.txt');
  });

  it('resumes outgoing transfer by re-sending un-acked chunks', async () => {
    const p = makePersistence();
    const send = vi.fn();

    const manager1 = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    const id = await manager1.startTransfer('peer', 'hello.txt', encoder.encode('hello world'));
    await new Promise((r) => setTimeout(r, 0));

    // Simulate an ack for chunk 0 only, then restart.
    const outgoing1 = manager1.getOutgoing(id)!;
    outgoing1.acked.add(0);
    await manager1.markDirty();

    const manager2 = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    await new Promise((r) => setTimeout(r, 0));

    // Resume: should re-send chunks 1 and 2 (not chunk 0 which is acked).
    send.mockClear();
    await manager2.resumeTransfer(id);
    const chunkCalls = send.mock.calls.filter(([, msg]) => msg.type === 'file_chunk');
    const resentIndexes = chunkCalls.map(([, msg]) => msg.index).sort();
    expect(resentIndexes).toEqual([1, 2]);
  });

  it('saves and restores incoming transfer state', async () => {
    const p = makePersistence();
    const send = vi.fn();

    const sender = new FileTransferManager({ chunkSize: 4, sendToPeer: send });
    const onComplete = vi.fn();
    const receiver = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
      onComplete,
    });

    const id = await sender.startTransfer('peer', 'hello.txt', encoder.encode('hello world'));
    const calls = send.mock.calls.map(([, msg]) => msg);
    const meta = calls.find((msg) => msg.type === 'file_meta').meta;
    const chunks = calls.filter((msg) => msg.type === 'file_chunk');

    // Receiver gets meta and first chunk only.
    await receiver.handleIncoming('peer', { type: 'file_meta', meta });
    await receiver.handleIncoming('peer', chunks[0]);
    await new Promise((r) => setTimeout(r, 0)); // let saveState complete

    // New manager loads the partial state.
    const receiver2 = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(receiver2.getAllTransferIds()).toContain(id);
    const incoming = receiver2.getIncoming(id);
    expect(incoming).not.toBeUndefined();
    expect(incoming!.received.size).toBe(1);
    expect(incoming!.received.has(0)).toBe(true);
    expect(incoming!.received.has(1)).toBe(false);
  });

  it('resumes incoming transfer by sending file_resume for missing chunks', async () => {
    const p = makePersistence();
    const send = vi.fn();

    const manager = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    const meta = {
      transferId: 't1',
      fileName: 'a.bin',
      fileSize: 8,
      chunkSize: 4,
      totalChunks: 2,
      sha256: 'x',
    };
    await manager.handleIncoming('peer', { type: 'file_meta', meta });
    await manager.handleIncoming('peer', { type: 'file_chunk', transferId: 't1', index: 0, data: btoa('abcd') });
    await new Promise((r) => setTimeout(r, 0));
    send.mockClear();

    const manager2 = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    await new Promise((r) => setTimeout(r, 0));

    await manager2.resumeTransfer('t1');
    expect(send).toHaveBeenCalledWith('peer', {
      type: 'file_resume',
      transferId: 't1',
      missing: [1],
    });
  });

  it('getAllTransferIds returns both outgoing and incoming IDs', async () => {
    const p = makePersistence();
    const send = vi.fn();
    const manager = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    await manager.startTransfer('peer', 'a.txt', encoder.encode('abcd'));
    await new Promise((r) => setTimeout(r, 0));

    const meta = {
      transferId: 't2',
      fileName: 'b.bin',
      fileSize: 4,
      chunkSize: 4,
      totalChunks: 1,
      sha256: 'x',
    };
    await manager.handleIncoming('peer', { type: 'file_meta', meta });
    await new Promise((r) => setTimeout(r, 0));

    const ids = manager.getAllTransferIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain(manager.getOutgoing(ids.find((i) => i !== 't2')!)!.meta.transferId);
    expect(ids).toContain('t2');
  });

  it('clearAllTransfers removes all state and calls persistence clear', async () => {
    const p = makePersistence();
    const send = vi.fn();
    const manager = new FileTransferManager({
      chunkSize: 4,
      sendToPeer: send,
      persistence: p,
    });
    await manager.startTransfer('peer', 'a.txt', encoder.encode('abcd'));
    await new Promise((r) => setTimeout(r, 0));

    await manager.clearAllTransfers();
    expect(manager.getAllTransferIds()).toHaveLength(0);
    expect(p.clearState).toHaveBeenCalled();
  });
});
