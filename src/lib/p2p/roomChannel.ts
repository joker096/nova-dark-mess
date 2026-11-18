/**
 * Serverless WebRTC DataChannel mesh for a chat room.
 *
 * Peers announce themselves over a same-origin BroadcastChannel (open tabs on
 * this device) and exchange SDP/ICE over it. The media path is then a real
 * RTCPeerConnection DataChannel; ICE uses host candidates only, so no STUN or
 * TURN server is contacted and nothing leaves the local network.
 *
 * When WebRTC or BroadcastChannel is unavailable the channel stays inert and
 * `isConnected()` is false, which lets callers fall back to local delivery.
 */

export type RoomMessageHandler = (peerId: string, data: string | ArrayBuffer) => void;

export interface RoomDataChannelOptions {
  room: string;
  selfId?: string;
  onMessage: RoomMessageHandler;
  onPeerCountChange?: (peerCount: number) => void;
  createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnection;
  createSignalChannel?: (name: string) => BroadcastChannel | null;
}

interface PeerState {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescriptionSet: boolean;
  initiator: boolean;
}

type SignalMessage =
  | { kind: 'hello'; from: string }
  | { kind: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'candidate'; from: string; to: string; candidate: RTCIceCandidateInit };

const SIGNAL_PREFIX = 'nova_room_';
const HELLO_INTERVAL_MS = 3000;
const RECONNECT_DELAY_MS = 1000;

function randomId(): string {
  // Peer ids identify a node inside a room; a predictable id can be squatted,
  // so fail loudly rather than degrade to Math.random().
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random generator is unavailable');
  }
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isRoomChannelSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined' && typeof BroadcastChannel !== 'undefined';
}

export class RoomDataChannel {
  public readonly selfId: string;
  private readonly room: string;
  private readonly options: RoomDataChannelOptions;
  private readonly peers = new Map<string, PeerState>();
  private signalChannel: BroadcastChannel | null = null;
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;
  private started = false;

  constructor(options: RoomDataChannelOptions) {
    this.options = options;
    this.room = options.room;
    this.selfId = options.selfId ?? randomId();
  }

  public start(): void {
    if (this.started || this.disposed) return;
    this.started = true;

    if (typeof BroadcastChannel === 'undefined') return;

    const createSignalChannel = this.options.createSignalChannel;
    let channel: BroadcastChannel | null;
    try {
      channel = createSignalChannel
        ? createSignalChannel(`${SIGNAL_PREFIX}${this.room}`)
        : new BroadcastChannel(`${SIGNAL_PREFIX}${this.room}`);
    } catch {
      channel = null;
    }
    if (!channel) {
      this.signalChannel = null;
      return;
    }
    this.signalChannel = channel;

    this.signalChannel.onmessage = (event: MessageEvent<SignalMessage>) => {
      void this.handleSignal(event.data);
    };

    this.announce();
    this.helloTimer = setInterval(() => this.announce(), HELLO_INTERVAL_MS);
  }

  public isConnected(): boolean {
    return this.countOpenChannels() > 0;
  }

  public getPeerCount(): number {
    return this.countOpenChannels();
  }

  /** Sends to every open peer channel; returns how many peers accepted it. */
  public send(data: string | ArrayBuffer): number {
    let delivered = 0;
    for (const peer of this.peers.values()) {
      if (peer.channel?.readyState === 'open') {
        try {
          if (typeof data === 'string') {
            peer.channel.send(data);
          } else {
            peer.channel.send(data);
          }
          delivered += 1;
        } catch {
          /* channel closed between the check and the send */
        }
      }
    }
    return delivered;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.helloTimer) {
      clearInterval(this.helloTimer);
      this.helloTimer = null;
    }
    for (const timer of this.reconnectTimers) clearTimeout(timer);
    this.reconnectTimers.clear();

    for (const peer of this.peers.values()) {
      peer.channel?.close();
      peer.pc.close();
    }
    this.peers.clear();

    if (this.signalChannel) {
      this.signalChannel.onmessage = null;
      this.signalChannel.close();
      this.signalChannel = null;
    }
  }

  private announce(): void {
    this.post({ kind: 'hello', from: this.selfId });
  }

  private post(message: SignalMessage): void {
    if (!this.signalChannel) return;
    try {
      this.signalChannel.postMessage(message);
    } catch {
      /* channel closed */
    }
  }

  private countOpenChannels(): number {
    let open = 0;
    for (const peer of this.peers.values()) {
      if (peer.channel?.readyState === 'open') open += 1;
    }
    return open;
  }

  private notifyPeerCount(): void {
    this.options.onPeerCountChange?.(this.countOpenChannels());
  }

  private createPeerConnection(): RTCPeerConnection {
    const factory = this.options.createPeerConnection;
    const config: RTCConfiguration = { iceServers: [] };
    return factory ? factory(config) : new RTCPeerConnection(config);
  }

  private getOrCreatePeer(peerId: string, initiator: boolean): PeerState {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = this.createPeerConnection();
    const state: PeerState = {
      pc,
      channel: null,
      pendingCandidates: [],
      remoteDescriptionSet: false,
      initiator,
    };
    this.peers.set(peerId, state);

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.post({
        kind: 'candidate',
        from: this.selfId,
        to: peerId,
        candidate: event.candidate.toJSON(),
      });
    };

    pc.ondatachannel = (event) => this.attachChannel(peerId, event.channel);

    return state;
  }

  private attachChannel(peerId: string, channel: RTCDataChannel): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      channel.close();
      return;
    }
    peer.channel = channel;

    channel.onmessage = (event: MessageEvent) => {
      this.options.onMessage(peerId, event.data as string | ArrayBuffer);
    };

    channel.onopen = () => {
      this.notifyPeerCount();
    };

    channel.onclose = () => {
      this.notifyPeerCount();
      this.scheduleReconnect(peerId);
    };

    channel.onerror = () => {
      this.notifyPeerCount();
    };
  }

  private scheduleReconnect(peerId: string): void {
    if (this.disposed) return;
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(timer);
      const peer = this.peers.get(peerId);
      if (!peer) return;
      peer.channel?.close();
      peer.pc.close();
      this.peers.delete(peerId);
      this.announce();
    }, RECONNECT_DELAY_MS);
    this.reconnectTimers.add(timer);
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    if (this.disposed || !message || !message.from || message.from === this.selfId) return;

    const from = message.from;

    if (message.kind === 'hello') {
      // Only the lexicographically smaller id dials, so both sides never offer
      // at the same time.
      if (this.selfId < from && !this.peers.has(from)) {
        await this.createOffer(from);
      }
      return;
    }

    if (message.to !== this.selfId) return;

    try {
      if (message.kind === 'offer') {
        const existing = this.peers.get(from);
        if (existing?.channel?.readyState === 'open') return;
        existing?.pc.close();
        this.peers.delete(from);

        const peer = this.getOrCreatePeer(from, false);
        await peer.pc.setRemoteDescription(message.sdp);
        peer.remoteDescriptionSet = true;
        await this.flushCandidates(peer);

        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.post({ kind: 'answer', from: this.selfId, to: from, sdp: answer });
        return;
      }

      if (message.kind === 'answer') {
        const peer = this.peers.get(from);
        if (!peer) return;
        await peer.pc.setRemoteDescription(message.sdp);
        peer.remoteDescriptionSet = true;
        await this.flushCandidates(peer);
        return;
      }

      if (message.kind === 'candidate') {
        const peer = this.peers.get(from) ?? this.getOrCreatePeer(from, false);
        if (peer.remoteDescriptionSet) {
          await peer.pc.addIceCandidate(message.candidate);
        } else {
          peer.pendingCandidates.push(message.candidate);
        }
      }
    } catch {
      const peer = this.peers.get(from);
      if (peer) {
        peer.pc.close();
        this.peers.delete(from);
      }
      this.notifyPeerCount();
    }
  }

  private async flushCandidates(peer: PeerState): Promise<void> {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await peer.pc.addIceCandidate(candidate);
    }
  }

  private async createOffer(peerId: string): Promise<void> {
    try {
      const peer = this.getOrCreatePeer(peerId, true);
      const channel = peer.pc.createDataChannel('nova_room', { ordered: true });
      this.attachChannel(peerId, channel);

      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.post({ kind: 'offer', from: this.selfId, to: peerId, sdp: offer });
    } catch {
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.pc.close();
        this.peers.delete(peerId);
      }
      this.notifyPeerCount();
    }
  }
}
