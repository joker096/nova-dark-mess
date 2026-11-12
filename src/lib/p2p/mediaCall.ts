import { P2PConnectionState, P2PMessengerChannel } from './webrtc';
import { P2PSignalingClient } from './signaling';

export type MediaCallMode = 'voice' | 'video';

export type MediaCallStatus =
  | 'idle'
  | 'requesting-media'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'ended';

export interface MediaCallOptions {
  localFingerprint: string;
  peerFingerprint: string;
  mode: MediaCallMode;
  signalingUrl?: string;
  iceServers?: RTCIceServer[];
}

type StatusListener = (status: MediaCallStatus) => void;
type StreamListener = (stream: MediaStream) => void;
type ErrorListener = (error: Error) => void;

/**
 * Encrypted-compatible WebRTC audio/video call session. Reuses the same
 * signaling transport as the P2P data channel; media travels directly between
 * peers (DTLS-SRTP) and is never stored by any relay.
 */
export class P2PMediaCall {
  private readonly options: MediaCallOptions;
  private signaling: P2PSignalingClient | null = null;
  private channel: P2PMessengerChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private status: MediaCallStatus = 'idle';
  private readonly statusListeners = new Set<StatusListener>();
  private readonly localStreamListeners = new Set<StreamListener>();
  private readonly remoteStreamListeners = new Set<StreamListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(options: MediaCallOptions) {
    this.options = options;
  }

  public getStatus(): MediaCallStatus {
    return this.status;
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public onLocalStream(listener: StreamListener): () => void {
    this.localStreamListeners.add(listener);
    if (this.localStream) listener(this.localStream);
    return () => this.localStreamListeners.delete(listener);
  }

  public onRemoteStream(listener: StreamListener): () => void {
    this.remoteStreamListeners.add(listener);
    if (this.remoteStream) listener(this.remoteStream);
    return () => this.remoteStreamListeners.delete(listener);
  }

  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private setStatus(status: MediaCallStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  private emitLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    this.localStreamListeners.forEach((listener) => listener(stream));
  }

  private emitRemoteStream(stream: MediaStream): void {
    this.remoteStream = stream;
    this.remoteStreamListeners.forEach((listener) => listener(stream));
  }

  private emitError(error: Error): void {
    this.errorListeners.forEach((listener) => listener(error));
  }

  private buildConstraints(): MediaStreamConstraints {
    return {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        this.options.mode === 'video'
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
    };
  }

  public async start(): Promise<void> {
    if (this.status !== 'idle') return;

    this.setStatus('requesting-media');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const error = new Error('Media devices are not available on this platform');
      this.setStatus('failed');
      this.emitError(error);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(this.buildConstraints());
      this.emitLocalStream(stream);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setStatus('failed');
      this.emitError(error);
      return;
    }

    this.signaling = new P2PSignalingClient({ url: this.options.signalingUrl });
    this.channel = new P2PMessengerChannel(
      this.options.localFingerprint,
      this.options.peerFingerprint,
      this.signaling,
      { iceServers: this.options.iceServers }
    );

    this.channel.attachLocalStream(this.localStream);
    this.channel.onRemoteStream((stream) => this.emitRemoteStream(stream));
    this.channel.onStateChange((state) => this.handleChannelState(state));

    this.setStatus('connecting');

    try {
      if (this.options.localFingerprint < this.options.peerFingerprint) {
        await this.channel.connectAsInitiator();
      } else {
        await this.channel.connectAsResponder();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setStatus('failed');
      this.emitError(error);
    }
  }

  private handleChannelState(state: P2PConnectionState): void {
    if (this.status === 'ended') return;

    if (state.status === 'connected') {
      this.setStatus('connected');
    } else if (state.status === 'failed') {
      this.setStatus('failed');
    } else if (state.status === 'connecting' && this.status === 'idle') {
      this.setStatus('connecting');
    }
  }

  public setMicrophoneEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getAudioTracks();
    tracks.forEach((track) => {
      track.enabled = enabled;
    });
    return tracks.length > 0;
  }

  public setCameraEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getVideoTracks();
    tracks.forEach((track) => {
      track.enabled = enabled;
    });
    return tracks.length > 0;
  }

  public async flipCamera(facing: 'front' | 'back'): Promise<boolean> {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({
        facingMode: facing === 'front' ? 'user' : 'environment',
      });
      return true;
    } catch {
      return false;
    }
  }

  public end(): void {
    if (this.status === 'ended') return;

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.remoteStream = null;

    this.channel?.close();
    this.channel = null;
    this.signaling?.close();
    this.signaling = null;

    this.setStatus('ended');
  }
}
