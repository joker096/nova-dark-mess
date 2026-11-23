import { describe, expect, it, vi } from 'vitest';
import {
  ANON_CALL_VERSION,
  AnonCallSignaling,
  anonCallIds,
  type AnonCallMessage,
  encodeAnonCallMessage,
  isAnonCallMessage,
  parseAnonCallMessage,
} from './callProtocol';

const CALL_ID = 'call_0123456789abcdef';

describe('anonymous call protocol', () => {
  it('round-trips invite and signal messages', () => {
    const invite: AnonCallMessage = {
      __novaCall: ANON_CALL_VERSION,
      kind: 'invite',
      callId: CALL_ID,
      mode: 'voice',
    };
    expect(parseAnonCallMessage(encodeAnonCallMessage(invite))).toEqual(invite);

    const signal: AnonCallMessage = {
      __novaCall: ANON_CALL_VERSION,
      kind: 'signal',
      callId: CALL_ID,
      signalType: 'offer',
      payload: { type: 'offer', sdp: 'v=0' },
    };
    expect(parseAnonCallMessage(encodeAnonCallMessage(signal))).toEqual(signal);
  });

  it('rejects malformed or non-call payloads', () => {
    expect(parseAnonCallMessage('hello')).toBeNull();
    expect(parseAnonCallMessage('{')).toBeNull();
    expect(parseAnonCallMessage(JSON.stringify({ __novaCall: 1, kind: 'invite' }))).toBeNull();
    expect(
      parseAnonCallMessage(JSON.stringify({ __novaCall: 1, kind: 'invite', callId: 'short', mode: 'voice' })),
    ).toBeNull();
    expect(isAnonCallMessage({ __novaCall: 1, kind: 'accept', callId: CALL_ID })).toBe(true);
  });

  it('routes signaling over the provided send function', async () => {
    const send = vi.fn(async () => true);
    const signaling = new AnonCallSignaling({
      callId: CALL_ID,
      ...anonCallIds('caller'),
      send,
    });
    const received: unknown[] = [];
    signaling.onMessage((message) => received.push(message));

    await signaling.sendSignal({
      type: 'offer',
      senderFingerprint: 'a',
      targetFingerprint: 'b',
      payload: { sdp: 'v=0' },
    });

    expect(send).toHaveBeenCalledWith({
      __novaCall: ANON_CALL_VERSION,
      kind: 'signal',
      callId: CALL_ID,
      signalType: 'offer',
      payload: { sdp: 'v=0' },
    });

    signaling.receive({
      __novaCall: ANON_CALL_VERSION,
      kind: 'signal',
      callId: CALL_ID,
      signalType: 'answer',
      payload: { sdp: 'v=1' },
    });

    expect(received).toEqual([
      {
        type: 'answer',
        senderFingerprint: 'b',
        targetFingerprint: 'a',
        payload: { sdp: 'v=1' },
      },
    ]);
    signaling.close();
  });
});
