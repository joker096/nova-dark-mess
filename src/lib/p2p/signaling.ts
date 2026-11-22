import { sha256Hex } from '../crypto/aes';
import { base64ToBuffer, bufferToBase64 } from '../crypto/aes';
import { ed25519 } from '@noble/curves/ed25519.js';
import { fingerprintFromSigningKey } from '../crypto/identity';

export type SignalingMessageType =
  | 'offer'
  | 'answer'
  | 'candidate'
  | 'ping'
  | 'pow_challenge'
  | 'presence'
  | 'prekey_request'
  | 'prekey_bundle'
  | 'call_invite'
  | 'call_accept'
  | 'call_decline'
  | 'call_end'
  // Group mesh call signalling, relayed like any other message.
  | 'group-call-invite'
  | 'group-call-offer'
  | 'group-call-answer'
  | 'group-call-candidate'
  | 'group-call-leave'
  | 'group-call-end';

export interface SignalingMessage {
  type: SignalingMessageType;
  senderFingerprint: string;
  targetFingerprint: string;
  payload: unknown;
  nonce?: number;
  timestamp?: number;
  signature?: string;
  signingPublicKey?: string;
}

export type SignalingStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SignalingOptions {
  url?: string;
  reconnect?: boolean;
  maxReconnectDelayMs?: number;
  // Fingerprint to announce to a remote signaling server as soon as the socket
  // opens (and again after every reconnect). Without this the peer is never
  // registered as a delivery target and incoming calls/signaling are dropped.
  registerFingerprint?: string;
  // Ed25519 signing key (base64) used to sign outgoing signaling messages.
  signingPrivateKey?: string;
  // Matching Ed25519 public key (base64). Derived from the private key if omitted.
  signingPublicKey?: string;
}

type MessageListener = (msg: SignalingMessage) => void;
type StatusListener = (status: SignalingStatus) => void;

const LOCAL_CHANNEL_NAME = 'nova_signaling_bus';

export class P2PSignalingClient {
  private socket: WebSocket | null = null;
  private localChannel: BroadcastChannel | null = null;
  private messageListeners = new Set<MessageListener>();
  private statusListeners = new Set<StatusListener>();
  private outbox: SignalingMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private status: SignalingStatus = 'disconnected';
  private readonly url?: string;
  private readonly reconnect: boolean;
  private readonly maxReconnectDelayMs: number;
  private readonly registerFingerprint?: string;
  private readonly signingPrivateKey?: string;
  private readonly signingPublicKey?: string;

  constructor(options: SignalingOptions = {}) {
    this.url = options.url;
    this.reconnect = options.reconnect ?? true;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;
    this.registerFingerprint = options.registerFingerprint;
    this.signingPrivateKey = options.signingPrivateKey;
    this.signingPublicKey = options.signingPublicKey
      ?? (options.signingPrivateKey
        ? bufferToBase64(ed25519.getPublicKey(base64ToBuffer(options.signingPrivateKey)))
        : undefined);
  }

  public onMessage(callback: MessageListener): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  public onStatus(callback: StatusListener): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  public getStatus(): SignalingStatus {
    return this.status;
  }

  private setStatus(status: SignalingStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  private canonicalMessage(message: SignalingMessage): Uint8Array {
    const obj = {
      type: message.type,
      senderFingerprint: message.senderFingerprint,
      targetFingerprint: message.targetFingerprint,
      payload: message.payload ?? null,
      nonce: message.nonce ?? null,
      timestamp: message.timestamp ?? null,
      signingPublicKey: message.signingPublicKey ?? null,
    };
    return new TextEncoder().encode(JSON.stringify(obj));
  }

  private verifyIncoming(message: SignalingMessage): boolean {
    // Backward compatible: unsigned messages are accepted so older clients and
    // test harnesses keep working. Signed messages are strictly verified.
    if (!message.signature || !message.signingPublicKey) return true;
    if (fingerprintFromSigningKey(message.signingPublicKey) !== message.senderFingerprint) {
      return false;
    }
    try {
      return ed25519.verify(
        base64ToBuffer(message.signature),
        this.canonicalMessage(message),
        base64ToBuffer(message.signingPublicKey),
      );
    } catch {
      return false;
    }
  }

  private emit(message: SignalingMessage): void {
    if (!this.verifyIncoming(message)) return;
    this.messageListeners.forEach((listener) => listener(message));
  }

  public async connect(): Promise<boolean> {
    this.closedByUser = false;

    if (!this.url) {
      if (typeof BroadcastChannel === 'undefined') {
        this.setStatus('error');
        return false;
      }
      if (!this.localChannel) {
        this.localChannel = new BroadcastChannel(LOCAL_CHANNEL_NAME);
        this.localChannel.onmessage = (event: MessageEvent<SignalingMessage>) => {
          if (event.data && event.data.senderFingerprint) {
            this.emit(event.data);
          }
        };
      }
      const queued = this.outbox.splice(0);
      for (const message of queued) {
        this.localChannel.postMessage(message);
      }
      this.setStatus('connected');
      return true;
    }

    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return true;
    }

    this.setStatus('connecting');
    return new Promise<boolean>((resolve) => {
      let settled = false;
      try {
        const socket = new WebSocket(this.url!);
        this.socket = socket;

        socket.onopen = () => {
          if (this.closedByUser) {
            try { socket.close(); } catch { void 0; }
            return;
          }
          this.reconnectAttempts = 0;
          this.setStatus('connected');
          this.flushOutbox();
          if (this.registerFingerprint) {
            this.sendRaw({
              type: 'ping',
              senderFingerprint: this.registerFingerprint,
              targetFingerprint: this.registerFingerprint,
            });
          }
          if (!settled) {
            settled = true;
            resolve(true);
          }
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as SignalingMessage | {
              type: 'pow_challenge';
              payload: { prefix: string; difficulty: number };
            };

            if (message.type === 'pow_challenge') {
              const challenge = message.payload as { prefix: string; difficulty: number };
              void P2PSignalingClient.solvePoWChallenge(
                challenge.prefix,
                challenge.difficulty
              ).then((nonce) => {
                this.sendRaw({ type: 'ping', nonce });
              });
              return;
            }

            this.emit(message as SignalingMessage);
          } catch {
            this.setStatus('error');
          }
        };

        socket.onerror = () => {
          this.setStatus('error');
          if (!settled) {
            settled = true;
            resolve(false);
          }
        };

        socket.onclose = () => {
          this.socket = null;
          if (!settled) {
            settled = true;
            resolve(false);
          }
          if (!this.closedByUser) {
            this.setStatus('disconnected');
            this.scheduleReconnect();
          }
        };
      } catch {
        this.setStatus('error');
        resolve(false);
      }
    });
  }

  private scheduleReconnect(): void {
    if (!this.reconnect || this.reconnectTimer || this.closedByUser) return;
    const delay = Math.min(
      this.maxReconnectDelayMs,
      1000 * Math.pow(2, this.reconnectAttempts)
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private sendRaw(message: Partial<SignalingMessage> & { type: SignalingMessageType; nonce?: number }): void {
    if (this.localChannel) {
      this.localChannel.postMessage(message);
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private flushOutbox(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    while (this.outbox.length > 0) {
      const message = this.outbox.shift()!;
      this.socket.send(JSON.stringify(message));
    }
  }

  public async sendSignal(message: SignalingMessage): Promise<void> {
    const outgoing: SignalingMessage = {
      ...message,
      timestamp: message.timestamp ?? Date.now(),
      signingPublicKey: this.signingPublicKey,
    };

    if (this.signingPrivateKey && this.signingPublicKey) {
      outgoing.signature = bufferToBase64(
        ed25519.sign(this.canonicalMessage(outgoing), base64ToBuffer(this.signingPrivateKey)),
      );
    }

    if (this.localChannel) {
      this.localChannel.postMessage(outgoing);
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(outgoing));
      return;
    }

    this.outbox.push(outgoing);
    if (!this.socket && this.status !== 'connecting') {
      this.setStatus('disconnected');
    }
  }

  public close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      const socket = this.socket;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket.readyState === WebSocket.CONNECTING) {
        // Avoid "closed before the connection is established" warnings by
        // waiting for the handshake to finish before closing.
        socket.addEventListener('open', () => {
          try { socket.close(); } catch { void 0; }
        }, { once: true });
      }
      this.socket = null;
    }
    if (this.localChannel) {
      this.localChannel.close();
      this.localChannel = null;
    }
    this.setStatus('disconnected');
  }

  public static async solvePoWChallenge(prefix: string, difficulty = 3): Promise<number> {
    const safeDifficulty = Math.max(1, Math.min(6, Math.floor(difficulty)));
    const target = '0'.repeat(safeDifficulty);
    let nonce = 0;

    while (nonce < 5000000) {
      const hash = await sha256Hex(`${prefix}_${nonce}`);
      if (hash.startsWith(target)) {
        return nonce;
      }
      nonce += 1;
    }

    throw new Error('Proof-of-work challenge was not solved');
  }
}
