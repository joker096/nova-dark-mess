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
  oneTimePreKeys: OneTimePreKey[];
  nextPreKeyId: number;
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
}

interface PeerRecord {
  fingerprint: string;
  bundle: PreKeyBundle | null;
  session: RatchetState | null;
  channel: P2PMessengerChannel | null;
  pendingPayloads: RatchetMessagePayload[];
  pendingX3dhHeader: RatchetMessagePayload['x3dh'] | null;
  preKeyRequestSent: boolean;
}

const PREKEY_STORAGE_OWNER = 'self';
const ONE_TIME_PREKEY_COUNT = 100;

export class P2PManager {
  private readonly identity: UserIdentity;
  private readonly signaling: P2PSignalingClient;
  private readonly storage?: P2PStorage;
  private readonly relay?: MeshRelay;
  private readonly onMessage?: (from: string, plaintext: string) => void;
  private readonly onPeerStateChange?: (state: P2PConnectionState) => void;
  private readonly onError?: (error: Error, peer?: string) => void;
  private readonly peers = new Map<string, PeerRecord>();
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

    this.unsubscribeSignaling = this.signaling.onMessage((message) => {
      void this.handleSignalingMessage(message);
    });

    this.relay?.onDeliver((envelope) => {
      if (envelope.sealed) {
        void this.handleIncomingPayload(envelope.origin, envelope.payload as RatchetMessagePayload);
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
    return createPreKeyBundle(this.identity, store.signedPreKey, store.oneTimePreKeys[0]);
  }

  public async rotateSignedPreKey(): Promise<PreKeyBundle> {
    const store = await this.ensurePreKeys();
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
    return true;
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

  private async requestPreKeyBundle(peerFingerprint: string): Promise<void> {
    const peer = this.getPeer(peerFingerprint);
    if (peer.preKeyRequestSent) return;
    peer.preKeyRequestSent = true;
    await this.signaling.sendSignal({
      type: 'prekey_request',
      senderFingerprint: this.identity.fingerprint,
      targetFingerprint: peerFingerprint,
      payload: {},
    });
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

    if (!session) {
      if (!payload.x3dh) {
        throw new Error('No ratchet session and no X3DH header');
      }
      const store = await this.ensurePreKeys();
      if (payload.x3dh.signedPreKeyId !== store.signedPreKey.keyId) {
        throw new Error('Unknown signed prekey');
      }
      const oneTimePreKey =
        payload.x3dh.oneTimePreKeyId === undefined
          ? null
          : store.oneTimePreKeys.find((key) => key.keyId === payload.x3dh!.oneTimePreKeyId) ?? null;

      if (!oneTimePreKey && payload.x3dh.oneTimePreKeyId !== undefined) {
        throw new Error('One-time prekey already consumed');
      }

      session = await createInboundRatchetSession(
        this.identity,
        store.signedPreKey,
        oneTimePreKey,
        payload.x3dh
      );

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
