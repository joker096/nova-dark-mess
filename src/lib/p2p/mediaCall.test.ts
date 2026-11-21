import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P2PMediaCall } from './mediaCall';

interface MockChannel {
  localFingerprint: string;
  peerFingerprint: string;
  stateListener: ((state: { status: string }) => void) | null;
  attachLocalStream: ReturnType<typeof vi.fn>;
  onRemoteStream: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  connectAsInitiator: ReturnType<typeof vi.fn>;
  connectAsResponder: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockSignaling {
  close: ReturnType<typeof vi.fn>;
}

const { channelInstances, signalingInstances } = vi.hoisted(() => ({
  channelInstances: [] as MockChannel[],
  signalingInstances: [] as MockSignaling[],
}));

vi.mock('./signaling', () => ({
  P2PSignalingClient: class {
    connect = vi.fn(async () => true);
    sendSignal = vi.fn(async () => undefined);
    onMessage = vi.fn(() => () => undefined);
    close = vi.fn();

    constructor() {
      signalingInstances.push(this as unknown as MockSignaling);
    }
  },
}));

vi.mock('./webrtc', () => ({
  P2PMessengerChannel: class {
    localFingerprint: string;
    peerFingerprint: string;
    stateListener: ((state: { status: string }) => void) | null = null;
    attachLocalStream = vi.fn();
    onRemoteStream = vi.fn();
    onStateChange = vi.fn((listener: (state: { status: string }) => void) => {
      this.stateListener = listener;
    });
    connectAsInitiator = vi.fn(async () => undefined);
    connectAsResponder = vi.fn(async () => undefined);
    close = vi.fn();
    startQualityMonitoring = vi.fn();
    stopQualityMonitoring = vi.fn();

    constructor(localFingerprint: string, peerFingerprint: string, _signaling: unknown) {
      this.localFingerprint = localFingerprint;
      this.peerFingerprint = peerFingerprint;
      channelInstances.push(this as unknown as MockChannel);
    }
  },
}));

function makeTrack(kind: 'audio' | 'video') {
  return {
    kind,
    enabled: true,
    stop: vi.fn(),
    applyConstraints: vi.fn(async () => undefined),
  } as unknown as MediaStreamTrack;
}

function makeStream(tracks: MediaStreamTrack[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
  } as unknown as MediaStream;
}

const audioTrack = makeTrack('audio');
const videoTrack = makeTrack('video');
const localStream = makeStream([audioTrack, videoTrack]);

const getUserMedia = vi.fn(async () => localStream);

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value,
  });
}

describe('P2PMediaCall', () => {
  beforeEach(() => {
    channelInstances.length = 0;
    signalingInstances.length = 0;
    getUserMedia.mockClear();
    audioTrack.enabled = true;
    videoTrack.enabled = true;
    setMediaDevices({ getUserMedia });
  });

  afterEach(() => {
    setMediaDevices(undefined);
    vi.clearAllMocks();
  });

  it('requests audio+video and initiates when the local fingerprint sorts first', async () => {
    const call = new P2PMediaCall({
      localFingerprint: 'nova_pk_aaa',
      peerFingerprint: 'nova_pk_bbb',
      mode: 'video',
    });

    await call.start();

    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.any(Object), video: expect.any(Object) })
    );
    expect(channelInstances).toHaveLength(1);
    expect(channelInstances[0].attachLocalStream).toHaveBeenCalledWith(localStream);
    expect(channelInstances[0].connectAsInitiator).toHaveBeenCalledTimes(1);
    expect(channelInstances[0].connectAsResponder).not.toHaveBeenCalled();
  });

  it('responds when the peer fingerprint sorts first and disables video for voice calls', async () => {
    const call = new P2PMediaCall({
      localFingerprint: 'nova_pk_zzz',
      peerFingerprint: 'nova_pk_aaa',
      mode: 'voice',
    });

    await call.start();

    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: false })
    );
    expect(channelInstances[0].connectAsResponder).toHaveBeenCalledTimes(1);
    expect(channelInstances[0].connectAsInitiator).not.toHaveBeenCalled();
  });

  it('maps channel state to call status and stops media on end', async () => {
    const call = new P2PMediaCall({
      localFingerprint: 'nova_pk_aaa',
      peerFingerprint: 'nova_pk_bbb',
      mode: 'video',
    });
    const statuses: string[] = [];
    call.onStatus((status) => statuses.push(status));

    await call.start();
    channelInstances[0].stateListener?.({ status: 'connected' });
    expect(call.getStatus()).toBe('connected');

    call.end();

    expect(audioTrack.stop).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(channelInstances[0].close).toHaveBeenCalled();
    expect(signalingInstances[0].close).toHaveBeenCalled();
    expect(call.getStatus()).toBe('ended');
    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('ended');
  });

  it('reuses an injected signaling client and leaves it open on end', async () => {
    const shared = {
      connect: vi.fn().mockResolvedValue(true),
      sendSignal: vi.fn().mockResolvedValue(undefined),
      onMessage: vi.fn(() => vi.fn()),
      close: vi.fn(),
    } as unknown as import('./signaling').P2PSignalingClient;

    const call = new P2PMediaCall({
      localFingerprint: 'nova_pk_aaa',
      peerFingerprint: 'nova_pk_bbb',
      mode: 'voice',
      signaling: shared,
    });

    await call.start();
    expect(signalingInstances).toHaveLength(0);
    call.end();
    expect(shared.close).not.toHaveBeenCalled();
  });

  it('toggles microphone and camera tracks', async () => {
    const call = new P2PMediaCall({
      localFingerprint: 'nova_pk_aaa',
      peerFingerprint: 'nova_pk_bbb',
      mode: 'video',
    });
    await call.start();

    expect(call.setMicrophoneEnabled(false)).toBe(true);
    expect(audioTrack.enabled).toBe(false);
    expect(call.setCameraEnabled(false)).toBe(true);
    expect(videoTrack.enabled).toBe(false);
  });

  it('reports a failed status when media access is denied', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
    const call = new P2PMediaCall({
      localFingerprint: 'nova_pk_aaa',
      peerFingerprint: 'nova_pk_bbb',
      mode: 'video',
    });
    const onError = vi.fn();
    call.onError(onError);

    await call.start();

    expect(call.getStatus()).toBe('failed');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Permission denied' }));
    expect(channelInstances).toHaveLength(0);
  });
});
