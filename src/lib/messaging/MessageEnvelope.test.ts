/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMessageEnvelope,
  serializeMessageEnvelope,
  deserializeMessageEnvelope,
  isMessageExpired,
  getMessageTimeToLive,
  MESSAGE_ENVELOPE_VERSION,
  type MessageEnvelope,
} from './MessageEnvelope';

describe('MessageEnvelope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a message envelope with defaults', () => {
    const env = createMessageEnvelope({
      type: 'message',
      sender: 'sender-key',
      recipient: 'recipient-key',
      encryptedPayload: 'payload',
      iv: 'iv',
      mac: 'mac',
    });

    expect(env.version).toBe(MESSAGE_ENVELOPE_VERSION);
    expect(env.type).toBe('message');
    expect(env.sender).toBe('sender-key');
    expect(env.recipient).toBe('recipient-key');
    expect(env.timestamp).toBe(1767225600000);
    expect(env.ttl).toBe(0);
    expect(env.encryptedPayload).toBe('payload');
    expect(env.iv).toBe('iv');
    expect(env.mac).toBe('mac');
    expect(env.forwardSecrecy).toBe(true);
    expect(env.priority).toBe('normal');
  });

  it('creates a message envelope with custom values', () => {
    const env = createMessageEnvelope({
      type: 'file',
      sender: 'alice',
      recipient: 'bob',
      ttl: 3600,
      encryptedPayload: 'enc-payload',
      iv: 'enc-iv',
      mac: 'enc-mac',
      forwardSecrecy: false,
      priority: 'urgent',
    });

    expect(env.type).toBe('file');
    expect(env.ttl).toBe(3600);
    expect(env.forwardSecrecy).toBe(false);
    expect(env.priority).toBe('urgent');
  });

  it('serializes and deserializes correctly', () => {
    const original: MessageEnvelope = {
      version: MESSAGE_ENVELOPE_VERSION,
      type: 'call',
      sender: 'sender',
      recipient: 'recipient',
      timestamp: 1767225600000,
      ttl: 60,
      encryptedPayload: 'payload',
      iv: 'iv',
      mac: 'mac',
      forwardSecrecy: true,
      priority: 'low',
    };

    const json = serializeMessageEnvelope(original);
    const restored = deserializeMessageEnvelope(json);

    expect(restored).toEqual(original);
  });

  it('throws on invalid version', () => {
    const json = JSON.stringify({
      version: 999,
      type: 'message',
      sender: 's',
      recipient: 'r',
      timestamp: 1,
      ttl: 0,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    });

    expect(() => deserializeMessageEnvelope(json)).toThrow(
      'Unsupported message envelope version',
    );
  });

  it('throws on invalid type', () => {
    const json = JSON.stringify({
      version: 1,
      type: 'invalid',
      sender: 's',
      recipient: 'r',
      timestamp: 1,
      ttl: 0,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    });

    expect(() => deserializeMessageEnvelope(json)).toThrow(
      'Invalid message envelope type',
    );
  });

  it('throws on invalid priority', () => {
    const json = JSON.stringify({
      version: 1,
      type: 'message',
      sender: 's',
      recipient: 'r',
      timestamp: 1,
      ttl: 0,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'critical',
    });

    expect(() => deserializeMessageEnvelope(json)).toThrow(
      'Invalid message priority',
    );
  });

  it('throws on missing sender', () => {
    const json = JSON.stringify({
      version: 1,
      type: 'message',
      sender: '',
      recipient: 'r',
      timestamp: 1,
      ttl: 0,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    });

    expect(() => deserializeMessageEnvelope(json)).toThrow('sender is required');
  });

  it('isMessageExpired returns false for ttl=0', () => {
    const env: MessageEnvelope = {
      version: 1,
      type: 'message',
      sender: 's',
      recipient: 'r',
      timestamp: 1767225600000,
      ttl: 0,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    };

    expect(isMessageExpired(env)).toBe(false);
  });

  it('isMessageExpired returns true when TTL passed', () => {
    const env: MessageEnvelope = {
      version: 1,
      type: 'message',
      sender: 's',
      recipient: 'r',
      timestamp: 1767225600000,
      ttl: 1,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    };

    // Advance time past expiry (1 second after timestamp)
    vi.setSystemTime(1767225601001);
    expect(isMessageExpired(env)).toBe(true);
  });

  it('isMessageExpired returns false before TTL expiry', () => {
    const env: MessageEnvelope = {
      version: 1,
      type: 'message',
      sender: 's',
      recipient: 'r',
      timestamp: 1767225600000,
      ttl: 3600,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    };

    expect(isMessageExpired(env)).toBe(false);
  });

  it('getMessageTimeToLive returns Infinity for ttl=0', () => {
    const env: MessageEnvelope = {
      version: 1,
      type: 'message',
      sender: 's',
      recipient: 'r',
      timestamp: 1767225600000,
      ttl: 0,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    };

    expect(getMessageTimeToLive(env)).toBe(Infinity);
  });

  it('getMessageTimeToLive returns remaining ms', () => {
    const env: MessageEnvelope = {
      version: 1,
      type: 'message',
      sender: 's',
      recipient: 'r',
      timestamp: 1767225600000,
      ttl: 60,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    };

    // Advance time by 10 seconds
    vi.setSystemTime(1767225610000);
    const ttl = getMessageTimeToLive(env);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(50000);
  });

  it('getMessageTimeToLive returns 0 when expired', () => {
    const env: MessageEnvelope = {
      version: 1,
      type: 'message',
      sender: 's',
      recipient: 'r',
      timestamp: 1767225600000,
      ttl: 1,
      encryptedPayload: 'p',
      iv: 'i',
      mac: 'm',
      forwardSecrecy: true,
      priority: 'normal',
    };

    vi.setSystemTime(1767225602000);
    expect(getMessageTimeToLive(env)).toBe(0);
  });
});
