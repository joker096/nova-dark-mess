import {
  OneTimePreKey,
  PreKeyBundle,
  SignedPreKey,
  UserIdentity,
  createOneTimePreKey,
  createPreKeyBundle,
  createSignedPreKey,
  verifyPreKeyBundle,
} from '../crypto/identity';
import {
  RatchetMessagePayload,
  RatchetState,
  createInboundRatchetSession,
  createOutboundRatchetSession,
  ratchetDecryptMessage,
  ratchetEncryptMessage,
} from '../crypto/ratchet';
import { encodePqSecret, generatePqKemKeyPair } from '../crypto/postQuantum';
import { P2PConnectionState, P2PMessengerChannel } from './webrtc';
import { P2PSignalingClient, SignalingMessage } from './signaling';
import { MeshRelay } from './relay';

export interface P2PStorage {
  loadPreKeyStore<T>(owner: string): Promise<T | null>;
  savePreKeyStore(owner: string, store: unknown): Promise<void>;
  loadSession<T>(chatId: string): Promise<T | null>;
  saveSession(chatId: string, session: unknown): Promise<void>;
}

export interface PreKeyStoreState {
  signedPreKey: SignedPreKey;
  /** Recently rotated signed prekeys, kept so in-flight sessions can still decrypt. */
  previousSignedPreKeys?: SignedPreKey[];
  oneTimePreKeys: OneTimePreKey[];
  nextPreKeyId: number;
  /** ML-KEM-768 encapsulation key advertised in bundles (base64). */
  pqKemPublicKey?: string;
  /** ML-KEM-768 secret key (prefixed, base64) used to decapsulate handshakes. */
  pqKemSecretKey?: string;
}

export interface P2PManagerOptions {
  identity: UserIdentity;
  signalingUrl?: string;
  signaling?: P2PSignalingClient;
  storage?: P2PStorage;
  relay?: MeshRelay;
  onMessage?: (fromFingerprint: string, plaintext: string) => void;
  onPeerStateChange?: (state: P2PConnectionState) => void;
  onError?: (error: Error, peerFingerprint?: string) => void;
  /** Cached prekey bundles older than this are refreshed before re-keying. */
  bundleMaxAgeMs?: number;
}

interface PeerRecord {
  fingerprint: string;
  bundle: PreKeyBundle | null;
  bundleUpdatedAt: number;
  session: RatchetState | null;
  channel: P2PMessengerChannel | null;
  pendingPayloads: RatchetMessagePayload[];
  pendingX3dhHeader: RatchetMessagePayload['x3dh'] | null;
  preKeyRequestSent: boolean;
}

const PREKEY_STORAGE_OWNER = 'self';
const ONE_TIME_PREKEY_COUNT = 100;
const DEFAULT_BUNDLE_MAX_AGE_MS = 5 * 60 * 1000;
const BUNDLE_REFRESH_TIMEOUT_MS = 2000;
const MAX_PREVIOUS_SIGNED_PREKEYS = 2;

export class P2PManager {
  private readonly identity: UserIdentity;
  private readonly signaling: P2PSignalingClient;
  private readonly storage?: P2PStorage;
  private readonly relay?: MeshRelay;
  private readonly onMessage?: (from: string, plaintext: string) => void;
  private readonly onPeerStateChange?: (state: P2PConnectionState) => void;
  private readonly onError?: (error: Error, peer?: string) => void;
  private readonly peers = new Map<string, PeerRecord>();
  private readonly bundleWaiters = new Map<string, Array<(bundle: PreKeyBundle) => void>>();
  private readonly bundleMaxAgeMs: number;
  private unsubscribeSignaling: (() => void) | null = null;
  private preKeyStore: PreKeyStoreState | null = null;
  private initialized = false;

  constructor(options: P2PManagerOptions) {
    this.identity = options.identity;
    this.signaling = options.signaling ?? new P2PSignalingClient({ url: options.signalingUrl });
    this.storage = options.storage;
    this.relay = options.relay;
    this.onMessage = options.onMessage;
    this.onPeerStateChange = options.onPeerStateChange;
    this.onError = options.onError;
    this.bundleMaxAgeMs = options.bundleMaxAgeMs ?? DEFAULT_BUNDLE_MAX_AGE_MS;

    this.unsubscribeSignaling = this.signaling.onMessage((message) => {
      void this.handleSignalingMessage(message);
    });

    this.relay?.onDeliver((envelope) => {
      if (envelope.sealed) {
        void this.handleIncomingPayload(
          envelope.origin,
          envelope.payload as RatchetMessagePayload
        ).catch((err) => {
          this.onError?.(err instanceof Error ? err : new Error(String(err)), envelope.origin);
        });
      }
    });
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.ensurePreKeys();
    this.initialized = true;
  }

  private createPreKeyStore(): PreKeyStoreState {
    const oneTimePreKeys: OneTimePreKey[] = [];
    for (let i = 0; i < ONE_TIME_PREKEY_COUNT; i += 1) {
      oneTimePreKeys.push(createOneTimePreKey(1 + i));
    }
    return {
      signedPreKey: createSignedPreKey(this.identity, 1),
      previousSignedPreKeys: [],
      oneTimePreKeys,
      nextPreKeyId: 1 + ONE_TIME_PREKEY_COUNT,
    };
  }

  private async ensurePreKeys(): Promise<PreKeyStoreState> {
    if (this.preKeyStore) return this.preKeyStore;

    let store = this.storage
      ? await this.storage.loadPreKeyStore<PreKeyStoreState>(PREKEY_STORAGE_OWNER)
      : null;

    if (!store || !store.signedPreKey || store.oneTimePreKeys.length === 0) {
      store = this.createPreKeyStore();
      await this.persistPreKeys(store);
    } else if (!Array.isArray(store.previousSignedPreKeys)) {
      store.previousSignedPreKeys = [];
    }

    this.preKeyStore = store;
    return store;
  }

  private async persistPreKeys(store: PreKeyStoreState): Promise<void> {
    if (this.storage) {
      await this.storage.savePreKeyStore(PREKEY_STORAGE_OWNER, store);
    }
  }

  public async getPreKeyBundle(): Promise<PreKeyBundle> {
    const store = await this.ensurePreKeys();
    const bundle = createPreKeyBundle(this.identity, store.signedPreKey, store.oneTimePreKeys[0]);
    // Advertise the PQ encapsulation key so initiators run the hybrid
    // handshake. Absent for identities created before PQ roll-out, which
    // negotiate the classical path honestly.
    const pqKem = await this.ensurePqKeyPair();
    return pqKem ? { ...bundle, pqKem } : bundle;
  }

  /**
   * Lazily generate (and persist) the ML-KEM-768 keypair. Returns only the
   * public half; the secret half stays in the prekey store.
   */
  private async ensurePqKeyPair(): Promise<string | null> {
    try {
      const store = await this.ensurePreKeys();
      if (store.pqKemPublicKey && store.pqKemSecretKey) {
        return store.pqKemPublicKey;
      }
      const pair = generatePqKemKeyPair();
      store.pqKemPublicKey = pair.publicKey;
      store.pqKemSecretKey = encodePqSecret(pair.secretKeyRaw);
      await this.persistPreKeys(store);
      return store.pqKemPublicKey;
    } catch (error) {
      // PQ key generation must never break the classical path.
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  public async rotateSignedPreKey(): Promise<PreKeyBundle> {
    const store = await this.ensurePreKeys();
    const previous = [store.signedPreKey, ...(store.previousSignedPreKeys ?? [])].slice(
      0,
      MAX_PREVIOUS_SIGNED_PREKEYS
    );
    store.previousSignedPreKeys = previous;
    store.signedPreKey = createSignedPreKey(this.identity, store.signedPreKey.keyId + 1000);
    await this.persistPreKeys(store);
    return createPreKeyBundle(this.identity, store.signedPreKey, store.oneTimePreKeys[0]);
  }

  private getPeer(fingerprint: string): PeerRecord {
    let peer = this.peers.get(fingerprint);
    if (!peer) {
      peer = {
        fingerprint,
        bundle: null,
        bundleUpdatedAt: 0,
        session: null,
        channel: null,
        pendingPayloads: [],
        pendingX3dhHeader: null,
        preKeyRequestSent: false,
      };
      this.peers.set(fingerprint, peer);
    }
    return peer;
  }

  public registerPeerBundle(fingerprint: string, bundle: PreKeyBundle): boolean {
    if (!verifyPreKeyBundle(bundle)) {
      this.onError?.(new Error('Peer prekey bundle verification failed'), fingerprint);
      return false;
    }
    const peer = this.getPeer(fingerprint);
    peer.bundle = bundle;
    peer.bundleUpdatedAt = Date.now();
    // A bundle arrived: allow a later refresh request again.
    peer.preKeyRequestSent = false;

    const waiters = this.bundleWaiters.get(fingerprint);
    if (waiters && waiters.length > 0) {
      this.bundleWaiters.delete(fingerprint);
      waiters.splice(0).forEach((resolve) => resolve(bundle));
    }
    return true;
  }

  /**
   * Returns the cached pre-key bundle for a peer, or `null` when none has been
   * registered yet. Used by the key-change journal so `checkPeerKey` can
   * compare against the bundle received over the real transport instead of the
   * local demo peer.
   */
  public getPeerBundle(fingerprint: string): PreKeyBundle | null {
    return this.getPeer(fingerprint).bundle ?? null;
  }

  private async loadSession(peer: PeerRecord): Promise<RatchetState | null> {
    if (peer.session) return peer.session;
    if (!this.storage) return null;
    const saved = await this.storage.loadSession<RatchetState>(`p2p:${peer.fingerprint}`);
    if (saved) peer.session = saved;
    return saved;
  }

  private async saveSession(peer: PeerRecord): Promise<void> {
    if (this.storage && peer.session) {
      await this.storage.saveSession(`p2p:${peer.fingerprint}`, peer.session);
    }
  }

  public async connect(peerFingerprint: string, bundle?: PreKeyBundle): Promise<void> {
    await this.initialize();
    if (bundle && !this.registerPeerBundle(peerFingerprint, bundle)) return;

    const peer = this.getPeer(peerFingerprint);
    if (peer.channel) return;

    const channel = new P2PMessengerChannel(
      this.identity.fingerprint,
      peerFingerprint,
      this.signaling
    );

    channel.onMessage((data) => {
      void this.handleRawPayload(peerFingerprint, data);
    });
    channel.onStateChange((state) => {
      this.onPeerStateChange?.(state);
      if (state.status === 'connected') {
        void this.flushPending(peer);
      }
    });

    peer.channel = channel;

    if (!peer.bundle) {
      await this.requestPreKeyBundle(peerFingerprint);
    }

    const shouldInitiate = this.identity.fingerprint < peerFingerprint && Boolean(peer.bundle);
    if (shouldInitiate) {
      await channel.connectAsInitiator();
    } else {
      await channel.connectAsResponder();
    }
  }

  private async requestPreKeyBundle(peerFingerprint: string, force = false): Promise<void> {
    const peer = this.getPeer(peerFingerprint);
    if (peer.preKeyRequestSent && !force) return;
    peer.preKeyRequestSent = true;
    await this.signaling.sendSignal({
      type: 'prekey_request',
      senderFingerprint: this.identity.fingerprint,
      targetFingerprint: peerFingerprint,
      payload: {},
    });
  }

  /**
   * Asks the peer for its current prekey bundle and waits briefly for the reply.
   * Used before re-keying so a rotated signed prekey is never reused from cache.
   * Resolves with `null` when the peer does not answer in time.
   */
  public async refreshPeerBundle(
    peerFingerprint: string,
    timeoutMs: number = BUNDLE_REFRESH_TIMEOUT_MS
  ): Promise<PreKeyBundle | null> {
    const peer = this.getPeer(peerFingerprint);
    const waiters = this.bundleWaiters.get(peerFingerprint) ?? [];

    const response = new Promise<PreKeyBundle | null>((resolve) => {
      const waiter = (bundle: PreKeyBundle) => {
        clearTimeout(timer);
        resolve(bundle);
      };
      const timer = setTimeout(() => {
        const current = this.bundleWaiters.get(peerFingerprint) ?? [];
        this.bundleWaiters.set(
          peerFingerprint,
          current.filter((entry) => entry !== waiter)
        );
        resolve(null);
      }, timeoutMs);
      waiters.push(waiter);
      this.bundleWaiters.set(peerFingerprint, waiters);
    });

    peer.preKeyRequestSent = false;
    await this.requestPreKeyBundle(peerFingerprint, true);
    return response;
  }

  private isBundleStale(peer: PeerRecord): boolean {
    if (!peer.bundle) return true;
    return Date.now() - peer.bundleUpdatedAt > this.bundleMaxAgeMs;
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    if (message.targetFingerprint !== this.identity.fingerprint) return;

    if (message.type === 'prekey_request') {
      const bundle = await this.getPreKeyBundle();
      await this.signaling.sendSignal({
        type: 'prekey_bundle',
        senderFingerprint: this.identity.fingerprint,
        targetFingerprint: message.senderFingerprint,
        payload: bundle,
      });
      return;
    }

    if (message.type === 'prekey_bundle') {
      const bundle = message.payload as PreKeyBundle;
      if (this.registerPeerBundle(message.senderFingerprint, bundle)) {
        await this.connect(message.senderFingerprint);
      }
    }
  }

  private async createOutboundSession(peer: PeerRecord): Promise<RatchetState> {
    if (!peer.bundle) {
      throw new Error(`No prekey bundle registered for ${peer.fingerprint}`);
    }
    const { state, header } = await createOutboundRatchetSession(this.identity, peer.bundle);
    peer.session = state;
    peer.pendingX3dhHeader = header;
    await this.saveSession(peer);
    return state;
  }

  private async ensureOutboundSession(peer: PeerRecord): Promise<RatchetState> {
    const existing = await this.loadSession(peer);
    if (existing) return existing;
    return this.createOutboundSession(peer);
  }

  private async handleRawPayload(peerFingerprint: string, raw: string): Promise<void> {
    try {
      const payload = JSON.parse(raw) as RatchetMessagePayload;
      await this.handleIncomingPayload(peerFingerprint, payload);
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)), peerFingerprint);
    }
  }

  private async handleIncomingPayload(
    peerFingerprint: string,
    payload: RatchetMessagePayload
  ): Promise<void> {
    if (
      payload.senderFingerprint !== peerFingerprint ||
      payload.recipientFingerprint !== this.identity.fingerprint
    ) {
      throw new Error('Encrypted payload routing metadata mismatch');
    }

    const peer = this.getPeer(peerFingerprint);
    let session = await this.loadSession(peer);

    // A peer-initiated re-key (sent after an edit or delete-for-everyone) arrives as
    // a fresh X3DH header carrying a higher generation. Accept it only if it moves
    // forward, so a replayed old header cannot roll the session keys backwards.
    const resetGeneration = payload.x3dh?.generation ?? 0;
    if (resetGeneration > 0) {
      const currentGeneration = session?.sessionGeneration ?? 0;
      if (resetGeneration <= currentGeneration) {
        throw new Error('Stale session reset rejected');
      }
      session = null;
    }

    if (!session) {
      if (!payload.x3dh) {
        throw new Error('No ratchet session and no X3DH header');
      }
      const store = await this.ensurePreKeys();
      const signedPreKey = [store.signedPreKey, ...(store.previousSignedPreKeys ?? [])].find(
        (key) => key.keyId === payload.x3dh!.signedPreKeyId
      );
      if (!signedPreKey) {
        throw new Error('Unknown signed prekey');
      }
      const oneTimePreKey =
        payload.x3dh.oneTimePreKeyId === undefined
          ? null
          : store.oneTimePreKeys.find((key) => key.keyId === payload.x3dh!.oneTimePreKeyId) ?? null;

      if (!oneTimePreKey && payload.x3dh.oneTimePreKeyId !== undefined) {
        throw new Error('One-time prekey already consumed');
      }

      session = await createInboundRatchetSession(this.identity, signedPreKey, oneTimePreKey, payload.x3dh, {
        localPqSecret: store?.pqKemSecretKey,
      });

      if (oneTimePreKey) {
        store.oneTimePreKeys = store.oneTimePreKeys.filter(
          (key) => key.keyId !== oneTimePreKey.keyId
        );
        await this.persistPreKeys(store);
      }
    }

    const { plaintext, updatedState } = await ratchetDecryptMessage(session, payload);
    peer.session = updatedState;
    await this.saveSession(peer);

    if (plaintext) {
      this.onMessage?.(peerFingerprint, plaintext);
    }
  }

  /**
   * Starts a fresh X3DH session with the peer so message keys derived before an
   * edit or a delete-for-everyone are never reused.
   *
   * The reset reuses the peer's cached pre-key bundle and deliberately omits the
   * one-time prekey (already consumed). It is announced in-band by a generation
   * counter inside the signed X3DH header, so no extra signaling round trip is
   * required. Returns false when the reset cannot start yet (no bundle known, or
   * the first handshake has not been sent) — the caller can retry after the bundle
   * request completes.
   */
  public async rekeySession(peerFingerprint: string): Promise<boolean> {
    const peer = this.getPeer(peerFingerprint);
    if (peer.pendingX3dhHeader) return false;

    if (!peer.bundle) {
      await this.requestPreKeyBundle(peerFingerprint);
      return false;
    }

    // Pull the peer's current bundle before re-keying: if it rotated its signed
    // prekey, the cached one would be rejected as unknown. Fall back to the cache
    // when the peer cannot answer right now.
    if (this.isBundleStale(peer)) {
      const refreshed = await this.refreshPeerBundle(peerFingerprint);
      if (refreshed) peer.bundle = refreshed;
    }

    const session = await this.loadSession(peer);
    const generation = (session?.sessionGeneration ?? 0) + 1;
    const { state, header } = await createOutboundRatchetSession(
      this.identity,
      { ...peer.bundle, oneTimePreKey: undefined },
      { generation }
    );

    peer.session = state;
    peer.pendingX3dhHeader = header;
    await this.saveSession(peer);
    return true;
  }

  /** Re-keys every peer with a known bundle; returns how many were re-keyed. */
  public async rekeyAllSessions(): Promise<number> {
    let rekeyed = 0;
    for (const peer of this.peers.values()) {
      if (await this.rekeySession(peer.fingerprint)) rekeyed += 1;
    }
    return rekeyed;
  }

  public async sendMessage(peerFingerprint: string, plaintext: string): Promise<boolean> {
    await this.initialize();
    const peer = this.getPeer(peerFingerprint);

    if (!(await this.loadSession(peer)) && !peer.bundle) {
      await this.requestPreKeyBundle(peerFingerprint);
      throw new Error(`Waiting for prekey bundle from ${peerFingerprint}`);
    }

    const session = await this.ensureOutboundSession(peer);
    const { payload, updatedState } = await ratchetEncryptMessage(
      session,
      plaintext,
      this.identity.fingerprint,
      peerFingerprint,
      peer.pendingX3dhHeader ?? undefined
    );

    peer.pendingX3dhHeader = null;
    peer.session = updatedState;
    await this.saveSession(peer);
    return this.dispatchPayload(peer, payload);
  }

  private dispatchPayload(peer: PeerRecord, payload: RatchetMessagePayload): boolean {
    if (peer.channel?.sendData(JSON.stringify(payload))) {
      return true;
    }
    if (this.relay?.send(peer.fingerprint, payload)) {
      return true;
    }
    peer.pendingPayloads.push(payload);
    return false;
  }

  private async flushPending(peer: PeerRecord): Promise<void> {
    const pending = peer.pendingPayloads.splice(0);
    for (const payload of pending) {
      if (!this.dispatchPayload(peer, payload)) {
        break;
      }
    }
  }

  public getPeerState(fingerprint: string): P2PConnectionState | null {
    return this.peers.get(fingerprint)?.channel?.currentState ?? null;
  }

  public listPeers(): string[] {
    return Array.from(this.peers.keys());
  }

  public close(): void {
    this.unsubscribeSignaling?.();
    this.unsubscribeSignaling = null;
    this.peers.forEach((peer) => peer.channel?.close());
    this.peers.clear();
    this.signaling.close();
    this.relay?.close();
  }
}
