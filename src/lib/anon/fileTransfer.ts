/**
 * Fixed-size file transfer over anonymous queues (phase D).
 *
 * A file is split into chunks that are each encoded as a JSON envelope and sent
 * through `sendAnonMessage` with the `large` packet profile. Every relay-bound
 * packet therefore has the same size regardless of content; the receiving side
 * reassembles chunks and verifies the whole-file SHA-256 before surfacing it.
 */
export const FILE_ENVELOPE_TYPE = 'nova-anon-file';
/** Raw bytes per chunk; base64 + envelope overhead stays inside a 64 KiB packet. */
export const FILE_CHUNK_BYTES = 40 * 1024;
/** Chunk count must stay below the relay's per-queue packet cap. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_NAME = 200;
export const MAX_FILE_MIME = 128;

export interface FileEnvelope {
  type: typeof FILE_ENVELOPE_TYPE;
  transferId: string;
  name: string;
  mime: string;
  size: number;
  index: number;
  total: number;
  sha256: string;
  data: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (typeof value !== 'string') return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) out[index] = binary.charCodeAt(index);
    return out;
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeMeta(name: string, mime: string): { name: string; mime: string } | null {
  const trimmedName = name.trim().slice(0, MAX_FILE_NAME);
  const trimmedMime = (mime.trim() || 'application/octet-stream').slice(0, MAX_FILE_MIME);
  if (!trimmedName) return null;
  return { name: trimmedName, mime: trimmedMime };
}

export async function createFileEnvelopes(
  file: Uint8Array,
  name: string,
  mime: string,
): Promise<FileEnvelope[]> {
  if (file.length > MAX_FILE_BYTES) throw new Error('File is too large for anonymous transfer');
  const meta = sanitizeMeta(name, mime);
  if (!meta) throw new Error('File name is required');

  const total = Math.max(1, Math.ceil(file.length / FILE_CHUNK_BYTES));
  const transferId = `f_${crypto.randomUUID().replace(/-/g, '')}`;
  const sha256 = await sha256Hex(file);

  return Array.from({ length: total }, (_, index) => {
    const start = index * FILE_CHUNK_BYTES;
    const chunk = file.subarray(start, Math.min(start + FILE_CHUNK_BYTES, file.length));
    return {
      type: FILE_ENVELOPE_TYPE,
      transferId,
      name: meta.name,
      mime: meta.mime,
      size: file.length,
      index,
      total,
      sha256,
      data: toBase64Url(chunk),
    };
  });
}

export function parseFileEnvelope(body: string): FileEnvelope | null {
  if (!body.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(body) as Partial<FileEnvelope>;
    if (
      parsed.type !== FILE_ENVELOPE_TYPE ||
      typeof parsed.transferId !== 'string' ||
      !/^f_[0-9a-f]{32}$/.test(parsed.transferId) ||
      typeof parsed.name !== 'string' ||
      parsed.name.length === 0 ||
      parsed.name.length > MAX_FILE_NAME ||
      typeof parsed.mime !== 'string' ||
      parsed.mime.length > MAX_FILE_MIME ||
      typeof parsed.size !== 'number' ||
      !Number.isSafeInteger(parsed.size) ||
      parsed.size < 0 ||
      parsed.size > MAX_FILE_BYTES ||
      typeof parsed.index !== 'number' ||
      !Number.isSafeInteger(parsed.index) ||
      parsed.index < 0 ||
      typeof parsed.total !== 'number' ||
      !Number.isSafeInteger(parsed.total) ||
      parsed.total < 1 ||
      parsed.total > Math.ceil(MAX_FILE_BYTES / FILE_CHUNK_BYTES) ||
      parsed.index >= parsed.total ||
      typeof parsed.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(parsed.sha256) ||
      typeof parsed.data !== 'string'
    ) {
      return null;
    }
    const decoded = fromBase64Url(parsed.data);
    if (!decoded) return null;
    return parsed as FileEnvelope;
  } catch {
    return null;
  }
}

/**
 * Reassemble a complete transfer. Missing/duplicate chunks, mismatched metadata
 * or a SHA-256 mismatch reject the whole file.
 */
export async function assembleFile(envelopes: FileEnvelope[]): Promise<{
  name: string;
  mime: string;
  bytes: Uint8Array;
} | null> {
  if (envelopes.length === 0) return null;
  const first = envelopes[0];
  if (first.total !== envelopes.length || envelopes.length > Math.ceil(MAX_FILE_BYTES / FILE_CHUNK_BYTES)) {
    return null;
  }

  const chunks: Uint8Array[] = new Array(first.total);
  for (const envelope of envelopes) {
    if (
      envelope.transferId !== first.transferId ||
      envelope.name !== first.name ||
      envelope.mime !== first.mime ||
      envelope.size !== first.size ||
      envelope.total !== first.total ||
      envelope.sha256 !== first.sha256 ||
      chunks[envelope.index] !== undefined
    ) {
      return null;
    }
    const decoded = fromBase64Url(envelope.data);
    if (!decoded) return null;
    chunks[envelope.index] = decoded;
  }

  let size = 0;
  for (const chunk of chunks) {
    if (!chunk) return null;
    size += chunk.length;
  }
  if (size !== first.size) return null;

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if ((await sha256Hex(bytes)) !== first.sha256) return null;

  return { name: first.name, mime: first.mime, bytes };
}
