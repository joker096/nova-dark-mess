import { describe, it, expect, vi } from 'vitest';
import { RoomDataChannel, isRoomChannelSupported } from './roomChannel';

/** Minimal in-memory BroadcastChannel, shared by name. */
class FakeBroadcastChannel {
  static channels = new Map<string, FakeBroadcastChannel[]>();

  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;

  constructor(public readonly name: string) {
    const list = FakeBroadcastChannel.channels.get(name) ?? [];
    list.push(this);
    FakeBroadcastChannel.channels.set(name, list);
  }

  postMessage(data: unknown): void {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this && !channel.closed) channel.onmessage?.({ data });
    }
  }

  close(): void {
    this.closed = true;
    const list = FakeBroadcastChannel.channels.get(this.name) ?? [];
    FakeBroadcastChannel.channels.set(
      this.name,
      list.filter((channel) => channel !== this),
    );
  }
}

class FakeDataChannel {
  peer: FakeDataChannel | null = null;
  readyState: RTCDataChannelState = 'connecting';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(public readonly label: string) {}

  send(data: unknown): void {
    if (this.readyState !== 'open' || !this.peer) throw new Error('channel not open');
    this.peer.onmessage?.({ data });
  }

  close(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
    const peer = this.peer;
    this.peer = null;
    if (peer && peer.readyState !== 'closed') {
      peer.readyState = 'closed';
      peer.onclose?.();
    }
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }
}

class FakePeerConnection {
  static bySdp = new Map<string, FakePeerConnection>();

  localDescription: RTCSessionDescriptionInit | null = null;
  remote: FakePeerConnection | null = null;
  channel: FakeDataChannel | null = null;
  closed = false;
  onicecandidate: ((event: { candidate: null }) => void) | null = null;
  ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null;

  constructor(public readonly id: number, public readonly config: RTCConfiguration) {}

  createDataChannel(label: string): FakeDataChannel {
    this.channel = new FakeDataChannel(label);
    return this.channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: `sdp-${this.id}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: `sdp-${this.id}` };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    FakePeerConnection.bySdp.set(description.sdp ?? '', this);
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    const remote = FakePeerConnection.bySdp.get(description.sdp ?? '');
    if (!remote) return;
    this.remote = remote;
    remote.remote = this;

    // The responder learns about the initiator's channel through ondatachannel.
    if (description.type === 'offer' && remote.channel && !this.channel) {
      const incoming = new FakeDataChannel(remote.channel.label);
      incoming.peer = remote.channel;
      remote.channel.peer = incoming;
      this.channel = incoming;
      this.ondatachannel?.({ channel: incoming });
    }

    if (this.channel?.peer && remote.channel && this.channel.peer === remote.channel) {
      remote.channel.open();
      this.channel.open();
    }
  }

  async addIceCandidate(): Promise<void> {
    /* candidates are irrelevant for the fake transport */
  }

  close(): void {
    this.closed = true;
    this.channel?.close();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RoomDataChannel', () => {
  it('reports WebRTC availability for the current environment', () => {
    expect(isRoomChannelSupported()).toBe(typeof RTCPeerConnection !== 'undefined');
  });

  it('connects two peers over a signaled DataChannel and exchanges both payload kinds', async () => {
    FakeBroadcastChannel.channels.clear();
    FakePeerConnection.bySdp.clear();
    let nextId = 0;

    const factory = (config: RTCConfiguration) =>
      new FakePeerConnection(nextId++, config) as unknown as RTCPeerConnection;

    const receivedByA = vi.fn();
    const receivedByB = vi.fn();

    const a = new RoomDataChannel({
      room: 'chat-1',
      selfId: 'peer-a',
      onMessage: receivedByA,
      createPeerConnection: factory,
      createSignalChannel: (name) => new FakeBroadcastChannel(name) as unknown as BroadcastChannel,
    });
    const b = new RoomDataChannel({
      room: 'chat-1',
      selfId: 'peer-b',
      onMessage: receivedByB,
      createPeerConnection: factory,
      createSignalChannel: (name) => new FakeBroadcastChannel(name) as unknown as BroadcastChannel,
    });

    a.start();
    b.start();
    await flush();

    expect(a.isConnected()).toBe(true);
    expect(b.isConnected()).toBe(true);
    expect(a.getPeerCount()).toBe(1);

    expect(a.send(JSON.stringify({ type: 'group_message' }))).toBe(1);
    expect(receivedByB).toHaveBeenCalledWith('peer-a', JSON.stringify({ type: 'group_message' }));

    const binary = new TextEncoder().encode('chunk');
    expect(b.send(binary.buffer as ArrayBuffer)).toBe(1);
    expect(receivedByA).toHaveBeenCalledWith('peer-b', binary.buffer);

    a.dispose();
    b.dispose();
  });

  it('returns zero deliveries while no peer channel is open', () => {
    const channel = new RoomDataChannel({
      room: 'chat-empty',
      selfId: 'solo',
      onMessage: vi.fn(),
      createPeerConnection: () => {
        throw new Error('must not connect without a peer');
      },
      createSignalChannel: () => null,
    });

    channel.start();
    expect(channel.isConnected()).toBe(false);
    expect(channel.send('hello')).toBe(0);
    channel.dispose();
  });

  it('reports the peer count and stops delivering after dispose', async () => {
    FakeBroadcastChannel.channels.clear();
    FakePeerConnection.bySdp.clear();
    let nextId = 0;
    const factory = (config: RTCConfiguration) =>
      new FakePeerConnection(nextId++, config) as unknown as RTCPeerConnection;

    const peerCounts: number[] = [];
    const received = vi.fn();

    const a = new RoomDataChannel({
      room: 'chat-2',
      selfId: 'a',
      onMessage: vi.fn(),
      onPeerCountChange: (count) => peerCounts.push(count),
      createPeerConnection: factory,
      createSignalChannel: (name) => new FakeBroadcastChannel(name) as unknown as BroadcastChannel,
    });
    const b = new RoomDataChannel({
      room: 'chat-2',
      selfId: 'b',
      onMessage: received,
      createPeerConnection: factory,
      createSignalChannel: (name) => new FakeBroadcastChannel(name) as unknown as BroadcastChannel,
    });

    a.start();
    b.start();
    await flush();
    expect(peerCounts).toContain(1);

    a.dispose();
    expect(a.isConnected()).toBe(false);
    expect(a.send('after dispose')).toBe(0);

    b.dispose();
  });
});
