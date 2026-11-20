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
  /**
   * IP-privacy mode. 'direct' (default) allows host/srflx candidates, which
   * exposes your IP to the peer and STUN; 'relay-only' sets
   * `iceTransportPolicy: 'relay'`, so media flows only through TURN and the
   * peer learns only the TURN server's address.
   */
  icePolicy?: 'direct' | 'relay-only';
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** TURN servers usable in relay-only mode; empty unless self-hosted. */
export const TURN_SERVERS: RTCIceServer[] = [];

/**
 * Replaces the TURN server list at runtime (e.g. from app settings after a
 * user configures a self-hosted TURN relay). Safe to call before or after
 * creating P2PMessengerChannel instances; new instances pick up the updated
 * list immediately.
 */
export function setTurnServers(servers: RTCIceServer[]): void {
  TURN_SERVERS.length = 0;
  TURN_SERVERS.push(...servers);
}

/** Call quality metrics sampled from RTCPeerConnection.getStats(). */
export interface CallQualityStats {
  /** Estimated send bitrate in bits per second. */
  sendBitrateBps: number;
  /** Estimated receive bitrate in bits per second. */
  receiveBitrateBps: number;
  /** Outgoing packet loss ratio (0–1). */
  sendPacketLoss: number;
  /** Incoming packet loss ratio (0–1). */
  receivePacketLoss: number;
  /** Current round-trip time in milliseconds. */
  rttMs: number;
  /** Timestamp of the last sample. */
  sampledAt: number;
}

/** Options for quality stats polling. */
export interface CallQualityOptions {
  /** Poll interval in milliseconds. Defaults to 1000. */
  pollIntervalMs?: number;
  /** Callback invoked with each new stats sample. */
  onStats: (stats: CallQualityStats) => void;
}

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
  private localMediaStream: MediaStream | null = null;
  private remoteMediaStream: MediaStream | null = null;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private readonly iceServers: RTCIceServer[];
  private readonly icePolicy: 'direct' | 'relay-only';
  private readonly connectTimeoutMs: number;
  private qualityInterval: ReturnType<typeof setInterval> | null = null;
  private lastSendBytes = 0;
  private lastReceiveBytes = 0;
  private lastStatsTime = 0;
  private onQualityStats: ((stats: CallQualityStats) => void) | null = null;

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
    this.icePolicy = options.icePolicy ?? 'direct';
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

  /**
   * Attach a local audio/video stream to the peer connection. Safe to call
   * before or after {@link connectAsInitiator}/{@link connectAsResponder}:
   * tracks are added as soon as the underlying RTCPeerConnection exists.
   */
  public attachLocalStream(stream: MediaStream | null): void {
    this.localMediaStream = stream;
    if (!stream) return;

    const pc = this.ensurePeerConnection();
    const senders = pc.getSenders();
    const attachedTracks = new Set(
      senders.map((sender) => sender.track).filter((track): track is MediaStreamTrack => !!track)
    );

    for (const track of stream.getTracks()) {
      if (!attachedTracks.has(track)) {
        pc.addTrack(track, stream);
      }
    }
  }

  public onRemoteStream(cb: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = cb;
    if (this.remoteMediaStream) {
      cb(this.remoteMediaStream);
    }
  }

  public getLocalStream(): MediaStream | null {
    return this.localMediaStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteMediaStream;
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

    // In relay-only mode the peer connection refuses host/srflx candidates:
    // media can only flow through a TURN relay, so the peer never learns the
    // local IP addresses and the STUN servers are never contacted.
    const relayOnly = this.icePolicy === 'relay-only' && this.iceServers.length > 0;
    const pc = new RTCPeerConnection({
      iceServers: relayOnly ? this.iceServers : this.iceServers,
      ...(relayOnly ? { iceTransportPolicy: 'relay' as const } : {}),
    });
    this.pc = pc;

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        this.remoteMediaStream = stream;
      } else {
        if (!this.remoteMediaStream) {
          this.remoteMediaStream = new MediaStream();
        }
        if (!this.remoteMediaStream.getTracks().includes(event.track)) {
          this.remoteMediaStream.addTrack(event.track);
        }
      }
      this.onRemoteStreamCallback?.(this.remoteMediaStream);
    };

    if (this.localMediaStream) {
      for (const track of this.localMediaStream.getTracks()) {
        pc.addTrack(track, this.localMediaStream);
      }
    }

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
    this.localMediaStream = null;
    this.remoteMediaStream = null;
    this.onRemoteStreamCallback = null;
    this.updateState('disconnected', false);
  }

  /** Start polling RTCPeerConnection.getStats() for call quality metrics. */
  public startQualityMonitoring(options: CallQualityOptions): void {
    this.stopQualityMonitoring();
    this.onQualityStats = options.onStats;
    const intervalMs = options.pollIntervalMs ?? 1000;
    this.qualityInterval = setInterval(() => {
      void this.sampleCallQuality(intervalMs);
    }, intervalMs);
    // Take an immediate sample.
    void this.sampleCallQuality(intervalMs);
  }

  /** Stop quality stats polling. */
  public stopQualityMonitoring(): void {
    if (this.qualityInterval) {
      clearInterval(this.qualityInterval);
      this.qualityInterval = null;
    }
    this.onQualityStats = null;
    this.lastSendBytes = 0;
    this.lastReceiveBytes = 0;
    this.lastStatsTime = 0;
  }

  private async sampleCallQuality(_pollIntervalMs: number): Promise<void> {
    const pc = this.pc;
    if (!pc || !this.onQualityStats) return;

    try {
      const stats = await pc.getStats();
      const now = Date.now();

      let sendBytes = 0;
      let receiveBytes = 0;
      let sendPacketsLost = 0;
      let sendPacketsSent = 0;
      let receivePacketsLost = 0;
      let receivePacketsReceived = 0;
      let rttMs = 0;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (typeof report.bytesSent === 'number') sendBytes += report.bytesSent;
          if (typeof report.bytesReceived === 'number')
            receiveBytes += report.bytesReceived;
          if (typeof report.packetsSent === 'number') sendPacketsSent += report.packetsSent;
          if (typeof report.packetsLost === 'number') sendPacketsLost += report.packetsLost;
          if (typeof report.packetsReceived === 'number')
            receivePacketsReceived += report.packetsReceived;
          if (typeof report.packetsLost === 'number') receivePacketsLost += report.packetsLost;
          if (typeof report.currentRoundTripTime === 'number')
            rttMs = report.currentRoundTripTime * 1000;
        }
      });

      // Convert cumulative byte counters to bitrates over the sampling interval.
      const intervalSecs = Math.max(now - this.lastStatsTime, 1) / 1000;
      const sendBitrateBps = ((sendBytes - this.lastSendBytes) * 8) / intervalSecs;
      const receiveBitrateBps = ((receiveBytes - this.lastReceiveBytes) * 8) / intervalSecs;

      const sendPacketLoss =
        sendPacketsSent > 0 ? sendPacketsLost / sendPacketsSent : 0;
      const receivePacketLoss =
        receivePacketsReceived > 0 ? receivePacketsLost / receivePacketsReceived : 0;

      this.lastSendBytes = sendBytes;
      this.lastReceiveBytes = receiveBytes;
      this.lastStatsTime = now;

      this.onQualityStats({
        sendBitrateBps: Math.max(0, sendBitrateBps),
        receiveBitrateBps: Math.max(0, receiveBitrateBps),
        sendPacketLoss,
        receivePacketLoss,
        rttMs,
        sampledAt: now,
      });
    } catch {
      // Stats sampling failed silently; next interval will retry.
    }
  }
}
