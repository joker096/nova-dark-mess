import { P2PSignalingClient, SignalingMessage } from './signaling';

export type P2PConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface P2PConnectionState {
  peerFingerprint: string;
  status: P2PConnectionStatus;
  isDirectP2P: boolean;
}

export interface WebRtcOptions {
  iceServers?: RTCIceServer[];
  connectTimeoutMs?: number;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class P2PMessengerChannel {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private readonly signaling: P2PSignalingClient;
  private unsubscribeSignaling: (() => void) | null = null;
  private onMessageCallback: ((data: string) => void) | null = null;
  private onStateChangeCallback: ((state: P2PConnectionState) => void) | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private role: 'initiator' | 'responder' | null = null;
  private readonly iceServers: RTCIceServer[];
  private readonly connectTimeoutMs: number;

  public readonly peerFingerprint: string;
  public readonly localFingerprint: string;
  public currentState: P2PConnectionState;

  constructor(
    localFingerprint: string,
    peerFingerprint: string,
    signaling: P2PSignalingClient,
    options: WebRtcOptions = {}
  ) {
    this.localFingerprint = localFingerprint;
    this.peerFingerprint = peerFingerprint;
    this.signaling = signaling;
    this.iceServers = options.iceServers ?? DEFAULT_ICE_SERVERS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 30000;
    this.currentState = {
      peerFingerprint,
      status: 'disconnected',
      isDirectP2P: false,
    };
    this.unsubscribeSignaling = this.signaling.onMessage((msg) => {
      void this.handleSignalingMessage(msg);
    });
  }

  public onMessage(cb: (data: string) => void): void {
    this.onMessageCallback = cb;
  }

  public onStateChange(cb: (state: P2PConnectionState) => void): void {
    this.onStateChangeCallback = cb;
    cb(this.currentState);
  }

  private updateState(status: P2PConnectionStatus, isDirectP2P: boolean): void {
    if (
      this.currentState.status === status &&
      this.currentState.isDirectP2P === isDirectP2P
    ) {
      return;
    }
    this.currentState = { peerFingerprint: this.peerFingerprint, status, isDirectP2P };
    this.onStateChangeCallback?.(this.currentState);
  }

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void this.signaling.sendSignal({
        type: 'candidate',
        senderFingerprint: this.localFingerprint,
        targetFingerprint: this.peerFingerprint,
        payload: event.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          this.updateState('connected', true);
          break;
        case 'failed':
          this.updateState('failed', false);
          break;
        case 'disconnected':
          this.updateState('disconnected', false);
          break;
        case 'connecting':
          this.updateState('connecting', false);
          break;
        default:
          break;
      }
    };

    pc.ondatachannel = (event) => {
      this.attachDataChannel(event.channel);
    };

    return pc;
  }

  private attachDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onopen = () => {
      this.updateState('connected', true);
    };
    channel.onclose = () => {
      this.updateState('disconnected', false);
    };
    channel.onerror = () => {
      this.updateState('failed', false);
    };
    channel.onmessage = (event) => {
      this.onMessageCallback?.(String(event.data));
    };
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pc || !this.remoteDescriptionSet) return;
    const candidates = this.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {
        this.updateState('failed', false);
      }
    }
  }

  private async handleSignalingMessage(msg: SignalingMessage): Promise<void> {
    if (
      msg.senderFingerprint !== this.peerFingerprint ||
      msg.targetFingerprint !== this.localFingerprint
    ) {
      return;
    }

    try {
      if (msg.type === 'offer' && this.role === 'responder') {
        const pc = this.ensurePeerConnection();
        await pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
        this.remoteDescriptionSet = true;
        await this.flushPendingCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.signaling.sendSignal({
          type: 'answer',
          senderFingerprint: this.localFingerprint,
          targetFingerprint: this.peerFingerprint,
          payload: answer,
        });
      } else if (msg.type === 'answer' && this.role === 'initiator') {
        const pc = this.ensurePeerConnection();
        await pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
        this.remoteDescriptionSet = true;
        await this.flushPendingCandidates();
      } else if (msg.type === 'candidate') {
        const candidate = msg.payload as RTCIceCandidateInit;
        if (this.pc && this.remoteDescriptionSet) {
          await this.pc.addIceCandidate(candidate);
        } else {
          this.pendingCandidates.push(candidate);
        }
      }
    } catch {
      this.updateState('failed', false);
    }
  }

  public async connectAsInitiator(): Promise<void> {
    this.role = 'initiator';
    this.updateState('connecting', false);

    const connected = await this.signaling.connect();
    if (!connected) {
      this.updateState('failed', false);
      return;
    }

    const pc = this.ensurePeerConnection();
    if (!this.dataChannel) {
      this.attachDataChannel(pc.createDataChannel('nova_p2p_channel', { ordered: true }));
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.signaling.sendSignal({
      type: 'offer',
      senderFingerprint: this.localFingerprint,
      targetFingerprint: this.peerFingerprint,
      payload: offer,
    });
  }

  public async connectAsResponder(): Promise<void> {
    this.role = 'responder';
    this.updateState('connecting', false);
    this.ensurePeerConnection();

    const connected = await this.signaling.connect();
    if (!connected) {
      this.updateState('failed', false);
      return;
    }

    setTimeout(() => {
      if (this.currentState.status === 'connecting' && !this.remoteDescriptionSet) {
        this.updateState('failed', false);
      }
    }, this.connectTimeoutMs);
  }

  public sendData(data: string): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(data);
      return true;
    }
    return false;
  }

  public close(): void {
    this.unsubscribeSignaling?.();
    this.unsubscribeSignaling = null;
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.updateState('disconnected', false);
  }
}
