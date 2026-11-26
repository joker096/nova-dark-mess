import { ed25519 } from '@noble/curves/ed25519.js';

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  if (typeof value !== 'string') throw new Error('Expected base64url string');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function generateQueueSigningKeyPair() {
  const privateKey = ed25519.utils.randomSecretKey();
  return {
    privateKey: toBase64Url(privateKey),
    publicKey: toBase64Url(ed25519.getPublicKey(privateKey)),
  };
}

export function queueSigningPublicKey(privateKey: string): string {
  const secret = fromBase64Url(privateKey);
  if (secret.length !== 32) throw new Error('Invalid queue signing key length');
  return toBase64Url(ed25519.getPublicKey(secret));
}

export function isQueuePrivateKey(value: string): boolean {
  if (typeof value !== 'string') return false;
  try {
    return fromBase64Url(value).length === 32;
  } catch {
    return false;
  }
}

export function isQueuePublicKey(value: string): boolean {
  if (typeof value !== 'string') return false;
  try {
    return fromBase64Url(value).length === 32;
  } catch {
    return false;
  }
}

export function signQueueCommand(privateKey: string, command: any) {
  const encoder = new TextEncoder();
  const signedAt = typeof command.signedAt === 'number' ? command.signedAt : Date.now();
  const commandNonce =
    typeof command.commandNonce === 'string'
      ? command.commandNonce
      : toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const message = JSON.stringify({
    v: 1,
    action: command.action,
    queueId: command.queueId,
    token: command.token,
    signedAt,
    commandNonce,
    ...(command.action === 'enqueue' && { packet: command.packet, pow: command.pow }),
    ...(command.action === 'poll' && { limit: command.limit }),
    ...(command.action === 'ack' && { packetIds: command.packetIds }),
  });
  const signature = ed25519.sign(encoder.encode(message), fromBase64Url(privateKey));
  return {
    signature: toBase64Url(signature),
    signedAt,
    commandNonce,
  };
}

export function verifyQueueCommand(publicKey: string, command: any, signature: string): boolean {
  try {
    if (typeof signature !== 'string') return false;
    const encoder = new TextEncoder();
    const signedAt = typeof command.signedAt === 'number' ? command.signedAt : Date.now();
    const commandNonce = command.commandNonce;
    if (typeof commandNonce !== 'string') return false;
    const message = JSON.stringify({
      v: 1,
      action: command.action,
      queueId: command.queueId,
      token: command.token,
      signedAt,
      commandNonce,
      ...(command.action === 'enqueue' && { packet: command.packet, pow: command.pow }),
      ...(command.action === 'poll' && { limit: command.limit }),
      ...(command.action === 'ack' && { packetIds: command.packetIds }),
    });
    return ed25519.verify(
      fromBase64Url(signature),
      encoder.encode(message),
      fromBase64Url(publicKey)
    );
  } catch {
    return false;
  }
}

export function signIdentityBinding(privateKey: string, identityKey: string, signingPublicKey: string): string {
  const encoder = new TextEncoder();
  const message = JSON.stringify({
    v: 1,
    purpose: 'identity-binding',
    identityKey,
    signingPublicKey,
  });
  const signature = ed25519.sign(encoder.encode(message), fromBase64Url(privateKey));
  return toBase64Url(signature);
}

export function verifyIdentityBinding(identityKey: string, signingPublicKey: string, signature: string): boolean {
  try {
    if (typeof signature !== 'string') return false;
    return ed25519.verify(
      fromBase64Url(signature),
      new TextEncoder().encode(JSON.stringify({
        v: 1,
        purpose: 'identity-binding',
        identityKey,
        signingPublicKey,
      })),
      fromBase64Url(identityKey)
    );
  } catch {
    return false;
  }
}