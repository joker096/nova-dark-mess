/**
 * BotGateway — runs a headless P2PManager for a bot identity.
 * 
 * The gateway:
 * 1. Loads/generates the bot's X3DH identity (Ed25519 + X25519 + PQ-KEM)
 * 2. Runs a P2PManager joining the mesh as a regular participant
 * 3. Handles incoming E2EE messages, forwards to bot runtime via callbacks
 * 4. Sends outgoing messages from bot runtime to peers via P2P
 * 5. Manages prekey bundles, session rekeying, group Sender Keys
 */

import {
  UserIdentity,
  PreKeyBundle,
  SignedPreKey,
  OneTimePreKey,
  createOneTimePreKey,
  createSignedPreKey,
  generateX25519KeyPair,
  generatePqKemKeyPair,
  encodePqSecret,
} from '@nova/crypto';

export interface GatewayMessage {
  type: 'incoming' | 'outgoing' | 'callback' | 'typing';
  chatId: string;
  messageId?: string;
  fromFingerprint?: string;
  text?: string;
  keyboard?: any;
  photo?: string;
  caption?: string;
  edit?: { messageId: string; text: string; keyboard?: any };
  delete?: string;
  callbackQuery?: { queryId: string; data: string; from: string };
  typing?: { isTyping: boolean };
  timestamp: number;
}

export interface GatewayCallbacks {
  onIncomingMessage?: (chatId: string, fromFingerprint: string, text: string, messageId: string) => void;
  onOutgoingAck?: (messageId: string, success: boolean) => void;
  onEdit?: (chatId: string, messageId: string, text: string, keyboard?: any) => void;
  onDelete?: (chatId: string, messageId: string) => void;
  onCallbackQuery?: (queryId: string, data: string, from: string) => void;
  onTyping?: (chatId: string, isTyping: boolean) => void;
  onPeerConnected?: (fingerprint: string) => void;
  onPeerDisconnected?: (fingerprint: string) => void;
  onError?: (error: Error) => void;
}

export interface BotGatewayOptions {
  /** Bot's identity (must include Ed25519 signing key + X25519 encryption key) */
  identity: UserIdentity;
  /** Signaling server URL (WebSocket) for X3DH bundle exchange */
  signalingUrl?: string;
  /** Optional persistent storage for prekey store and sessions */
  storage?: GatewayStorage;
  /** Optional MeshRelay for store-and-forward when peers offline */
  relay?: MeshRelay;
  /** Callbacks for bot runtime integration */
  callbacks?: GatewayCallbacks;
  /** Auto-refresh prekey bundles older than this (default 5 min) */
  bundleMaxAgeMs?: number;
}

export interface GatewayStorage {
  loadPreKeyStore(): Promise<PreKeyStoreState | null>;
  savePreKeyStore(store: PreKeyStoreState): Promise<void>;
  loadSession(chatId: string): Promise<SessionState | null>;
  saveSession(chatId: string, session: SessionState): Promise<void>;
  loadGroupSenderKey(groupId: string): Promise<SenderKeyState | null>;
  saveGroupSenderKey(groupId: string, state: SenderKeyState): Promise<void>;
}

export interface PreKeyStoreState {
  signedPreKey: SignedPreKey;
  previousSignedPreKeys?: SignedPreKey[];
  oneTimePreKeys: OneTimePreKey[];
  nextPreKeyId: number;
  pqKemPublicKey?: string;
  pqKemSecretKey?: string;
}

export interface SessionState {
  ratchetState: any; // RatchetState from crypto/ratchet
  theirFingerprint: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface SenderKeyState {
  chainKey: Uint8Array;
  messageIndex: number;
  members: Map<string, { chainKey: Uint8Array; index: number }>;
}

export interface MeshRelay {
  send(fingerprint: string, payload: Uint8Array): Promise<void>;
  onMessage(handler: (from: string, payload: Uint8Array) => void): void;
}

export class BotGateway {
  private readonly options: Required<BotGatewayOptions>;
  private manager: any = null; // P2PManager instance
  private peerChannels = new Map<string, any>(); // P2PMessengerChannel
  private messageHandlers = new Map<string, (msg: any) => void>();
  private initialized = false;
  private shuttingDown = false;

  constructor(options: BotGatewayOptions) {
    this.options = {
      identity: options.identity,
      signalingUrl: options.signalingUrl ?? 'wss://signaling.nova.messenger',
      storage: options.storage ?? new InMemoryGatewayStorage(),
      relay: options.relay,
      callbacks: options.callbacks ?? {},
      bundleMaxAgeMs: options.bundleMaxAgeMs ?? 5 * 60 * 1000,
    };
  }

  /** Initialize the gateway: load identity, start P2PManager, connect to signaling. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Load or generate prekey store
    await this.ensurePreKeyStore();
    
    // Import P2PManager dynamically (avoids circular deps)
    const { P2PManager } = await import('../../lib/p2p/p2pManager');
    const { P2PSignalingClient } = await import('../../lib/p2p/signaling');
    
    // Create signaling client
    const signaling = new P2PSignalingClient({ url: this.options.signalingUrl });
    
    // Create P2PManager
    this.manager = new P2PManager({
      identity: this.options.identity,
      signaling,
      storage: this.createP2PStorageAdapter(),
      relay: this.options.relay,
      onMessage: this.handleIncomingMessage.bind(this),
      onPeerStateChange: this.handlePeerStateChange.bind(this),
      onError: this.handleError.bind(this),
      bundleMaxAgeMs: this.options.bundleMaxAgeMs,
    });
    
    // Connect to signaling
    await this.manager.connect();
    
    // Start periodic prekey refresh
    this.startPreKeyRefresh();
    
    this.initialized = true;
    console.log(`[BotGateway] Initialized for ${this.options.identity.fingerprint}`);
  }

  /** Get the bot's public prekey bundle for other peers to initiate X3DH. */
  async getPreKeyBundle(): Promise<PreKeyBundle> {
    await this.ensurePreKeyStore();
    return this.buildPreKeyBundle();
  }

  /** Send a message to a peer (by their fingerprint). */
  async sendMessage(chatId: string, toFingerprint: string, message: GatewayMessage): Promise<boolean> {
    if (!this.manager) throw new Error('Gateway not initialized');
    
    try {
      await this.manager.sendMessage(toFingerprint, {
        type: 'message',
        payload: {
          messageId: message.messageId,
          chatId,
          text: message.text ?? '',
          keyboard: message.keyboard,
          photo: message.photo,
          caption: message.caption,
          timestamp: message.timestamp,
          botMessage: true,
        },
      });
      
      this.options.callbacks.onOutgoingAck?.(message.messageId!, true);
      return true;
    } catch (error) {
      this.options.callbacks.onOutgoingAck?.(message.messageId!, false);
      this.options.callbacks.onError?.(error as Error);
      return false;
    }
  }

  /** Edit a previously sent message. */
  async editMessage(chatId: string, toFingerprint: string, messageId: string, text: string, keyboard?: any): Promise<boolean> {
    if (!this.manager) throw new Error('Gateway not initialized');
    
    try {
      await this.manager.sendMessage(toFingerprint, {
        type: 'edit',
        payload: { messageId, text, keyboard, chatId, timestamp: Date.now() },
      });
      return true;
    } catch (error) {
      this.options.callbacks.onError?.(error as Error);
      return false;
    }
  }

  /** Delete a message. */
  async deleteMessage(chatId: string, toFingerprint: string, messageId: string): Promise<boolean> {
    if (!this.manager) throw new Error('Gateway not initialized');
    
    try {
      await this.manager.sendMessage(toFingerprint, {
        type: 'delete',
        payload: { messageId, chatId, timestamp: Date.now() },
      });
      return true;
    } catch (error) {
      this.options.callbacks.onError?.(error as Error);
      return false;
    }
  }

  /** Answer a callback query. */
  async answerCallbackQuery(queryId: string, options?: { text?: string; showAlert?: boolean }): Promise<void> {
    // Callback queries are routed through the signaling/bot chat
    // This would need a specific chat ID mapping
    console.log('[BotGateway] answerCallbackQuery:', queryId, options);
  }

  /** Send typing indicator. */
  async sendTyping(chatId: string, toFingerprint: string, isTyping: boolean): Promise<void> {
    if (!this.manager) return;
    
    await this.manager.sendMessage(toFingerprint, {
      type: 'typing',
      payload: { chatId, isTyping, timestamp: Date.now() },
    });
  }

  /** Register a handler for incoming messages from a specific peer. */
  onMessageFrom(fingerprint: string, handler: (msg: any) => void): void {
    this.messageHandlers.set(fingerprint, handler);
  }

  /** Get the bot's fingerprint. */
  getFingerprint(): string {
    return this.options.identity.fingerprint;
  }

  /** Get connection state for a peer. */
  getPeerState(fingerprint: string): string | null {
    return this.manager?.getPeerState?.(fingerprint) ?? null;
  }

  /** Shutdown the gateway gracefully. */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.manager) {
      await this.manager.disconnect();
      this.manager = null;
    }
    this.initialized = false;
    console.log('[BotGateway] Shutdown complete');
  }

  // Private methods

  private async ensurePreKeyStore(): Promise<void> {
    const store = await this.options.storage.loadPreKeyStore();
    if (store) {
      // Validate and use existing store
      this.preKeyStore = store;
      return;
    }
    // Generate new prekey store
    await this.generatePreKeyStore();
    await this.options.storage.savePreKeyStore(this.preKeyStore!);
  }

  private async generatePreKeyStore(): Promise<void> {
    const { generateX25519KeyPair, generatePqKemKeyPair, createSignedPreKey, createOneTimePreKey } = 
      await import('@nova/crypto');
    
    const identityKey = generateX25519KeyPair();
    const pqKem = generatePqKemKeyPair();
    
    const signedPreKey = await createSignedPreKey(
      identityKey.privateKey,
      this.options.identity.signingKey,
      1
    );
    
    const oneTimePreKeys: OneTimePreKey[] = [];
    for (let i = 0; i < 100; i++) {
      oneTimePreKeys.push(await createOneTimePreKey(identityKey.privateKey, i + 1));
    }
    
    this.preKeyStore = {
      signedPreKey,
      oneTimePreKeys,
      nextPreKeyId: 101,
      pqKemPublicKey: pqKem.publicKey,
      pqKemSecretKey: pqKem.secretKey,
    };
  }

  private async buildPreKeyBundle(): Promise<PreKeyBundle> {
    if (!this.preKeyStore) await this.ensurePreKeyStore();
    
    const { createPreKeyBundle } = await import('@nova/crypto');
    return createPreKeyBundle(
      this.options.identity,
      this.preKeyStore!.signedPreKey,
      this.preKeyStore!.oneTimePreKeys.slice(0, 10),
      this.preKeyStore!.pqKemPublicKey
    );
  }

  private createP2PStorageAdapter(): any {
    return {
      loadPreKeyStore: () => this.options.storage.loadPreKeyStore(),
      savePreKeyStore: (store: any) => this.options.storage.savePreKeyStore(store),
      loadSession: (chatId: string) => this.options.storage.loadSession(chatId),
      saveSession: (chatId: string, session: any) => this.options.storage.saveSession(chatId, session),
    };
  }

  private async handleIncomingMessage(fromFingerprint: string, plaintext: string): Promise<void> {
    try {
      const message = JSON.parse(plaintext);
      
      // Route to registered handler if exists
      const handler = this.messageHandlers.get(fromFingerprint);
      if (handler) {
        handler(message);
        return;
      }
      
      // Default routing based on message type
      switch (message.type) {
        case 'message':
          this.options.callbacks.onIncomingMessage?.(
            message.payload.chatId,
            fromFingerprint,
            message.payload.text,
            message.payload.messageId
          );
          break;
        case 'edit':
          this.options.callbacks.onEdit?.(
            message.payload.chatId,
            message.payload.messageId,
            message.payload.text,
            message.payload.keyboard
          );
          break;
        case 'delete':
          this.options.callbacks.onDelete?.(
            message.payload.chatId,
            message.payload.messageId
          );
          break;
        case 'callback':
          this.options.callbacks.onCallbackQuery?.(
            message.payload.queryId,
            message.payload.data,
            fromFingerprint
          );
          break;
        case 'typing':
          this.options.callbacks.onTyping?.(
            message.payload.chatId,
            message.payload.isTyping
          );
          break;
      }
    } catch (error) {
      console.error('[BotGateway] Failed to handle incoming message:', error);
      this.options.callbacks.onError?.(error as Error);
    }
  }

  private handlePeerStateChange(state: any): void {
    if (state.type === 'connected') {
      this.options.callbacks.onPeerConnected?.(state.peerFingerprint);
    } else if (state.type === 'disconnected') {
      this.options.callbacks.onPeerDisconnected?.(state.peerFingerprint);
    }
  }

  private handleError(error: Error, peerFingerprint?: string): void {
    console.error('[BotGateway] Error:', error, peerFingerprint);
    this.options.callbacks.onError?.(error);
  }

  private startPreKeyRefresh(): void {
    setInterval(async () => {
      if (this.shuttingDown) return;
      try {
        // Check if signed prekey needs rotation (older than 7 days)
        // For now, just log
        console.log('[BotGateway] Prekey refresh check');
      } catch (error) {
        console.error('[BotGateway] Prekey refresh failed:', error);
      }
    }, this.options.bundleMaxAgeMs);
  }
}

/** In-memory storage implementation for testing/dev. */
class InMemoryGatewayStorage implements GatewayStorage {
  private preKeyStore: PreKeyStoreState | null = null;
  private sessions = new Map<string, SessionState>();
  private groupKeys = new Map<string, SenderKeyState>();

  async loadPreKeyStore(): Promise<PreKeyStoreState | null> {
    return this.preKeyStore;
  }
  async savePreKeyStore(store: PreKeyStoreState): Promise<void> {
    this.preKeyStore = store;
  }
  async loadSession(chatId: string): Promise<SessionState | null> {
    return this.sessions.get(chatId) ?? null;
  }
  async saveSession(chatId: string, session: SessionState): Promise<void> {
    this.sessions.set(chatId, session);
  }
  async loadGroupSenderKey(groupId: string): Promise<SenderKeyState | null> {
    return this.groupKeys.get(groupId) ?? null;
  }
  async saveGroupSenderKey(groupId: string, state: SenderKeyState): Promise<void> {
    this.groupKeys.set(groupId, state);
  }
}