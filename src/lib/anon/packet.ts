import { ANON_PACKET_PROFILES, type PacketProfile } from './types';

export function profileSize(profile: PacketProfile): number {
  return ANON_PACKET_PROFILES[profile];
}

export function encodeFixedPacket(plaintext: Uint8Array, profile: PacketProfile): Uint8Array {
  const size = profileSize(profile);
  if (plaintext.length + 4 > size) {
    throw new Error(`Payload too large for ${profile} profile`);
  }
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, plaintext.length, false);
  out.set(plaintext, 4);
  crypto.getRandomValues(out.subarray(4 + plaintext.length));
  return out;
}

export interface FixedFileChunk {
  index: number;
  total: number;
  packet: Uint8Array;
}

export function encodeFixedFileChunks(file: Uint8Array, profile: PacketProfile): FixedFileChunk[] {
  const chunkSize = profileSize(profile) - 4;
  const total = Math.max(1, Math.ceil(file.length / chunkSize));
  return Array.from({ length: total }, (_, index) => {
    const start = index * chunkSize;
    return {
      index,
      total,
      packet: encodeFixedPacket(file.subarray(start, Math.min(start + chunkSize, file.length)), profile),
    };
  });
}

export function decodeFixedFileChunks(chunks: FixedFileChunk[], profile: PacketProfile): Uint8Array {
  if (chunks.length === 0) throw new Error('No file chunks');
  const total = chunks[0].total;
  if (!Number.isSafeInteger(total) || total < 1 || chunks.length !== total) {
    throw new Error('Invalid file chunk count');
  }

  const ordered: Uint8Array[] = new Array(total);
  for (const chunk of chunks) {
    if (
      chunk.total !== total ||
      !Number.isSafeInteger(chunk.index) ||
      chunk.index < 0 ||
      chunk.index >= total ||
      ordered[chunk.index] !== undefined
    ) {
      throw new Error('Invalid file chunk metadata');
    }
    ordered[chunk.index] = decodeFixedPacket(chunk.packet, profile);
  }

  const maxChunkSize = profileSize(profile) - 4;
  let fileSize = 0;
  ordered.forEach((bytes, index) => {
    if (index < total - 1 && bytes.length !== maxChunkSize) {
      throw new Error('Invalid non-final file chunk size');
    }
    fileSize += bytes.length;
  });

  const file = new Uint8Array(fileSize);
  let offset = 0;
  for (const bytes of ordered) {
    file.set(bytes, offset);
    offset += bytes.length;
  }
  return file;
}

export function decodeFixedPacket(packet: Uint8Array, profile?: PacketProfile): Uint8Array {
  if (profile) {
    const expected = profileSize(profile);
    if (packet.length !== expected) throw new Error('Unexpected packet length');
  }
  if (packet.length < 4) throw new Error('Packet too short');
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const length = view.getUint32(0, false);
  if (length > packet.length - 4) throw new Error('Invalid packet length');
  return packet.slice(4, 4 + length);
}

export function uint8ToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function base64ToUint8(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
