import { vi } from 'vitest';
import type { MeshRelay, RelayDeliveryHandler, RelayEnvelope } from '../lib/p2p/relay';
import type { P2PSignalingClient, SignalingMessage } from '../lib/p2p/signaling';

/**
 * In-memory signaling bus: every message is delivered to the target client's
 * listeners, which lets two managers run a real prekey request/response exchange.
 */
export function createSignalingBus() {
  const listeners = new Map<string, Set<(message: SignalingMessage) => void>>();
  const sent: SignalingMessage[] = [];

  const listenersFor = (fingerprint: string) => {
    let set = listeners.get(fingerprint);
    if (!set) {
      set = new Set();
      listeners.set(fingerprint, set);
    }
    return set;
  };

  const clientFor = (fingerprint: string): P2PSignalingClient =>
    ({
      onMessage(callback: (message: SignalingMessage) => void) {
        const set = listenersFor(fingerprint);
        set.add(callback);
        return () => set.delete(callback);
      },
      // WebRTC itself is out of scope here: report a failed transport so the
      // managers keep using the injected relay.
      async connect() {
        return false;
      },
      async sendSignal(message: SignalingMessage) {
        sent.push(message);
        await Promise.resolve();
        listenersFor(message.targetFingerprint).forEach((listener) => listener(message));
      },
      close() {
        /* no-op */
      },
    }) as unknown as P2PSignalingClient;

  return { clientFor, sent };
}

export function createSilentSignaling(): P2PSignalingClient {
  return {
    onMessage: () => () => {},
    connect: async () => false,
    sendSignal: async () => {},
    close: () => {},
  } as unknown as P2PSignalingClient;
}

/** Minimal RTCPeerConnection stand-in so managers can attempt (and fail) WebRTC. */
export function installWebRtcStub(): void {
  class FakeRTCPeerConnection {
    public connectionState = 'new';
    public addTrack() {}
    public createDataChannel() {
      return { readyState: 'connecting', send() {}, close() {} };
    }
    public async createOffer() {
      return { type: 'offer', sdp: 'v=0' };
    }
    public async createAnswer() {
      return { type: 'answer', sdp: 'v=0' };
    }
    public async setLocalDescription() {}
    public async setRemoteDescription() {}
    public async addIceCandidate() {}
    public close() {}
  }
  vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection);
}

export interface RelayStub {
  peer: RelayStub | null;
  sent: unknown[];
  onDeliver(callback: RelayDeliveryHandler): void;
  send(destination: string, payload: unknown): boolean;
  close(): void;
  deliver(envelope: RelayEnvelope): void;
}

function createRelayStub(localFingerprint: string): RelayStub {
  let handler: RelayDeliveryHandler | null = null;
  const stub: RelayStub = {
    peer: null,
    sent: [],
    onDeliver: (callback) => {
      handler = callback;
    },
    send: (destination, payload) => {
      if (!stub.peer) return false;
      stub.sent.push(payload);
      const envelope: RelayEnvelope = {
        id: `relay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        origin: localFingerprint,
        destination,
        ttl: 1,
        createdAt: Date.now(),
        hops: [localFingerprint],
        sealed: true,
        payload,
      };
      queueMicrotask(() => stub.peer?.deliver(envelope));
      return true;
    },
    close: () => {},
    deliver: (envelope) => handler?.(envelope),
  };
  return stub;
}

export function createRelayPair(aliceFingerprint: string, bobFingerprint: string) {
  const aliceRelay = createRelayStub(aliceFingerprint);
  const bobRelay = createRelayStub(bobFingerprint);
  aliceRelay.peer = bobRelay;
  bobRelay.peer = aliceRelay;
  return {
    aliceRelay,
    bobRelay,
    asMeshRelay: (stub: RelayStub) => stub as unknown as MeshRelay,
  };
}

export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
