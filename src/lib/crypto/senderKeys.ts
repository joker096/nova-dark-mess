/**
 * Sender Keys for group messaging.
 *
 * Implements a Signal-style sender key ratchet: each group member owns a
 * sender key (chain key + Ed25519 signing key). The sender key is distributed
 * to every other member over their existing 1:1 ratchet sessions as a
 * SenderKeyDistributionMessage. Group messages are then encrypted with a
 * message key derived from the sender's chain key and signed with the
 * sender's signing key, so every member can verify authenticity.
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  base64ToBuffer,
  bufferToBase64,
  EncryptedData,
  encryptAESGCM,
  decryptAESGCM,
} from './aes';

const encoder = new TextEncoder();

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function deriveMessageKey(chainKey: Uint8Array): {
  messageKey: Uint8Array;
  nextChainKey: Uint8Array;
} {
  return {
    messageKey: hmac(sha256, chainKey, new Uint8Array([0x01])),
    nextChainKey: hmac(sha256, chainKey, new Uint8Array([0x02])),
  };
}

export interface SenderKeyState {
  keyId: number;
  chainKey: string; // base64, 32 bytes
  iteration: number;
  signingPublicKey: string; // base64
  signingPrivateKey: string; // base64 (empty for remote/received keys)
  /** Message keys kept for out-of-order delivery, keyed by iteration. */
  skippedMessageKeys?: Record<string, string>;
}

const MAX_SKIPPED_MESSAGE_KEYS = 200;

export interface SenderKeyDistributionMessage {
  keyId: number;
  iteration: number;
  chainKey: string;
  signingPublicKey: string;
  /** Fingerprint of the peer that distributed this sender key. */
  senderFingerprint: string;
  /** Ed25519 signature over the distribution message, made with the sender's sender-key signing private key. */
  signature: string;
}

export interface SenderKeyEncryptedMessage {
  keyId: number;
  iteration: number;
  ciphertext: string;
  iv: string;
  signature: string; // base64 Ed25519
  senderFingerprint?: string;
}

export function createSenderKey(keyId?: number): SenderKeyState {
  const signingPrivateKey = ed25519.utils.randomSecretKey();
  const signingPublicKey = ed25519.getPublicKey(signingPrivateKey);
  return {
    keyId: keyId ?? randomKeyId(),
    chainKey: bufferToBase64(randomBytes(32)),
    iteration: 0,
    signingPublicKey: bufferToBase64(signingPublicKey),
    signingPrivateKey: bufferToBase64(signingPrivateKey),
  };
}

function randomKeyId(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
}

function distributionSigningData(message: Omit<SenderKeyDistributionMessage, 'signature'>): string {
  return `${message.keyId}|${message.iteration}|${message.chainKey}|${message.signingPublicKey}|${message.senderFingerprint}`;
}

export function createDistributionMessage(
  state: SenderKeyState,
  senderFingerprint: string,
): SenderKeyDistributionMessage {
  if (!state.signingPrivateKey) {
    throw new Error('Cannot create distribution message without signing private key');
  }
  const unsigned: Omit<SenderKeyDistributionMessage, 'signature'> = {
    keyId: state.keyId,
    iteration: state.iteration,
    chainKey: state.chainKey,
    signingPublicKey: state.signingPublicKey,
    senderFingerprint,
  };
  const signature = ed25519.sign(
    new TextEncoder().encode(distributionSigningData(unsigned)),
    base64ToBuffer(state.signingPrivateKey),
  );
  return {
    ...unsigned,
    signature: bufferToBase64(signature),
  };
}

export function processDistributionMessage(
  message: SenderKeyDistributionMessage,
): SenderKeyState {
  if (!message.signature || !message.senderFingerprint) {
    throw new Error('Sender key distribution message is unsigned');
  }
  const valid = ed25519.verify(
    base64ToBuffer(message.signature),
    new TextEncoder().encode(
      distributionSigningData({
        keyId: message.keyId,
        iteration: message.iteration,
        chainKey: message.chainKey,
        signingPublicKey: message.signingPublicKey,
        senderFingerprint: message.senderFingerprint,
      }),
    ),
    base64ToBuffer(message.signingPublicKey),
  );
  if (!valid) {
    throw new Error('Invalid sender key distribution signature');
  }
  return {
    keyId: message.keyId,
    chainKey: message.chainKey,
    iteration: message.iteration,
    signingPublicKey: message.signingPublicKey,
    signingPrivateKey: '',
    skippedMessageKeys: {},
  };
}

function rememberSkippedKey(
  skipped: Record<string, string>,
  iteration: number,
  messageKey: Uint8Array,
): Record<string, string> {
  const next = { ...skipped, [String(iteration)]: bufferToBase64(messageKey) };
  const keys = Object.keys(next);
  if (keys.length > MAX_SKIPPED_MESSAGE_KEYS) {
    // Drop the oldest skipped keys so a hostile sender cannot grow state forever.
    keys
      .map(Number)
      .sort((a, b) => a - b)
      .slice(0, keys.length - MAX_SKIPPED_MESSAGE_KEYS)
      .forEach((oldest) => delete next[String(oldest)]);
  }
  return next;
}

export async function senderKeyEncrypt(
  state: SenderKeyState,
  plaintext: string,
): Promise<{ message: SenderKeyEncryptedMessage; state: SenderKeyState }> {
  if (!state.signingPrivateKey) {
    throw new Error('Cannot encrypt without a signing private key');
  }

  const chainKeyBytes = base64ToBuffer(state.chainKey);
  const { messageKey, nextChainKey } = deriveMessageKey(chainKeyBytes);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    messageKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const encrypted: EncryptedData = await encryptAESGCM(plaintext, cryptoKey);

  const signingData = encoder.encode(
    `${state.keyId}|${state.iteration}|${encrypted.ciphertext}|${encrypted.iv}`,
  );
  const signature = ed25519.sign(signingData, base64ToBuffer(state.signingPrivateKey));

  const message: SenderKeyEncryptedMessage = {
    keyId: state.keyId,
    iteration: state.iteration,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    signature: bufferToBase64(signature),
  };

  const nextState: SenderKeyState = {
    ...state,
    chainKey: bufferToBase64(nextChainKey),
    iteration: state.iteration + 1,
    skippedMessageKeys: state.skippedMessageKeys ?? {},
  };

  return { message, state: nextState };
}

export async function senderKeyDecrypt(
  state: SenderKeyState,
  message: SenderKeyEncryptedMessage,
): Promise<{ plaintext: string; state: SenderKeyState }> {
  if (state.keyId !== message.keyId) {
    throw new Error('Sender key id mismatch');
  }
  let skipped = { ...(state.skippedMessageKeys ?? {}) };

  // Verify the signature before touching any key material.
  const signingData = encoder.encode(
    `${message.keyId}|${message.iteration}|${message.ciphertext}|${message.iv}`,
  );
  const valid = ed25519.verify(
    base64ToBuffer(message.signature),
    signingData,
    base64ToBuffer(state.signingPublicKey),
  );
  if (!valid) {
    throw new Error('Invalid sender key message signature');
  }

  let messageKey: Uint8Array;
  let nextState: SenderKeyState;

  if (message.iteration < state.iteration) {
    // Out-of-order delivery: use the key we kept when the chain moved past it.
    const cached = skipped[String(message.iteration)];
    if (!cached) {
      throw new Error('Sender key message already processed');
    }
    messageKey = base64ToBuffer(cached);
    delete skipped[String(message.iteration)];
    nextState = { ...state, skippedMessageKeys: skipped };
  } else {
    let chainKeyBytes = base64ToBuffer(state.chainKey);
    let iteration = state.iteration;

    // Advance the chain to the message's iteration, keeping intermediate keys
    // so messages that arrive later can still be decrypted exactly once.
    while (iteration < message.iteration) {
      const derived = deriveMessageKey(chainKeyBytes);
      if (iteration < message.iteration) {
        skipped = rememberSkippedKey(skipped, iteration, derived.messageKey);
      }
      chainKeyBytes = derived.nextChainKey;
      iteration += 1;
    }

    const derived = deriveMessageKey(chainKeyBytes);
    messageKey = derived.messageKey;

    nextState = {
      ...state,
      chainKey: bufferToBase64(derived.nextChainKey),
      iteration: message.iteration + 1,
      skippedMessageKeys: skipped,
    };
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    messageKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const plaintext = await decryptAESGCM(
    { ciphertext: message.ciphertext, iv: message.iv },
    cryptoKey,
  );

  return { plaintext, state: nextState };
}

export function senderKeyStateToJson(state: SenderKeyState): string {
  return JSON.stringify(state);
}

export function senderKeyStateFromJson(json: string): SenderKeyState {
  return JSON.parse(json) as SenderKeyState;
}
