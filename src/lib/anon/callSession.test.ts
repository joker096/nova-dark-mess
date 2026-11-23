import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnonCallSnapshot } from './callSession';

const media = vi.hoisted(() => ({
  last: null as null | {
    options: { mode: string; localFingerprint: string; peerFingerprint: string };
    started: boolean;
    ended: boolean;
  },
}));

vi.mock('../p2p/mediaCall', () => {
  class FakeP2PMediaCall {
    public started = false;
    public ended = false;
    public readonly options: { mode: string; localFingerprint: string; peerFingerprint: string };

    constructor(options: { mode: string; localFingerprint: string; peerFingerprint: string }) {
      this.options = options;
      media.last = this;
    }

    onLocalStream() {}
    onRemoteStream() {}
    onStatus() {}
    onError() {}
    async start() {
      this.started = true;
    }
    end() {
      this.ended = true;
    }
    setMicrophoneEnabled() {
      return true;
    }
    setCameraEnabled() {
      return true;
    }
  }

  return { P2PMediaCall: FakeP2PMediaCall };
});

import { AnonCallSession } from './callSession';
import { parseAnonCallMessage } from './callProtocol';

function setup() {
  const sent: string[] = [];
  const states: AnonCallSnapshot[] = [];
  const session = new AnonCallSession({
    contactId: 'contact-1',
    contactName: 'Bob',
    send: async (body) => {
      sent.push(body);
      return true;
    },
    onState: (state) => states.push(state),
  });
  return { session, sent, states };
}

describe('AnonCallSession', () => {
  beforeEach(() => {
    media.last = null;
  });

  it('sends an invite and starts media after accept', async () => {
    const { session, sent, states } = setup();
    await session.start('voice');

    const invite = parseAnonCallMessage(sent[0]);
    expect(invite?.kind).toBe('invite');
    expect(invite?.mode).toBe('voice');
    expect(states.at(-1)?.phase).toBe('outgoing');

    session.handle({
      __novaCall: 1,
      kind: 'accept',
      callId: invite!.callId,
    });

    await vi.waitFor(() => expect(media.last?.started).toBe(true));
    expect(media.last?.options.mode).toBe('voice');
    expect(media.last?.options.localFingerprint).toBe('a');
    expect(media.last?.options.peerFingerprint).toBe('b');
    expect(states.at(-1)?.phase).toBe('active');

    await session.end();
    expect(media.last?.ended).toBe(true);
    expect(parseAnonCallMessage(sent.at(-1)!)?.kind).toBe('end');
  });

  it('accepts an incoming call as the responder', async () => {
    const { session, sent, states } = setup();
    session.handle({
      __novaCall: 1,
      kind: 'invite',
      callId: 'call_incoming_1',
      mode: 'video',
    });
    expect(states.at(-1)?.phase).toBe('incoming');

    await session.accept();
    await vi.waitFor(() => expect(media.last?.started).toBe(true));
    expect(media.last?.options.localFingerprint).toBe('b');
    expect(media.last?.options.peerFingerprint).toBe('a');
    expect(parseAnonCallMessage(sent[0])?.kind).toBe('accept');
  });

  it('declines an incoming call', async () => {
    const { session, sent, states } = setup();
    session.handle({
      __novaCall: 1,
      kind: 'invite',
      callId: 'call_incoming_2',
      mode: 'voice',
    });

    await session.decline();
    expect(parseAnonCallMessage(sent[0])?.kind).toBe('decline');
    expect(states.at(-1)?.phase).toBe('idle');
  });
});
