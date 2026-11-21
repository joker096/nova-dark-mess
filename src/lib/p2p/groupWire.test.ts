/// <reference types="vitest/globals" />

import { describe, expect, it } from 'vitest';
import {
  GROUP_WIRE_TAG,
  GROUP_WIRE_VERSION,
  isAllowedGroupPayload,
  isGroupMessageAllowed,
  parseGroupEnvelope,
  wrapGroupPayload,
} from './groupWire';
import type { GroupPayload } from './groupManager';

const joinRequest: GroupPayload = {
  type: 'group_join_request',
  groupId: 'g1',
  fingerprint: 'nova_pk_alice',
};

describe('group wire envelope (B4)', () => {
  it('round-trips every payload type through the versioned envelope', () => {
    const wrapped = wrapGroupPayload(joinRequest);
    const parsed = JSON.parse(wrapped) as Record<string, unknown>;
    expect(parsed[GROUP_WIRE_TAG]).toBe(GROUP_WIRE_VERSION);
    expect(parseGroupEnvelope(wrapped)).toEqual(joinRequest);
  });

  it('never mistakes ordinary chat text for a group frame', () => {
    expect(parseGroupEnvelope('hello group')).toBeNull();
    expect(parseGroupEnvelope('{"hello":"world"}')).toBeNull();
    expect(parseGroupEnvelope('{"__nova_group":2,"payload":{"type":"skdm"}}')).toBeNull();
    expect(parseGroupEnvelope('{"__nova_group":1}')).toBeNull();
    expect(parseGroupEnvelope('{"__nova_group":1,"payload":{"type":42}}')).toBeNull();
    expect(parseGroupEnvelope('{not json')).toBeNull();
  });

  it('drops only the bot own echo and passes everything else to the receiver', () => {
    expect(isAllowedGroupPayload(joinRequest, 'nova_pk_bot')).toBe(true);
    const ownFrame: GroupPayload = {
      type: 'group_message',
      groupId: 'g1',
      senderFingerprint: 'nova_pk_bot',
      message: { keyId: 1, iteration: 0, ciphertext: 'x', iv: 'y', signature: 'z' },
    };
    expect(isAllowedGroupPayload(ownFrame, 'nova_pk_bot')).toBe(false);
    expect(isAllowedGroupPayload({ ...ownFrame, senderFingerprint: 'nova_pk_alice' }, 'nova_pk_bot')).toBe(true);
  });
});

describe('group mention-only privacy', () => {
  it('lets commands and mentions through and drops small talk', () => {
    expect(isGroupMessageAllowed('/help', 'helper')).toBe(true);
    expect(isGroupMessageAllowed('  /status now', 'helper')).toBe(true);
    expect(isGroupMessageAllowed('hey @Helper, ping', 'helper')).toBe(true);
    expect(isGroupMessageAllowed('bot:helper are you there', 'helper')).toBe(true);
    expect(isGroupMessageAllowed('just chatting', 'helper')).toBe(false);
    expect(isGroupMessageAllowed('mentioning @someone_else', 'helper')).toBe(false);
  });
});
