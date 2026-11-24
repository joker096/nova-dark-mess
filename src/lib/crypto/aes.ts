/**
 * AES-256-GCM and Key Derivation Utilities using Web Crypto API
 */

export interface EncryptedData {
  ciphertext: string; // Base64
  iv: string;         // Base64 (12 bytes)
  salt?: string;      // Base64 (16 bytes)
}

/**
 * Converts Uint8Array to Base64 string
 */
export function bufferToBase64(buffer: Uint8Array): string {
  // Chunked conversion to avoid call stack limits on large buffers
  const chunkSize = 0x8000; // 32KB chunks
  const chunks: string[] = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  return btoa(chunks.join(''));
}

/**
 * Converts Base64 string to Uint8Array
 */
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts Uint8Array to Hex string
 */
export function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts Hex string to Uint8Array
 */
export function hexToBuffer(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from a secret (password/pin) using PBKDF2
 */
export async function deriveKeyFromSecret(
  secret: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 600000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts plaintext string using AES-256-GCM
 */
export async function encryptAESGCM(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  );

  return {
    ciphertext: bufferToBase64(new Uint8Array(encryptedBuffer)),
    iv: bufferToBase64(iv),
  };
}

/**
 * Decrypts AES-256-GCM ciphertext
 */
export async function decryptAESGCM(
  encryptedData: EncryptedData,
  key: CryptoKey
): Promise<string> {
  const ciphertextBuffer = base64ToBuffer(encryptedData.ciphertext);
  const ivBuffer = base64ToBuffer(encryptedData.iv);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer as BufferSource,
    },
    key,
    ciphertextBuffer as BufferSource
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * SHA-256 hash helper
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as BufferSource);
  return bufferToHex(new Uint8Array(hashBuffer));
}
