import { ed25519 } from '@noble/curves/ed25519.js';

export const QUEUE_COMMAND_VERSION = 1;

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  if (typeof value !== 'string') throw new Error('Expected base64url string');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function requireKey(bytes, length, label) {
  if (bytes.length !== length) throw new Error(`Invalid ${label} length`);
  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generateQueueSigningKeyPair() {
  const privateKey = ed25519.utils.randomSecretKey();
  return {
    privateKey: toBase64Url(privateKey),
    publicKey: toBase64Url(ed25519.getPublicKey(privateKey)),
  };
}

export function queueSigningPublicKey(privateKey) {
  const secret = requireKey(fromBase64Url(privateKey), 32, 'queue signing key');
  return toBase64Url(ed25519.getPublicKey(secret));
}

export function isQueuePublicKey(value) {
  if (typeof value !== 'string') return false;
  try {
    return fromBase64Url(value).length === 32;
  } catch {
    return false;
  }
}

export function isQueuePrivateKey(value) {
  if (typeof value !== 'string') return false;
  try {
    return fromBase64Url(value).length === 32;
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Identity binding
//
// An anonymous inbox is a queue key, and the queue key rotates when the inbox
// moves to another relay. The identity key stays fixed and signs the current
// queue key, so a contact can tell "the same person moved" from "someone else
// took over this queue".
// ───────────────────────────────────────────────────────────────────────────

export const IDENTITY_BINDING_VERSION = 1;

export function identityBindingMessage(identityKey, signingPublicKey) {
  if (typeof identityKey !== 'string' || typeof signingPublicKey !== 'string') {
    throw new Error('Invalid identity binding');
  }
  return JSON.stringify({
    v: IDENTITY_BINDING_VERSION,
    purpose: 'identity-binding',
    identityKey,
    signingPublicKey,
  });
}

/**
 * Signs the binding with the identity key's private half. The identity key is
 * an Ed25519 key in base64url form, the same encoding used for queue keys.
 */
export function signIdentityBinding(privateKey, identityKey, signingPublicKey) {
  const message = identityBindingMessage(identityKey, signingPublicKey);
  const signature = ed25519.sign(
    encoder.encode(message),
    requireKey(fromBase64Url(privateKey), 32, 'signing key'),
  );
  return toBase64Url(signature);
}

export function verifyIdentityBinding(identityKey, signingPublicKey, signature) {
  try {
    if (typeof signature !== 'string') return false;
    return ed25519.verify(
      fromBase64Url(signature),
      encoder.encode(identityBindingMessage(identityKey, signingPublicKey)),
      requireKey(fromBase64Url(identityKey), 32, 'identity key'),
    );
  } catch {
    return false;
  }
}

export function queueCommandMessage(command) {
  if (!command || typeof command !== 'object') throw new Error('Invalid command');
  const out = {
    v: QUEUE_COMMAND_VERSION,
    action: command.action,
    queueId: command.queueId,
    token: command.token,
    signedAt: command.signedAt,
    commandNonce: command.commandNonce,
  };
  switch (command.action) {
    case 'enqueue':
      out.packet = command.packet;
      if (command.pow) {
        out.pow = { nonce: command.pow.nonce, digest: command.pow.digest };
      }
      break;
    case 'poll':
      out.limit = command.limit;
      break;
    case 'ack':
      out.packetIds = command.packetIds;
      break;
    case 'delete_queue':
      break;
    default:
      throw new Error('Unknown queue command');
  }
  return JSON.stringify(out);
}

export function signQueueCommand(privateKey, command) {
  const signedAt = typeof command.signedAt === 'number' ? command.signedAt : Date.now();
  const commandNonce =
    typeof command.commandNonce === 'string'
      ? command.commandNonce
      : toBase64Url(randomBytes(16));
  const message = queueCommandMessage({ ...command, signedAt, commandNonce });
  const signature = ed25519.sign(encoder.encode(message), fromBase64Url(privateKey));
  return {
    signature: toBase64Url(signature),
    signedAt,
    commandNonce,
  };
}

export function verifyQueueCommand(publicKey, command, signature) {
  try {
    const message = queueCommandMessage(command);
    return ed25519.verify(
      fromBase64Url(signature),
      encoder.encode(message),
      fromBase64Url(publicKey),
    );
  } catch {
    return false;
  }
}
