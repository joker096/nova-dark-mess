/**
 * Chunked file transfer over a P2P data channel.
 *
 * Splits a file into fixed-size chunks, transmits them with per-chunk
 * acknowledgements, verifies the reassembled payload with SHA-256 and supports
 * resuming an interrupted transfer by re-requesting only the missing chunks.
 */

export interface FileTransferMeta {
  transferId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  sha256: string;
}

export type FileTransferMessage =
  | { type: 'file_meta'; meta: FileTransferMeta }
  | { type: 'file_chunk'; transferId: string; index: number; data: string }
  | { type: 'file_ack'; transferId: string; index: number }
  | { type: 'file_resume'; transferId: string; missing: number[] }
  | { type: 'file_complete'; transferId: string }
  | { type: 'file_abort'; transferId: string; reason?: string };

export interface FileTransferProgress {
  transferId: string;
  fileName: string;
  bytesTransferred: number;
  totalBytes: number;
  chunksReceived: number;
  totalChunks: number;
}

export interface FileTransferResult {
  transferId: string;
  fileName: string;
  data: Uint8Array;
  sha256: string;
}

export interface FileTransferOptions {
  chunkSize?: number;
  /** Hard cap for both outgoing and incoming files. Defaults to 100 MB. */
  maxFileSize?: number;
  sendToPeer?: (peerFingerprint: string, message: FileTransferMessage) => void | Promise<void>;
  onProgress?: (progress: FileTransferProgress) => void;
  onComplete?: (result: FileTransferResult) => void;
  onError?: (error: Error, transferId?: string) => void;
}

export const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_CHUNKS = 16_384;
const MAX_CHUNK_SIZE = 1024 * 1024;

interface OutgoingTransfer {
  meta: FileTransferMeta;
  recipient: string;
  data: Uint8Array;
  chunks: string[]; // base64
  acked: Set<number>;
  sent: Set<number>;
}

interface IncomingTransfer {
  meta: FileTransferMeta;
  peer: string;
  chunks: Map<number, Uint8Array>;
  received: Set<number>;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i]);
  return btoa(binary);
}

function base64ToBuffer(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class FileTransferManager {
  private readonly chunkSize: number;
  private readonly maxFileSize: number;
  private readonly sendToPeer?: FileTransferOptions['sendToPeer'];
  private readonly onProgress?: FileTransferOptions['onProgress'];
  private readonly onComplete?: FileTransferOptions['onComplete'];
  private readonly onError?: FileTransferOptions['onError'];

  private readonly outgoing = new Map<string, OutgoingTransfer>();
  private readonly incoming = new Map<string, IncomingTransfer>();

  constructor(options: FileTransferOptions = {}) {
    this.chunkSize = Math.min(Math.max(1, options.chunkSize ?? 64 * 1024), MAX_CHUNK_SIZE);
    this.maxFileSize = Math.max(0, options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE);
    this.sendToPeer = options.sendToPeer;
    this.onProgress = options.onProgress;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  public async startTransfer(
    recipient: string,
    fileName: string,
    data: Uint8Array,
  ): Promise<string> {
    if (data.length > this.maxFileSize) {
      const error = new Error(`File exceeds the ${this.maxFileSize} byte transfer limit`);
      this.onError?.(error);
      throw error;
    }

    const transferId = randomId();
    const totalChunks = Math.max(1, Math.ceil(data.length / this.chunkSize));
    if (totalChunks > MAX_CHUNKS) {
      const error = new Error('File requires too many chunks');
      this.onError?.(error);
      throw error;
    }
    const hash = await sha256Hex(data);

    const meta: FileTransferMeta = {
      transferId,
      fileName,
      fileSize: data.length,
      chunkSize: this.chunkSize,
      totalChunks,
      sha256: hash,
    };

    // Pre-slice chunks as base64.
    const chunks: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, data.length);
      chunks.push(bufferToBase64(data.slice(start, end)));
    }

    this.outgoing.set(transferId, {
      meta,
      recipient,
      data,
      chunks,
      acked: new Set(),
      sent: new Set(),
    });

    await this.sendToPeer?.(recipient, { type: 'file_meta', meta });
    await this.sendAllChunks(transferId);
    return transferId;
  }

  private async sendAllChunks(transferId: string): Promise<void> {
    const transfer = this.outgoing.get(transferId);
    if (!transfer) return;
    for (let i = 0; i < transfer.meta.totalChunks; i++) {
      if (transfer.sent.has(i)) continue;
      transfer.sent.add(i);
      await this.sendToPeer?.(transfer.recipient, {
        type: 'file_chunk',
        transferId,
        index: i,
        data: transfer.chunks[i],
      });
    }
  }

  public async handleIncoming(
    from: string,
    message: FileTransferMessage,
  ): Promise<void> {
    switch (message.type) {
      case 'file_meta': {
        const meta = message.meta;
        const invalid =
          !Number.isFinite(meta.fileSize) ||
          meta.fileSize < 0 ||
          meta.fileSize > this.maxFileSize ||
          meta.chunkSize <= 0 ||
          meta.chunkSize > MAX_CHUNK_SIZE ||
          meta.totalChunks <= 0 ||
          meta.totalChunks > MAX_CHUNKS ||
          meta.totalChunks !== Math.max(1, Math.ceil(meta.fileSize / meta.chunkSize));
        if (invalid) {
          await this.sendToPeer?.(from, {
            type: 'file_abort',
            transferId: meta.transferId,
            reason: 'invalid file metadata',
          });
          this.onError?.(new Error('Invalid file metadata'), meta.transferId);
          return;
        }
        if (this.incoming.has(meta.transferId)) {
          const incoming = this.incoming.get(meta.transferId)!;
          if (incoming.peer !== from) {
            await this.sendToPeer?.(from, {
              type: 'file_abort',
              transferId: meta.transferId,
              reason: 'transfer id belongs to another peer',
            });
            return;
          }
          // Resume: re-request missing chunks.
          const missing: number[] = [];
          for (let i = 0; i < meta.totalChunks; i++) {
            if (!incoming.received.has(i)) missing.push(i);
          }
          await this.sendToPeer?.(from, { type: 'file_resume', transferId: meta.transferId, missing });
          return;
        }
        this.incoming.set(meta.transferId, {
          meta,
          peer: from,
          chunks: new Map(),
          received: new Set(),
        });
        this.emitProgress(meta.transferId, 0, meta);
        break;
      }
      case 'file_chunk': {
        const incoming = this.incoming.get(message.transferId);
        if (!incoming) return;
        if (incoming.peer !== from) return;
        if (incoming.received.has(message.index)) return; // duplicate
        if (message.index < 0 || message.index >= incoming.meta.totalChunks) return;
        const chunk = base64ToBuffer(message.data);
        if (chunk.length > incoming.meta.chunkSize) {
          await this.sendToPeer?.(from, {
            type: 'file_abort',
            transferId: message.transferId,
            reason: 'chunk exceeds declared size',
          });
          this.incoming.delete(message.transferId);
          this.onError?.(new Error('Chunk exceeds declared size'), message.transferId);
          return;
        }
        incoming.chunks.set(message.index, chunk);
        incoming.received.add(message.index);
        await this.sendToPeer?.(from, {
          type: 'file_ack',
          transferId: message.transferId,
          index: message.index,
        });
        const bytes = this.receivedBytes(incoming);
        this.emitProgress(message.transferId, bytes, incoming.meta);
        if (incoming.received.size === incoming.meta.totalChunks) {
          await this.finalizeIncoming(incoming);
        }
        break;
      }
      case 'file_ack': {
        const outgoing = this.outgoing.get(message.transferId);
        if (!outgoing) return;
        outgoing.acked.add(message.index);
        break;
      }
      case 'file_resume': {
        const outgoing = this.outgoing.get(message.transferId);
        if (!outgoing) return;
        for (const index of message.missing) {
          if (!Number.isInteger(index) || index < 0 || index >= outgoing.meta.totalChunks) {
            continue;
          }
          outgoing.sent.delete(index);
        }
        // resend missing
        for (const index of message.missing) {
          if (!Number.isInteger(index) || index < 0 || index >= outgoing.meta.totalChunks) {
            continue;
          }
          outgoing.sent.add(index);
          await this.sendToPeer?.(outgoing.recipient, {
            type: 'file_chunk',
            transferId: message.transferId,
            index,
            data: outgoing.chunks[index],
          });
        }
        break;
      }
      case 'file_complete': {
        // no-op; already handled
        break;
      }
      case 'file_abort': {
        this.incoming.delete(message.transferId);
        this.outgoing.delete(message.transferId);
        this.onError?.(new Error(message.reason || 'Transfer aborted'), message.transferId);
        break;
      }
      default:
        break;
    }
  }

  private receivedBytes(incoming: IncomingTransfer): number {
    let total = 0;
    for (const chunk of incoming.chunks.values()) total += chunk.length;
    return total;
  }

  private emitProgress(transferId: string, bytes: number, meta: FileTransferMeta): void {
    this.onProgress?.({
      transferId,
      fileName: meta.fileName,
      bytesTransferred: bytes,
      totalBytes: meta.fileSize,
      chunksReceived: this.incoming.get(transferId)?.received.size ?? 0,
      totalChunks: meta.totalChunks,
    });
  }

  private async finalizeIncoming(incoming: IncomingTransfer): Promise<void> {
    const { meta } = incoming;
    // Reassemble.
    const data = new Uint8Array(meta.fileSize);
    let offset = 0;
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunk = incoming.chunks.get(i);
      if (!chunk) {
        this.onError?.(new Error('Missing chunk during finalization'), meta.transferId);
        return;
      }
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const actualSize = offset;
    const trimmed = data.slice(0, actualSize);
    const hash = await sha256Hex(trimmed);
    if (hash !== meta.sha256) {
      this.incoming.delete(meta.transferId);
      this.onError?.(new Error('SHA-256 mismatch'), meta.transferId);
      await this.sendToPeer?.(incoming.peer, { type: 'file_abort', transferId: meta.transferId, reason: 'hash mismatch' });
      return;
    }

    this.onComplete?.({
      transferId: meta.transferId,
      fileName: meta.fileName,
      data: trimmed,
      sha256: hash,
    });

    await this.sendToPeer?.(incoming.peer, { type: 'file_complete', transferId: meta.transferId });
  }

  /** Cancels an outgoing or incoming transfer and tells the peer to stop. */
  public async cancelTransfer(transferId: string, reason = 'cancelled'): Promise<void> {
    const outgoing = this.outgoing.get(transferId);
    const incoming = this.incoming.get(transferId);
    const peer = outgoing?.recipient ?? incoming?.peer;
    this.outgoing.delete(transferId);
    this.incoming.delete(transferId);
    if (peer) {
      await this.sendToPeer?.(peer, { type: 'file_abort', transferId, reason });
    }
  }

  public getIncoming(transferId: string): IncomingTransfer | undefined {
    return this.incoming.get(transferId);
  }

  public getOutgoing(transferId: string): OutgoingTransfer | undefined {
    return this.outgoing.get(transferId);
  }
}
