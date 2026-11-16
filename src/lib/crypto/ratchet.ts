import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  PROTOCOL_VERSION_CLASSICAL,
  PROTOCOL_VERSION_PQ,
  pqDecapsulate,
  pqEncapsulate,
} from './postQuantum';
import { base64ToBuffer, bufferToBase64, EncryptedData, encryptAESGCM, decryptAESGCM } from './aes';
import {
  OneTimePreKey,
  PreKeyBundle,
  SignedPreKey,
  UserIdentity,
  fingerprintFromSigningKey,
  identityPrivateKeys,
  oneTimePreKeyPair,
  signWithIdentity,
  signedPreKeyPair,
  verifyIdentitySignature,
  verifyPreKeyBundle,
} from './identity';

export interface X3DHHeader {
  senderFingerprint: string;
  senderIdentityKey: string;
  senderSigningKey: string;
  ephemeralKey: string;
  signedPreKeyId: number;
  oneTimePreKeyId?: number;
  /** Session generation for coordinated re-keying; absent/0 is the first session. */
  generation?: number;
  /**
   * Handshake protocol version: 2 = classical X25519, 3 = hybrid with
   * ML-KEM-768 (`pqCiphertext` present). Signed, so a downgrade attempt
   * invalidates the header signature instead of silently succeeding.
   */
  protocolVersion?: number;
  /** ML-KEM-768 ciphertext (base64) when protocolVersion is 3. */
  pqCiphertext?: string;
  signature: string;
}

export interface RatchetMessagePayload {
  version: 2;
  senderFingerprint: string;
  recipientFingerprint: string;
  sequenceNumber: number;
  previousChainLength: number;
  ephemeralPublicKey: string;
  encryptedContent: EncryptedData;
  timestamp: number;
  x3dh?: X3DHHeader;
}

export interface RatchetState {
  rootKey: string;
  sendChainKey: string | null;
  recvChainKey: string | null;
  dhSelfSecret: string;
  dhSelfPublic: string;
  dhRemotePublic: string | null;
  sendCount: number;
  recvCount: number;
  previousSendCount: number;
  skippedMessageKeys: Record<string, string>;
  peerIdentityKey: string | null;
  peerFingerprint: string | null;
  /** Generation of the session keys, incremented by coordinated re-keying. */
  sessionGeneration?: number;
}

export interface PreKeyBundleExtensions {
  /** ML-KEM-768 encapsulation key (base64) advertised by PQ-capable peers. */
  pqKem?: string;
}

export type PreKeyBundleWithPq = PreKeyBundle & PreKeyBundleExtensions;

const encoder = new TextEncoder();
const X3DH_INFO = encoder.encode('NovaX3DH-v2');
const ROOT_INFO = encoder.encode('NovaRatchetRoot-v2');
const X3DH_PREFIX = new Uint8Array(32).fill(0xff);
const MAX_SKIPPED_MESSAGES = 1000;

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    output.set(arr, offset);
    offset += arr.length;
  }
  return output;
}

function kdfRoot(rootKey: Uint8Array, dhOutput: Uint8Array): {
  rootKey: Uint8Array;
  chainKey: Uint8Array;
} {
  const output = hkdf(sha256, dhOutput, rootKey, ROOT_INFO, 64);
  return { rootKey: output.slice(0, 32), chainKey: output.slice(32, 64) };
}

function kdfChain(chainKey: Uint8Array): {
  messageKey: Uint8Array;
  nextChainKey: Uint8Array;
} {
  return {
    messageKey: hmac(sha256, chainKey, new Uint8Array([0x01])),
    nextChainKey: hmac(sha256, chainKey, new Uint8Array([0x02])),
  };
}

async function importMessageKey(messageKey: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    messageKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    [usage]
  );
}

function x3dhSigningData(header: Omit<X3DHHeader, 'signature'>): string {
  const parts = [
    'nova-x3dh-v2',
    header.senderFingerprint,
    header.senderIdentityKey,
    header.senderSigningKey,
    header.ephemeralKey,
    String(header.signedPreKeyId),
    String(header.oneTimePreKeyId ?? ''),
  ];
  // Re-keyed sessions bind the generation to the signature so a stale reset
  // header cannot be replayed to roll the peer's keys backwards.
  if (header.generation !== undefined) {
    parts.push(`gen:${header.generation}`);
  }
  // The negotiated protocol version and the PQ ciphertext are signed too:
  // stripping them downgrades the header to classical, which the responder
  // then rejects (see combineSharedSecrets) instead of accepting.
  if (header.protocolVersion !== undefined) {
    parts.push(`pv:${header.protocolVersion}`);
  }
  if (header.pqCiphertext !== undefined) {
    parts.push(`pq:${header.pqCiphertext}`);
  }
  return parts.join('|');
}

async function initiatorSharedSecret(
  identity: UserIdentity,
  bundle: PreKeyBundle
): Promise<{
  sharedSecret: Uint8Array;
  ephemeralSecret: Uint8Array;
  ephemeralPublic: Uint8Array;
  pqCiphertext?: string;
  protocolVersion: number;
}> {
  if (!verifyPreKeyBundle(bundle)) {
    throw new Error('Invalid prekey bundle signature');
  }

  const { x25519Secret } = identityPrivateKeys(identity);
  const remoteIdentityKey = base64ToBuffer(bundle.identityKey);
  const remoteSignedPreKey = base64ToBuffer(bundle.signedPreKey.publicKey);
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);

  const dh1 = x25519.getSharedSecret(x25519Secret, remoteSignedPreKey);
  const dh2 = x25519.getSharedSecret(ephemeralSecret, remoteIdentityKey);
  const dh3 = x25519.getSharedSecret(ephemeralSecret, remoteSignedPreKey);
  const dhParts = [dh1, dh2, dh3];

  if (bundle.oneTimePreKey) {
    dhParts.push(
      x25519.getSharedSecret(ephemeralSecret, base64ToBuffer(bundle.oneTimePreKey.publicKey))
    );
  }

  const sharedSecret = hkdf(sha256, concatBytes(X3DH_PREFIX, ...dhParts), new Uint8Array(32), X3DH_INFO, 32);

  // Hybrid PQ: when the peer's bundle advertises an ML-KEM-768 key we always
  // encapsulate (never fall back silently); the PQ shared secret is combined
  // with the classical one so the session holds if either KEM or X25519 is
  // broken. PQ-only strength is not claimed.
  const pqKem = (bundle as PreKeyBundleWithPq).pqKem;
  if (pqKem) {
    const { ciphertextB64, sharedSecret: pqShared } = pqEncapsulate(pqKem);
    return {
      sharedSecret: hkdf(
        sha256,
        concatBytes(sharedSecret, pqShared),
        new Uint8Array(32),
        encoder.encode('NovaX3DH-PQ-v3'),
        32,
      ),
      ephemeralSecret,
      ephemeralPublic,
      pqCiphertext: ciphertextB64,
      protocolVersion: PROTOCOL_VERSION_PQ,
    };
  }

  return {
    sharedSecret,
    ephemeralSecret,
    ephemeralPublic,
    protocolVersion: PROTOCOL_VERSION_CLASSICAL,
  };
}

async function responderSharedSecret(
  identity: UserIdentity,
  signedPreKey: SignedPreKey,
  oneTimePreKey: OneTimePreKey | null,
  header: X3DHHeader,
  localPqSecret?: string
): Promise<Uint8Array> {
  const { signature, ...unsignedHeader } = header;
  if (!verifyIdentitySignature(header.senderSigningKey, x3dhSigningData(unsignedHeader), signature)) {
    throw new Error('Invalid X3DH header signature');
  }
  if (fingerprintFromSigningKey(header.senderSigningKey) !== header.senderFingerprint) {
    throw new Error('X3DH sender fingerprint mismatch');
  }
  // Downgrade protection: a responder with a PQ secret must never accept a
  // classical-only header, and a pqCiphertext must only appear with
  // protocolVersion 3. Both cases abort the session instead of proceeding.
  const claimsPq = header.pqCiphertext !== undefined;
  const headerVersion = header.protocolVersion ?? PROTOCOL_VERSION_CLASSICAL;
  if (claimsPq !== (headerVersion === PROTOCOL_VERSION_PQ)) {
    throw new Error('X3DH protocol version mismatch');
  }
  if (claimsPq && !localPqSecret) {
    throw new Error('PQ handshake without a local ML-KEM secret key');
  }

  const { x25519Secret } = identityPrivateKeys(identity);
  const signedPreKeySecrets = signedPreKeyPair(signedPreKey);
  const senderIdentityKey = base64ToBuffer(header.senderIdentityKey);
  const senderEphemeralKey = base64ToBuffer(header.ephemeralKey);

  const dh1 = x25519.getSharedSecret(signedPreKeySecrets.secretKey, senderIdentityKey);
  const dh2 = x25519.getSharedSecret(x25519Secret, senderEphemeralKey);
  const dh3 = x25519.getSharedSecret(signedPreKeySecrets.secretKey, senderEphemeralKey);
  const dhParts = [dh1, dh2, dh3];

  if (oneTimePreKey && header.oneTimePreKeyId === oneTimePreKey.keyId) {
    dhParts.push(x25519.getSharedSecret(oneTimePreKeyPair(oneTimePreKey).secretKey, senderEphemeralKey));
  } else if (header.oneTimePreKeyId !== undefined) {
    throw new Error('Unknown one-time prekey');
  }

  const sharedSecret = hkdf(sha256, concatBytes(X3DH_PREFIX, ...dhParts), new Uint8Array(32), X3DH_INFO, 32);

  if (claimsPq && localPqSecret && header.pqCiphertext) {
    const pqShared = pqDecapsulate(localPqSecret, header.pqCiphertext);
    return hkdf(
      sha256,
      concatBytes(sharedSecret, pqShared),
      new Uint8Array(32),
      encoder.encode('NovaX3DH-PQ-v3'),
      32,
    );
  }
  return sharedSecret;
}

export async function createOutboundRatchetSession(
  identity: UserIdentity,
  bundle: PreKeyBundle,
  options: { generation?: number } = {}
): Promise<{ state: RatchetState; header: X3DHHeader }> {
  const { sharedSecret, ephemeralPublic, pqCiphertext, protocolVersion } =
    await initiatorSharedSecret(identity, bundle);
  const ratchetSecret = x25519.utils.randomSecretKey();
  const ratchetPublic = x25519.getPublicKey(ratchetSecret);
  const dh = x25519.getSharedSecret(ratchetSecret, base64ToBuffer(bundle.signedPreKey.publicKey));
  const { rootKey, chainKey } = kdfRoot(sharedSecret, dh);

  const state: RatchetState = {
    rootKey: bufferToBase64(rootKey),
    sendChainKey: bufferToBase64(chainKey),
    recvChainKey: null,
    dhSelfSecret: bufferToBase64(ratchetSecret),
    dhSelfPublic: bufferToBase64(ratchetPublic),
    dhRemotePublic: bundle.signedPreKey.publicKey,
    sendCount: 0,
    recvCount: 0,
    previousSendCount: 0,
    skippedMessageKeys: {},
    peerIdentityKey: bundle.identityKey,
    peerFingerprint: bundle.fingerprint,
    sessionGeneration: options.generation ?? 0,
  };

  const unsignedHeader: Omit<X3DHHeader, 'signature'> = {
    senderFingerprint: identity.fingerprint,
    senderIdentityKey: identity.publicKey,
    senderSigningKey: identity.signingPublicKey,
    ephemeralKey: bufferToBase64(ephemeralPublic),
    signedPreKeyId: bundle.signedPreKey.keyId,
    oneTimePreKeyId: bundle.oneTimePreKey?.keyId,
    generation: options.generation,
    protocolVersion,
    ...(pqCiphertext !== undefined ? { pqCiphertext } : {}),
  };

  const header: X3DHHeader = {
    ...unsignedHeader,
    signature: signWithIdentity(identity, x3dhSigningData(unsignedHeader)),
  };

  return { state, header };
}

export async function createInboundRatchetSession(
  identity: UserIdentity,
  signedPreKey: SignedPreKey,
  oneTimePreKey: OneTimePreKey | null,
  header: X3DHHeader,
  options: { localPqSecret?: string } = {}
): Promise<RatchetState> {
  const sharedSecret = await responderSharedSecret(
    identity,
    signedPreKey,
    oneTimePreKey,
    header,
    options.localPqSecret,
  );
  const signedPreKeySecrets = signedPreKeyPair(signedPreKey);

  return {
    rootKey: bufferToBase64(sharedSecret),
    sendChainKey: null,
    recvChainKey: null,
    dhSelfSecret: bufferToBase64(signedPreKeySecrets.secretKey),
    dhSelfPublic: bufferToBase64(signedPreKeySecrets.publicKey),
    dhRemotePublic: null,
    sendCount: 0,
    recvCount: 0,
    previousSendCount: 0,
    skippedMessageKeys: {},
    peerIdentityKey: header.senderIdentityKey,
    peerFingerprint: header.senderFingerprint,
    sessionGeneration: header.generation ?? 0,
  };
}

function cloneState(state: RatchetState): RatchetState {
  return {
    ...state,
    skippedMessageKeys: { ...state.skippedMessageKeys },
  };
}

function skipMessageKeys(state: RatchetState, until: number): void {
  if (!state.recvChainKey) {
    if (state.recvCount < until) {
      throw new Error('Missing receive chain for skipped messages');
    }
    return;
  }

  while (state.recvCount < until) {
    if (Object.keys(state.skippedMessageKeys).length >= MAX_SKIPPED_MESSAGES) {
      throw new Error('Too many skipped messages');
    }
    const { messageKey, nextChainKey } = kdfChain(base64ToBuffer(state.recvChainKey));
    const keyId = `${state.dhRemotePublic}|${state.recvCount}`;
    state.skippedMessageKeys[keyId] = bufferToBase64(messageKey);
    state.recvChainKey = bufferToBase64(nextChainKey);
    state.recvCount += 1;
  }
}

function performDhRatchet(state: RatchetState, remotePublicKey: string): void {
  const dhReceive = x25519.getSharedSecret(
    base64ToBuffer(state.dhSelfSecret),
    base64ToBuffer(remotePublicKey)
  );
  const receive = kdfRoot(base64ToBuffer(state.rootKey), dhReceive);

  const nextSelfSecret = x25519.utils.randomSecretKey();
  const nextSelfPublic = x25519.getPublicKey(nextSelfSecret);
  const dhSend = x25519.getSharedSecret(nextSelfSecret, base64ToBuffer(remotePublicKey));
  const send = kdfRoot(receive.rootKey, dhSend);

  state.rootKey = bufferToBase64(send.rootKey);
  state.recvChainKey = bufferToBase64(receive.chainKey);
  state.sendChainKey = bufferToBase64(send.chainKey);
  state.dhSelfSecret = bufferToBase64(nextSelfSecret);
  state.dhSelfPublic = bufferToBase64(nextSelfPublic);
  state.dhRemotePublic = remotePublicKey;
  state.previousSendCount = state.sendCount;
  state.sendCount = 0;
  state.recvCount = 0;
}

function ensureSendingChain(state: RatchetState): void {
  if (state.sendChainKey) return;
  if (!state.dhRemotePublic) {
    throw new Error('Cannot send without a remote ratchet key');
  }

  const nextSecret = x25519.utils.randomSecretKey();
  const nextPublic = x25519.getPublicKey(nextSecret);
  const dh = x25519.getSharedSecret(nextSecret, base64ToBuffer(state.dhRemotePublic));
  const { rootKey, chainKey } = kdfRoot(base64ToBuffer(state.rootKey), dh);

  state.rootKey = bufferToBase64(rootKey);
  state.sendChainKey = bufferToBase64(chainKey);
  state.dhSelfSecret = bufferToBase64(nextSecret);
  state.dhSelfPublic = bufferToBase64(nextPublic);
  state.previousSendCount = state.sendCount;
  state.sendCount = 0;
}

export async function ratchetEncryptMessage(
  state: RatchetState,
  plaintext: string,
  senderFingerprint: string,
  recipientFingerprint: string,
  x3dh?: X3DHHeader
): Promise<{ payload: RatchetMessagePayload; updatedState: RatchetState }> {
  const nextState = cloneState(state);
  ensureSendingChain(nextState);

  if (!nextState.sendChainKey) {
    throw new Error('Sending chain unavailable');
  }

  const { messageKey, nextChainKey } = kdfChain(base64ToBuffer(nextState.sendChainKey));
  const messageSequence = nextState.sendCount;
  nextState.sendChainKey = bufferToBase64(nextChainKey);
  nextState.sendCount += 1;

  const cryptoKey = await importMessageKey(messageKey, 'encrypt');
  const encryptedContent = await encryptAESGCM(plaintext, cryptoKey);

  const payload: RatchetMessagePayload = {
    version: 2,
    senderFingerprint,
    recipientFingerprint,
    sequenceNumber: messageSequence,
    previousChainLength: nextState.previousSendCount,
    ephemeralPublicKey: nextState.dhSelfPublic,
    encryptedContent,
    timestamp: Date.now(),
    x3dh,
  };

  return { payload, updatedState: nextState };
}

export async function ratchetDecryptMessage(
  state: RatchetState,
  payload: RatchetMessagePayload
): Promise<{ plaintext: string; updatedState: RatchetState }> {
  const nextState = cloneState(state);
  const skippedKeyId = `${payload.ephemeralPublicKey}|${payload.sequenceNumber}`;
  const skippedKey = nextState.skippedMessageKeys[skippedKeyId];

  if (skippedKey) {
    delete nextState.skippedMessageKeys[skippedKeyId];
    const cryptoKey = await importMessageKey(base64ToBuffer(skippedKey), 'decrypt');
    const plaintext = await decryptAESGCM(payload.encryptedContent, cryptoKey);
    return { plaintext, updatedState: nextState };
  }

  if (payload.ephemeralPublicKey !== nextState.dhRemotePublic) {
    skipMessageKeys(nextState, payload.previousChainLength);
    performDhRatchet(nextState, payload.ephemeralPublicKey);
  }

  if (payload.sequenceNumber < nextState.recvCount) {
    throw new Error('Message key already used and not available');
  }

  skipMessageKeys(nextState, payload.sequenceNumber);

  if (!nextState.recvChainKey) {
    throw new Error('Receiving chain unavailable');
  }

  const { messageKey, nextChainKey } = kdfChain(base64ToBuffer(nextState.recvChainKey));
  nextState.recvChainKey = bufferToBase64(nextChainKey);
  nextState.recvCount += 1;

  const cryptoKey = await importMessageKey(messageKey, 'decrypt');
  const plaintext = await decryptAESGCM(payload.encryptedContent, cryptoKey);

  return { plaintext, updatedState: nextState };
}

/**
 * Peers re-key by starting a new X3DH session (see `createOutboundRatchetSession`
 * with a `generation`), not by advancing one side of an existing ratchet: the
 * responder only ratchets on a fresh remote key, so a unilateral sender advance
 * would make subsequent messages undecryptable for the peer.
 */
