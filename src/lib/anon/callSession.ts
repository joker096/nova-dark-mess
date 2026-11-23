import { P2PMediaCall, type MediaCallMode, type MediaCallStatus } from '../p2p/mediaCall';
import type { P2PSignalingClient } from '../p2p/signaling';
import {
  ANON_CALL_VERSION,
  AnonCallSignaling,
  anonCallIds,
  encodeAnonCallMessage,
  type AnonCallMessage,
  type AnonCallMode,
  type AnonCallSignalType,
} from './callProtocol';

export type AnonCallPhase = 'idle' | 'incoming' | 'outgoing' | 'active' | 'ended';

export interface AnonCallSnapshot {
  phase: AnonCallPhase;
  callId?: string;
  mode?: AnonCallMode;
  status?: MediaCallStatus;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  contactName: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  notice?: string;
}

export interface AnonCallSessionOptions {
  contactId: string;
  contactName: string;
  send: (body: string) => Promise<boolean>;
  iceServers?: RTCIceServer[];
  onState: (state: AnonCallSnapshot) => void;
  onNotice?: (message: string) => void;
}

const OUTGOING_TIMEOUT_MS = 45_000;
const INCOMING_TIMEOUT_MS = 60_000;

function newCallId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `call_${Date.now().toString(36)}_${random}`;
}

/**
 * One anonymous 1:1 call. Control messages travel through the contact's
 * encrypted queue; once accepted, WebRTC signaling uses the same queue through
 * {@link AnonCallSignaling}. No identity fingerprint is exposed to the relay.
 */
export class AnonCallSession {
  private snapshot: AnonCallSnapshot;
  private call: P2PMediaCall | null = null;
  private signaling: AnonCallSignaling | null = null;
  private mediaReady = false;
  private pendingSignals: AnonCallMessage[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: AnonCallSessionOptions) {
    this.snapshot = {
      phase: 'idle',
      contactName: options.contactName,
      micEnabled: true,
      cameraEnabled: true,
    };
  }

  public getState(): AnonCallSnapshot {
    return this.snapshot;
  }

  private emit(patch: Partial<AnonCallSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.options.onState(this.snapshot);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async send(message: AnonCallMessage): Promise<boolean> {
    try {
      return await this.options.send(encodeAnonCallMessage(message));
    } catch {
      return false;
    }
  }

  public async start(mode: MediaCallMode): Promise<void> {
    if (this.snapshot.phase !== 'idle' && this.snapshot.phase !== 'ended') return;
    const callId = newCallId();
    this.emit({
      phase: 'outgoing',
      callId,
      mode,
      status: 'connecting',
      notice: undefined,
      micEnabled: true,
      cameraEnabled: mode === 'video',
    });
    const sent = await this.send({
      __novaCall: ANON_CALL_VERSION,
      kind: 'invite',
      callId,
      mode,
    });
    if (!sent) {
      this.fail('Could not send the call invite.');
      return;
    }
    this.timer = setTimeout(() => {
      void this.send({
        __novaCall: ANON_CALL_VERSION,
        kind: 'end',
        callId,
      });
      this.fail('No answer.');
    }, OUTGOING_TIMEOUT_MS);
  }

  public async accept(): Promise<void> {
    if (this.snapshot.phase !== 'incoming' || !this.snapshot.callId || !this.snapshot.mode) return;
    const { callId, mode } = this.snapshot;
    this.clearTimer();
    this.emit({ phase: 'active', status: 'connecting' });
    const sent = await this.send({
      __novaCall: ANON_CALL_VERSION,
      kind: 'accept',
      callId,
    });
    if (!sent) {
      this.fail('Could not accept the call.');
      return;
    }
    await this.startMedia(callId, mode, 'callee');
  }

  public async decline(): Promise<void> {
    if (this.snapshot.phase !== 'incoming' || !this.snapshot.callId) return;
    await this.send({
      __novaCall: ANON_CALL_VERSION,
      kind: 'decline',
      callId: this.snapshot.callId,
    });
    this.reset('Call declined.');
  }

  public async end(): Promise<void> {
    if (this.snapshot.callId) {
      await this.send({
        __novaCall: ANON_CALL_VERSION,
        kind: 'end',
        callId: this.snapshot.callId,
      });
    }
    this.call?.end();
    this.call = null;
    this.signaling?.close();
    this.signaling = null;
    this.mediaReady = false;
    this.pendingSignals = [];
    this.clearTimer();
    this.emit({ phase: 'ended', status: 'ended', localStream: null, remoteStream: null });
    window.setTimeout(() => {
      if (this.snapshot.phase === 'ended') this.reset();
    }, 1200);
  }

  public handle(message: AnonCallMessage): void {
    if (message.kind === 'invite') {
      if (this.snapshot.phase === 'outgoing' || this.snapshot.phase === 'active') {
        void this.send({
          __novaCall: ANON_CALL_VERSION,
          kind: 'decline',
          callId: message.callId,
        });
        return;
      }
      if (this.snapshot.phase === 'incoming' && this.snapshot.callId !== message.callId) {
        return;
      }
      this.clearTimer();
      this.emit({
        phase: 'incoming',
        callId: message.callId,
        mode: message.mode,
        status: 'idle',
        micEnabled: true,
        cameraEnabled: message.mode === 'video',
      });
      this.timer = setTimeout(() => {
        void this.send({
          __novaCall: ANON_CALL_VERSION,
          kind: 'decline',
          callId: message.callId,
        });
        this.reset('Missed call.');
      }, INCOMING_TIMEOUT_MS);
      return;
    }

    if (!this.snapshot.callId || message.callId !== this.snapshot.callId) return;

    switch (message.kind) {
      case 'accept':
        if (this.snapshot.phase !== 'outgoing') return;
        this.clearTimer();
        this.emit({ phase: 'active', status: 'connecting' });
        void this.startMedia(message.callId, this.snapshot.mode ?? 'voice', 'caller');
        return;
      case 'decline':
        this.reset('Call declined.');
        return;
      case 'end':
        this.call?.end();
        this.call = null;
        this.signaling?.close();
        this.signaling = null;
    this.mediaReady = false;
    this.pendingSignals = [];
        this.reset('Call ended.');
        return;
      case 'signal': {
        if (!message.signalType) return;
        if (this.signaling && this.mediaReady) {
          this.signaling.receive(message);
        } else {
          this.pendingSignals.push(message);
        }
        return;
      }
    }
  }

  private async startMedia(
    callId: string,
    mode: AnonCallMode,
    role: 'caller' | 'callee',
  ): Promise<void> {
    const ids = anonCallIds(role);
    const signaling = new AnonCallSignaling({
      callId,
      ...ids,
      send: (message) => this.send(message),
    });
    this.signaling = signaling;
    this.mediaReady = false;
    this.pendingSignals = [];
    const call = new P2PMediaCall({
      localFingerprint: ids.localId,
      peerFingerprint: ids.peerId,
      mode,
      signaling: signaling as unknown as P2PSignalingClient,
      iceServers: this.options.iceServers,
      icePolicy: this.options.iceServers?.length ? 'relay-only' : 'direct',
    });
    this.call = call;

    call.onLocalStream((stream) => {
      this.emit({ localStream: stream });
    });
    call.onRemoteStream((stream) => {
      this.emit({ remoteStream: stream });
    });
    call.onStatus((status) => {
      this.emit({ status });
    });
    call.onError(() => {
      this.options.onNotice?.('Call failed.');
    });

    await call.start();
    this.mediaReady = true;
    const queued = this.pendingSignals.splice(0);
    for (const message of queued) signaling.receive(message);
  }

  public setMicrophoneEnabled(enabled: boolean): boolean {
    const ok = this.call?.setMicrophoneEnabled(enabled) ?? false;
    if (ok) this.emit({ micEnabled: enabled });
    return ok;
  }

  public setCameraEnabled(enabled: boolean): boolean {
    const ok = this.call?.setCameraEnabled(enabled) ?? false;
    if (ok) this.emit({ cameraEnabled: enabled });
    return ok;
  }

  public destroy(): void {
    this.clearTimer();
    this.call?.end();
    this.call = null;
    this.signaling?.close();
    this.signaling = null;
    this.mediaReady = false;
    this.pendingSignals = [];
    this.snapshot = { ...this.snapshot, phase: 'idle' };
  }

  private fail(notice: string): void {
    this.clearTimer();
    this.call?.end();
    this.call = null;
    this.signaling?.close();
    this.signaling = null;
    this.mediaReady = false;
    this.pendingSignals = [];
    this.emit({ phase: 'ended', status: 'failed', notice, localStream: null, remoteStream: null });
    this.options.onNotice?.(notice);
    window.setTimeout(() => {
      if (this.snapshot.phase === 'ended') this.reset();
    }, 1200);
  }

  private reset(notice?: string): void {
    this.clearTimer();
    this.call?.end();
    this.call = null;
    this.signaling?.close();
    this.signaling = null;
    this.mediaReady = false;
    this.pendingSignals = [];
    this.emit({
      phase: 'idle',
      callId: undefined,
      mode: undefined,
      status: undefined,
      localStream: null,
      remoteStream: null,
      notice,
      micEnabled: true,
      cameraEnabled: true,
    });
  }
}

export type { AnonCallSignalType };
