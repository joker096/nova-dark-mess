/**
 * Device linking over a short-lived X25519 handshake.
 *
 * The primary device publishes a one-time link offer (code + ephemeral public
 * key). The secondary device scans it, replies with its own ephemeral public
 * key, and both sides derive a shared secret via X25519 + HKDF. That secret
 * is then used to encrypt history-sync payloads between the two devices.
 */

import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  base64ToBuffer,
  bufferToBase64,
  EncryptedData,
  encryptAESGCM,
  decryptAESGCM,
} from '../crypto/aes';

const encoder = new TextEncoder();
const LINK_INFO = encoder.encode('nova-device-link-v1');

export interface DeviceLinkOffer {
  code: string;
  publicKey: string; // base64 X25519
  createdAt: number;
  expiresAt: number;
}

export interface DeviceLinkResponse {
  code: string;
  publicKey: string; // base64 X25519
}

export interface LinkedDeviceSession {
  code: string;
  sharedSecret: string; // base64 32 bytes
  establishedAt: number;
}

export const DEVICE_LINK_SCHEME = 'nova';
export const DEVICE_LINK_HOST = 'device-link';
export const DEVICE_LINK_RESPONSE_HOST = 'device-link-response';

/** Serializes a link offer into a scannable URL (QR / copy-paste). */
export function encodeDeviceLinkOffer(offer: DeviceLinkOffer): string {
  const params = new URLSearchParams({
    v: '1',
    code: offer.code,
    pk: offer.publicKey,
    iat: String(offer.createdAt),
    exp: String(offer.expiresAt),
  });
  return `${DEVICE_LINK_SCHEME}://${DEVICE_LINK_HOST}?${params.toString()}`;
}

/** Parses and validates a scanned device-link URL. */
export function parseDeviceLinkOffer(url: string): DeviceLinkOffer | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== `${DEVICE_LINK_SCHEME}:`) return null;
    if (parsed.hostname !== DEVICE_LINK_HOST) return null;

    const code = parsed.searchParams.get('code');
    const publicKey = parsed.searchParams.get('pk');
    const expiresAt = Number(parsed.searchParams.get('exp'));
    if (!code || !/^[A-Z2-9]{6}$/.test(code)) return null;
    if (!publicKey) return null;
    if (!Number.isFinite(expiresAt)) return null;

    // X25519 public keys are exactly 32 bytes.
    if (base64ToBuffer(publicKey).length !== 32) return null;

    return {
      code,
      publicKey,
      createdAt: Number(parsed.searchParams.get('iat')) || 0,
      expiresAt,
    };
  } catch {
    return null;
  }
}

/** Serializes the secondary device's reply so it can be handed back without a server. */
export function encodeDeviceLinkResponse(response: DeviceLinkResponse): string {
  const params = new URLSearchParams({ code: response.code, pk: response.publicKey });
  return `${DEVICE_LINK_SCHEME}://${DEVICE_LINK_RESPONSE_HOST}?${params.toString()}`;
}

/** Parses the reply pasted back on the primary device. */
export function parseDeviceLinkResponse(url: string): DeviceLinkResponse | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== `${DEVICE_LINK_SCHEME}:`) return null;
    if (parsed.hostname !== DEVICE_LINK_RESPONSE_HOST) return null;

    const code = parsed.searchParams.get('code');
    const publicKey = parsed.searchParams.get('pk');
    if (!code || !/^[A-Z2-9]{6}$/.test(code)) return null;
    if (!publicKey || base64ToBuffer(publicKey).length !== 32) return null;

    return { code, publicKey };
  } catch {
    return null;
  }
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function randomCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export class DeviceLinkManager {
  private readonly ttlMs: number;
  private pendingOffer: { offer: DeviceLinkOffer; secretKey: Uint8Array } | null = null;
  private readonly secondarySecrets = new Map<
    string,
    { secretKey: Uint8Array; remotePublicKey: string }
  >();

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  public createOffer(): DeviceLinkOffer {
    const secretKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secretKey);
    const now = Date.now();
    const offer: DeviceLinkOffer = {
      code: randomCode(),
      publicKey: bufferToBase64(publicKey),
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.pendingOffer = { offer, secretKey };
    return offer;
  }

  public acceptOffer(offer: DeviceLinkOffer): DeviceLinkResponse {
    if (Date.now() > offer.expiresAt) {
      throw new Error('Link offer expired');
    }
    const secretKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secretKey);
    // Store our ephemeral secret locally keyed by code until we receive the
    // primary device's response.
    this.secondarySecrets.set(offer.code, { secretKey, remotePublicKey: offer.publicKey });
    return { code: offer.code, publicKey: bufferToBase64(publicKey) };
  }

  public finalizeFromResponse(response: DeviceLinkResponse): LinkedDeviceSession {
    if (!this.pendingOffer) throw new Error('No pending link offer');
    if (response.code !== this.pendingOffer.offer.code) throw new Error('Link code mismatch');
    if (Date.now() > this.pendingOffer.offer.expiresAt) throw new Error('Link offer expired');

    const shared = x25519.getSharedSecret(
      this.pendingOffer.secretKey,
      base64ToBuffer(response.publicKey),
    );
    const derived = hkdf(sha256, shared, new Uint8Array(32), LINK_INFO, 32);
    const session: LinkedDeviceSession = {
      code: response.code,
      sharedSecret: bufferToBase64(derived),
      establishedAt: Date.now(),
    };
    this.pendingOffer = null;
    return session;
  }

  public finalizeFromStoredSecret(responsePublicKey: string, code: string): LinkedDeviceSession {
    const entry = this.secondarySecrets.get(code);
    if (!entry) throw new Error('No pending secondary link');
    const shared = x25519.getSharedSecret(entry.secretKey, base64ToBuffer(responsePublicKey));
    const derived = hkdf(sha256, shared, new Uint8Array(32), LINK_INFO, 32);
    this.secondarySecrets.delete(code);
    return { code, sharedSecret: bufferToBase64(derived), establishedAt: Date.now() };
  }

  public async encryptPayload(session: LinkedDeviceSession, plaintext: string): Promise<EncryptedData> {
    const key = await crypto.subtle.importKey(
      'raw',
      base64ToBuffer(session.sharedSecret) as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    return encryptAESGCM(plaintext, key);
  }

  public async decryptPayload(session: LinkedDeviceSession, data: EncryptedData): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      base64ToBuffer(session.sharedSecret) as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    return decryptAESGCM(data, key);
  }

  public async exportHistorySnapshot(
    session: LinkedDeviceSession,
    histories: Record<string, Array<{ id?: string; senderId?: string; text?: string; time?: string; isRead?: boolean }>>,
  ): Promise<EncryptedData> {
    const payload: HistorySyncPayload = {
      version: 1,
      timestamp: Date.now(),
      chats: Object.entries(histories).map(([id, messages]) => ({
        id,
        messages: (messages || []).map((m) => ({
          id: m.id || `m-${Date.now()}`,
          senderId: m.senderId || 'me',
          text: m.text,
          time: m.time || 'now',
          isRead: Boolean(m.isRead),
        })),
      })),
    };
    return this.encryptPayload(session, JSON.stringify(payload));
  }

  public async importHistorySnapshot(
    session: LinkedDeviceSession,
    encrypted: EncryptedData,
  ): Promise<HistorySyncPayload> {
    const json = await this.decryptPayload(session, encrypted);
    const parsed = JSON.parse(json) as HistorySyncPayload;
    if (parsed.version !== 1 || !Array.isArray(parsed.chats)) {
      throw new Error('Invalid history payload');
    }
    return parsed;
  }
}

export interface HistorySyncMessage {
  id: string;
  senderId: string;
  text?: string;
  time: string;
  isRead?: boolean;
}

export interface HistorySyncChat {
  id: string;
  messages: HistorySyncMessage[];
}

export interface HistorySyncPayload {
  version: 1;
  timestamp: number;
  chats: HistorySyncChat[];
}
