import { P2PSignalingClient, SignalingMessage } from './signaling';
import { setTurnServers, TURN_SERVERS, P2PMessengerChannel } from './webrtc';

export type MediaCallMode = 'voice' | 'video';

export type GroupCallStatus =
  | 'idle'
  | 'requesting-media'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'ended';

export interface GroupCallParticipant {
  fingerprint: string;
  name: string;
  avatar?: string;
  isLocal: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  stream?: MediaStream;
  screenStream?: MediaStream;
  connectionStatus: 'connecting' | 'connected' | 'failed' | 'disconnected';
}

export interface GroupCallOptions {
  localFingerprint: string;
  localName: string;
  localAvatar?: string;
  mode: MediaCallMode;
  signalingUrl?: string;
  signaling?: P2PSignalingClient;
  iceServers?: RTCIceServer[];
  icePolicy?: 'direct' | 'relay-only';
  /** Called when a participant joins/updates/leaves */
  onParticipantsChange?: (participants: Map<string, GroupCallParticipant>) => void;
  /** Called when call status changes */
  onStatusChange?: (status: GroupCallStatus) => void;
  /** Called when local stream is ready */
  onLocalStream?: (stream: MediaStream) => void;
  /** Called when screen share stream is ready */
  onLocalScreenStream?: (stream: MediaStream) => void;
  /** Called when error occurs */
  onError?: (error: Error) => void;
}

type ParticipantMap = Map<string, GroupCallParticipant>;
type PeerConnectionMap = Map<string, RTCPeerConnection>;
type SignalingMap = Map<string, P2PMessengerChannel>;

/**
 * Mesh-based group video call. Each participant connects to every other participant.
 * Suitable for small groups (up to ~8-10 participants).
 * For larger groups, an SFU (Selective Forwarding Unit) would be needed.
 */
export class GroupCallManager {
  private readonly options: GroupCallOptions;
  private signaling: P2PSignalingClient | null = null;
  private ownsSignaling = false;
  private participants: ParticipantMap = new Map();
  private peerConnections: PeerConnectionMap = new Map();
  private channels: SignalingMap = new Map();
  private localStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private status: GroupCallStatus = 'idle';
  private isScreenSharing = false;
  private pendingInvites: Map<string, { offer: RTCSessionDescriptionInit; timestamp: number }> = new Map();
  private inviteTimeout = 30000;
  private readonly statusListeners = new Set<(status: GroupCallStatus) => void>();
  private readonly participantsListeners = new Set<
    (participants: Map<string, GroupCallParticipant>) => void
  >();
  private readonly localStreamListeners = new Set<(stream: MediaStream) => void>();
  private readonly localScreenStreamListeners = new Set<(stream: MediaStream) => void>();

  constructor(options: GroupCallOptions) {
    this.options = options;
    this.initializeLocalParticipant();
  }

  private initializeLocalParticipant(): void {
    this.participants.set(this.options.localFingerprint, {
      fingerprint: this.options.localFingerprint,
      name: this.options.localName,
      avatar: this.options.localAvatar,
      isLocal: true,
      isMuted: false,
      isCameraOff: this.options.mode === 'voice',
      isScreenSharing: false,
      connectionStatus: 'connected',
    });
  }

  private setStatus(status: GroupCallStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange?.(status);
    this.statusListeners.forEach((listener) => listener(status));
  }

  private emitParticipantsChange(): void {
    const snapshot = new Map(this.participants);
    this.options.onParticipantsChange?.(snapshot);
    this.participantsListeners.forEach((listener) => listener(new Map(this.participants)));
  }

  private getOrCreateParticipant(fingerprint: string, name: string, avatar?: string): GroupCallParticipant {
    let participant = this.participants.get(fingerprint);
    if (!participant) {
      participant = {
        fingerprint,
        name,
        avatar,
        isLocal: false,
        isMuted: false,
        isCameraOff: true,
        isScreenSharing: false,
        connectionStatus: 'connecting',
      };
      this.participants.set(fingerprint, participant);
    }
    return participant;
  }

  private updateParticipant(fingerprint: string, updates: Partial<GroupCallParticipant>): void {
    const participant = this.participants.get(fingerprint);
    if (participant) {
      Object.assign(participant, updates);
      this.emitParticipantsChange();
    }
  }

  private removeParticipant(fingerprint: string): void {
    this.participants.delete(fingerprint);
    this.closePeerConnection(fingerprint);
    this.emitParticipantsChange();
  }

  private ensureSignaling(): P2PSignalingClient {
    if (!this.signaling) {
      this.signaling = this.options.signaling ?? new P2PSignalingClient({ url: this.options.signalingUrl });
      this.ownsSignaling = !this.options.signaling;
      this.setupSignalingListener();
    }
    return this.signaling;
  }

  private setupSignalingListener(): void {
    if (!this.signaling) return;
    this.signaling.onMessage((msg) => this.handleSignalingMessage(msg));
  }

  private getOrCreateChannel(peerFingerprint: string): P2PMessengerChannel {
    let channel = this.channels.get(peerFingerprint);
    if (!channel) {
      const signaling = this.ensureSignaling();
      channel = new P2PMessengerChannel(
        this.options.localFingerprint,
        peerFingerprint,
        signaling,
        { iceServers: this.options.iceServers, icePolicy: this.options.icePolicy }
      );
      channel.onStateChange((state) => this.handleChannelState(peerFingerprint, state));
      channel.onRemoteStream((stream) => this.handleRemoteStream(peerFingerprint, stream));
      this.channels.set(peerFingerprint, channel);
    }
    return channel;
  }

  private getOrCreatePeerConnection(peerFingerprint: string): RTCPeerConnection {
    const channel = this.getOrCreateChannel(peerFingerprint);
    // Access the internal peer connection - we'll need to add a getter or use the channel's methods
    // For now, the channel manages the peer connection internally
    return null as any; // Channel handles PC internally
  }

  private handleChannelState(peerFingerprint: string, state: { status: string; isDirectP2P: boolean }): void {
    const participant = this.participants.get(peerFingerprint);
    if (!participant) return;

    const newStatus = state.status === 'connected' ? 'connected' :
                      state.status === 'failed' ? 'failed' : 'connecting';
    this.updateParticipant(peerFingerprint, { connectionStatus: newStatus });

    if (state.status === 'connected' && this.localStream) {
      // Attach local stream to this peer connection
      const channel = this.channels.get(peerFingerprint);
      if (channel) {
        channel.attachLocalStream(this.localStream);
      }
    }
  }

  private handleRemoteStream(peerFingerprint: string, stream: MediaStream): void {
    const participant = this.participants.get(peerFingerprint);
    if (!participant) return;

    // Check if this is a screen share stream (has video track with specific label)
    const videoTracks = stream.getVideoTracks();
    const isScreenShare = videoTracks.some(t => t.label.toLowerCase().includes('screen') || t.label.toLowerCase().includes('display'));

    if (isScreenShare) {
      participant.screenStream = stream;
      participant.isScreenSharing = true;
    } else {
      participant.stream = stream;
      participant.isCameraOff = false;
    }
    this.emitParticipantsChange();
  }

  private async handleSignalingMessage(msg: SignalingMessage): Promise<void> {
    if (msg.targetFingerprint !== this.options.localFingerprint) return;

    const peerFingerprint = msg.senderFingerprint;
    const channel = this.getOrCreateChannel(peerFingerprint);

    try {
      if (msg.type === 'group-call-invite') {
        // Someone is inviting us to a group call
        const payload = msg.payload as {
          callId: string;
          mode: MediaCallMode;
          participants: Array<{ fingerprint: string; name: string; avatar?: string }>;
        };

        if (this.status === 'idle') {
          this.setStatus('connecting');
          // Add all participants
          for (const p of payload.participants) {
            if (p.fingerprint !== this.options.localFingerprint) {
              this.getOrCreateParticipant(p.fingerprint, p.name, p.avatar);
            }
          }
          this.emitParticipantsChange();
        }

        // Accept the invite by sending our offer to the inviter
        await this.sendOfferToPeer(peerFingerprint);
      } else if (msg.type === 'group-call-offer') {
        // Peer sent us an offer
        await this.handleOffer(peerFingerprint, msg.payload as RTCSessionDescriptionInit);
      } else if (msg.type === 'group-call-answer') {
        // Peer answered our offer
        await this.handleAnswer(peerFingerprint, msg.payload as RTCSessionDescriptionInit);
      } else if (msg.type === 'group-call-candidate') {
        // ICE candidate
        await this.handleCandidate(peerFingerprint, msg.payload as RTCIceCandidateInit);
      } else if (msg.type === 'group-call-leave') {
        // Peer left the call
        this.removeParticipant(peerFingerprint);
      } else if (msg.type === 'group-call-end') {
        // Call ended by host
        this.end();
      }
    } catch (error) {
      console.error('[GroupCall] Signaling error:', error);
      this.updateParticipant(peerFingerprint, { connectionStatus: 'failed' });
    }
  }

  private async handleOffer(peerFingerprint: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const channel = this.getOrCreateChannel(peerFingerprint);
    const pc = (channel as any).pc; // Access internal PC - we need to expose this
    if (!pc) return;

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await this.sendSignaling(peerFingerprint, 'group-call-answer', answer);
  }

  private async handleAnswer(peerFingerprint: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const channel = this.channels.get(peerFingerprint);
    const pc = channel ? (channel as any).pc : null;
    if (!pc) return;

    await pc.setRemoteDescription(answer);
  }

  private async handleCandidate(peerFingerprint: string, candidate: RTCIceCandidateInit): Promise<void> {
    const channel = this.channels.get(peerFingerprint);
    const pc = channel ? (channel as any).pc : null;
    if (!pc) return;

    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // Ignore candidate errors
    }
  }

  private async sendOfferToPeer(peerFingerprint: string): Promise<void> {
    const channel = this.getOrCreateChannel(peerFingerprint);
    const pc = (channel as any).pc;
    if (!pc) return;

    // Attach local stream if we have one
    if (this.localStream) {
      channel.attachLocalStream(this.localStream);
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this.sendSignaling(peerFingerprint, 'group-call-offer', offer);
  }

  private async sendSignaling(targetFingerprint: string, type: string, payload: any): Promise<void> {
    const signaling = this.ensureSignaling();
    await signaling.sendSignal({
      type: type as any,
      senderFingerprint: this.options.localFingerprint,
      targetFingerprint,
      payload,
    });
  }

  private closePeerConnection(peerFingerprint: string): void {
    const channel = this.channels.get(peerFingerprint);
    if (channel) {
      channel.close();
      this.channels.delete(peerFingerprint);
    }
  }

  /** Start the group call as host - invite participants */
  public async start(participantFingerprints: string[]): Promise<void> {
    if (this.status !== 'idle') return;

    this.setStatus('requesting-media');

    // Get local media
    try {
      const stream = await navigator.mediaDevices.getUserMedia(this.buildConstraints());
      this.localStream = stream;
      this.options.onLocalStream?.(stream);
      this.localStreamListeners.forEach((listener) => listener(stream));

      // Update local participant
      this.updateParticipant(this.options.localFingerprint, {
        stream,
        isCameraOff: this.options.mode === 'voice',
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setStatus('failed');
      this.options.onError?.(error);
      return;
    }

    this.setStatus('connecting');

    // Initialize signaling
    this.ensureSignaling();
    await this.signaling?.connect();

    // Send invites to all participants
    const participantInfos = participantFingerprints
      .filter(f => f !== this.options.localFingerprint)
      .map(f => {
        const p = this.participants.get(f);
        return { fingerprint: f, name: p?.name || f, avatar: p?.avatar };
      });

    for (const fingerprint of participantFingerprints.filter(f => f !== this.options.localFingerprint)) {
      await this.sendSignaling(fingerprint, 'group-call-invite', {
        callId: `call_${Date.now()}`,
        mode: this.options.mode,
        participants: [
          { fingerprint: this.options.localFingerprint, name: this.options.localName, avatar: this.options.localAvatar },
          ...participantInfos,
        ],
      });
    }

    this.emitParticipantsChange();
  }

  /** Join an existing group call (called when receiving invite) */
  public async join(): Promise<void> {
    if (this.status !== 'idle') return;

    this.setStatus('requesting-media');

    try {
      const stream = await navigator.mediaDevices.getUserMedia(this.buildConstraints());
      this.localStream = stream;
      this.options.onLocalStream?.(stream);
      this.localStreamListeners.forEach((listener) => listener(stream));

      this.updateParticipant(this.options.localFingerprint, {
        stream,
        isCameraOff: this.options.mode === 'voice',
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setStatus('failed');
      this.options.onError?.(error);
      return;
    }

    this.setStatus('connecting');
    this.ensureSignaling();
    await this.signaling?.connect();
  }

  /** Start screen sharing */
  public async startScreenShare(): Promise<void> {
    if (this.isScreenSharing) return;

    try {
      // `cursor` is a browser-only hint that the TS DOM lib does not model yet.
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: true,
      });

      this.localScreenStream = screenStream;
      this.isScreenSharing = true;
      this.options.onLocalScreenStream?.(screenStream);
      this.localScreenStreamListeners.forEach((listener) => listener(screenStream));

      // Update local participant
      this.updateParticipant(this.options.localFingerprint, {
        screenStream,
        isScreenSharing: true,
      });

      // Replace video track in all peer connections
      const videoTrack = screenStream.getVideoTracks()[0];
      for (const [fingerprint, channel] of this.channels) {
        const pc = (channel as any).pc;
        if (!pc) continue;

        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender && videoTrack) {
          await sender.replaceTrack(videoTrack);
        }
      }

      // Handle screen share end
      videoTrack?.addEventListener('ended', () => {
        this.stopScreenShare();
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
    }
  }

  /** Stop screen sharing and restore camera */
  public async stopScreenShare(): Promise<void> {
    if (!this.isScreenSharing) return;

    this.localScreenStream?.getTracks().forEach(t => t.stop());
    this.localScreenStream = null;
    this.isScreenSharing = false;

    // Restore camera track
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      for (const [fingerprint, channel] of this.channels) {
        const pc = (channel as any).pc;
        if (!pc) continue;

        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender && videoTrack) {
          await sender.replaceTrack(videoTrack);
        }
      }
    }

    this.updateParticipant(this.options.localFingerprint, {
      screenStream: undefined,
      isScreenSharing: false,
    });
  }

  /** Toggle microphone */
  public setMicrophoneEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getAudioTracks();
    tracks.forEach(track => { track.enabled = enabled; });
    this.updateParticipant(this.options.localFingerprint, { isMuted: !enabled });
    return tracks.length > 0;
  }

  /** Toggle camera */
  public setCameraEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getVideoTracks();
    tracks.forEach(track => { track.enabled = enabled; });
    this.updateParticipant(this.options.localFingerprint, { isCameraOff: !enabled });
    return tracks.length > 0;
  }

  /** Flip camera (front/back) */
  public async flipCamera(facing: 'front' | 'back'): Promise<boolean> {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({ facingMode: facing === 'front' ? 'user' : 'environment' });
      return true;
    } catch {
      return false;
    }
  }

  /** End the group call */
  public end(): void {
    if (this.status === 'ended') return;

    // Notify all peers
    for (const fingerprint of this.participants.keys()) {
      if (fingerprint !== this.options.localFingerprint) {
        this.sendSignaling(fingerprint, 'group-call-leave', {});
      }
    }

    // Clean up
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localScreenStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.localScreenStream = null;
    this.isScreenSharing = false;

    for (const [fingerprint, channel] of this.channels) {
      channel.close();
    }
    this.channels.clear();
    this.peerConnections.clear();

    if (this.ownsSignaling) {
      this.signaling?.close();
      this.signaling = null;
    }

    this.participants.clear();
    this.initializeLocalParticipant();
    this.setStatus('ended');
    this.emitParticipantsChange();
  }

  private buildConstraints(): MediaStreamConstraints {
    return {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: this.options.mode === 'video'
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          }
        : false,
    };
  }

  public getStatus(): GroupCallStatus {
    return this.status;
  }

  public getParticipants(): ParticipantMap {
    return new Map(this.participants);
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream;
  }

  /**
   * Subscribes a UI to call updates. Each method returns an unsubscribe
   * function; listeners registered here are additive to the constructor
   * callbacks in `GroupCallOptions`.
   */
  public onStatusChange(listener: (status: GroupCallStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public onParticipantsChange(
    listener: (participants: Map<string, GroupCallParticipant>) => void,
  ): () => void {
    this.participantsListeners.add(listener);
    return () => this.participantsListeners.delete(listener);
  }

  public onLocalStream(listener: (stream: MediaStream) => void): () => void {
    this.localStreamListeners.add(listener);
    return () => this.localStreamListeners.delete(listener);
  }

  public onLocalScreenStream(listener: (stream: MediaStream) => void): () => void {
    this.localScreenStreamListeners.add(listener);
    return () => this.localScreenStreamListeners.delete(listener);
  }

  public isScreenSharingActive(): boolean {
    return this.isScreenSharing;
  }
}