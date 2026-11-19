/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import {
  P2PMessengerChannel,
  TURN_SERVERS,
  setTurnServers,
} from './webrtc';
import { P2PSignalingClient } from './signaling';

class FakeSignaling {
  onMessage() {
    return () => void 0;
  }
  async sendSignal() {
    return true;
  }
}

class FakePC {
  static lastConfig: RTCConfiguration | null = null;
  constructor(config: RTCConfiguration) {
    FakePC.lastConfig = config;
  }
  ontrack = null;
  onicecandidate = null;
  onconnectionstatechange = null;
  ondatachannel = null;
  getSenders() {
    return [];
  }
  addTrack() {
    return null;
  }
  createDataChannel() {
    return { close() {} } as unknown as RTCDataChannel;
  }
  close() {}
}

describe('P2PMessengerChannel — ICE privacy policy', () => {
  it('defaults to direct ICE with STUN servers', () => {
    vi.stubGlobal('RTCPeerConnection', FakePC);
    try {
      const channel = new P2PMessengerChannel(
        'me',
        'peer',
        new FakeSignaling() as unknown as P2PSignalingClient,
      );
      // touching the private factory via attachLocalStream-free path:
      (channel as unknown as { ensurePeerConnection(): void }).ensurePeerConnection();
      expect(FakePC.lastConfig).toEqual({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to direct ICE when relay-only is requested but no TURN is configured', () => {
    vi.stubGlobal('RTCPeerConnection', FakePC);
    try {
      const channel = new P2PMessengerChannel(
        'me',
        'peer',
        new FakeSignaling() as unknown as P2PSignalingClient,
        { icePolicy: 'relay-only' },
      );
      (channel as unknown as { ensurePeerConnection(): void }).ensurePeerConnection();
      // TURN_SERVERS is empty in the default build: no relay policy, no relay
      // config that would silently break every connection.
      expect(FakePC.lastConfig?.iceTransportPolicy).toBeUndefined();
      expect(FakePC.lastConfig?.iceServers).toEqual([
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('P2PMessengerChannel — relay-only with TURN configured', () => {
  it('enforces the relay transport policy when TURN servers exist', async () => {
    const original = [...TURN_SERVERS];
    TURN_SERVERS.push({ urls: 'turn:turn.example:3478' });
    vi.stubGlobal('RTCPeerConnection', FakePC);
    try {
      const channel = new P2PMessengerChannel(
        'me',
        'peer',
        new FakeSignaling() as unknown as P2PSignalingClient,
        { icePolicy: 'relay-only' },
      );
      (channel as unknown as { ensurePeerConnection(): void }).ensurePeerConnection();
      expect(FakePC.lastConfig?.iceTransportPolicy).toBe('relay');
      expect(FakePC.lastConfig?.iceServers).toEqual([{ urls: 'turn:turn.example:3478' }]);
    } finally {
      TURN_SERVERS.length = 0;
      TURN_SERVERS.push(...original);
      vi.unstubAllGlobals();
    }
  });
});

describe('setTurnServers', () => {
  const original: RTCIceServer[] = [...TURN_SERVERS];

  afterEach(() => {
    // Restore original TURN_SERVERS.
    setTurnServers([]);
    setTurnServers(original);
  });

  it('replaces the TURN server list', () => {
    setTurnServers([{ urls: 'turn:turn1.example:3478' }]);
    expect(TURN_SERVERS).toEqual([{ urls: 'turn:turn1.example:3478' }]);

    setTurnServers([
      { urls: 'turn:turn2.example:3478', username: 'user', credential: 'pass' },
    ]);
    expect(TURN_SERVERS).toEqual([
      { urls: 'turn:turn2.example:3478', username: 'user', credential: 'pass' },
    ]);
  });

  it('clears TURN servers when called with an empty array', () => {
    setTurnServers([{ urls: 'turn:turn1.example:3478' }]);
    setTurnServers([]);
    expect(TURN_SERVERS).toEqual([]);
  });
});

describe('Call quality monitoring', () => {
  const statsReports: Map<string, any> = new Map();

  class FakePCWithStats {
    static lastConfig: RTCConfiguration | null = null;
    ontrack = null;
    onicecandidate = null;
    onconnectionstatechange = null;
    ondatachannel = null;
    getSenders() {
      return [];
    }
    addTrack() {
      return null;
    }
    createDataChannel() {
      return { close() {} } as unknown as RTCDataChannel;
    }
    close() {}
    async getStats() {
      return new Map(statsReports);
    }
  }

  beforeEach(() => {
    statsReports.clear();
    statsReports.set('pair1', {
      type: 'candidate-pair',
      state: 'succeeded',
      bytesSent: 1000,
      bytesReceived: 2000,
      packetsSent: 100,
      packetsLost: 1,
      packetsReceived: 200,
      currentRoundTripTime: 0.05,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('startQualityMonitoring polls getStats and invokes callback', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePCWithStats);
    const signaling = new (class {
      onMessage() {
        return () => void 0;
      }
      async sendSignal() {
        return true;
      }
    })() as unknown as import('./signaling').P2PSignalingClient;

    const samples: any[] = [];
    const channel = new P2PMessengerChannel(
      'me',
      'peer',
      signaling,
      { icePolicy: 'direct' },
    );
    // Create the peer connection so getStats has something to sample.
    (channel as unknown as { ensurePeerConnection(): void }).ensurePeerConnection();
    channel.startQualityMonitoring({
      pollIntervalMs: 50,
      onStats: (s) => samples.push(s),
    });

    // Wait for at least two samples.
    await new Promise((r) => setTimeout(r, 150));
    channel.stopQualityMonitoring();

    expect(samples.length).toBeGreaterThanOrEqual(2);
    expect(samples[0]).toMatchObject({
      sendBitrateBps: expect.any(Number),
      receiveBitrateBps: expect.any(Number),
      sendPacketLoss: expect.any(Number),
      receivePacketLoss: expect.any(Number),
      rttMs: expect.any(Number),
      sampledAt: expect.any(Number),
    });
    expect(samples[0].rttMs).toBe(50); // 0.05 * 1000
  });

  it('stopQualityMonitoring stops further samples', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePCWithStats);
    const signaling = new (class {
      onMessage() {
        return () => void 0;
      }
      async sendSignal() {
        return true;
      }
    })() as unknown as import('./signaling').P2PSignalingClient;

    const samples: any[] = [];
    const channel = new P2PMessengerChannel(
      'me',
      'peer',
      signaling,
      { icePolicy: 'direct' },
    );
    // Create the peer connection so getStats has something to sample.
    (channel as unknown as { ensurePeerConnection(): void }).ensurePeerConnection();
    channel.startQualityMonitoring({
      pollIntervalMs: 30,
      onStats: (s) => samples.push(s),
    });

    await new Promise((r) => setTimeout(r, 100));
    channel.stopQualityMonitoring();
    const countBefore = samples.length;
    await new Promise((r) => setTimeout(r, 100));

    expect(samples.length).toBe(countBefore);
  });
});
