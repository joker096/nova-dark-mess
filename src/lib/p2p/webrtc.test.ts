/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { P2PMessengerChannel, TURN_SERVERS } from './webrtc';
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
    const webrtc = await import('./webrtc');
    const original = [...webrtc.TURN_SERVERS];
    webrtc.TURN_SERVERS.push({ urls: 'turn:turn.example:3478' });
    vi.stubGlobal('RTCPeerConnection', FakePC);
    try {
      const channel = new webrtc.P2PMessengerChannel(
        'me',
        'peer',
        new FakeSignaling() as unknown as P2PSignalingClient,
        { icePolicy: 'relay-only' },
      );
      (channel as unknown as { ensurePeerConnection(): void }).ensurePeerConnection();
      expect(FakePC.lastConfig?.iceTransportPolicy).toBe('relay');
      expect(FakePC.lastConfig?.iceServers).toEqual([{ urls: 'turn:turn.example:3478' }]);
    } finally {
      webrtc.TURN_SERVERS.length = 0;
      webrtc.TURN_SERVERS.push(...original);
      vi.unstubAllGlobals();
    }
  });
});
