/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  DeviceLinkManager,
  encodeDeviceLinkOffer,
  encodeDeviceLinkResponse,
  parseDeviceLinkOffer,
  parseDeviceLinkResponse,
} from './deviceLinking';

describe('DeviceLinkManager', () => {
  it('establishes a shared secret and round-trips a payload', async () => {
    const primary = new DeviceLinkManager();
    const secondary = new DeviceLinkManager();

    const offer = primary.createOffer();
    const response = secondary.acceptOffer(offer);

    const primarySession = primary.finalizeFromResponse(response);
    const secondarySession = secondary.finalizeFromStoredSecret(offer.publicKey, offer.code);

    expect(primarySession.sharedSecret).toBe(secondarySession.sharedSecret);

    const cipher = await primary.encryptPayload(primarySession, 'history data');
    const plain = await secondary.decryptPayload(secondarySession, cipher);
    expect(plain).toBe('history data');
  });

  it('encodes and parses a device-link offer', () => {
    const manager = new DeviceLinkManager();
    const offer = manager.createOffer();

    const parsed = parseDeviceLinkOffer(encodeDeviceLinkOffer(offer));

    expect(parsed).toEqual(offer);
  });

  it('rejects malformed device-link offers', () => {
    expect(parseDeviceLinkOffer('https://example.com/device-link?code=ABCDEF')).toBeNull();
    expect(parseDeviceLinkOffer('nova://wrong-host?code=ABCDEF')).toBeNull();
    expect(parseDeviceLinkOffer('nova://device-link?pk=abc&exp=1')).toBeNull();

    const manager = new DeviceLinkManager();
    const offer = manager.createOffer();
    const malformedKey = encodeDeviceLinkOffer({ ...offer, publicKey: 'not-a-key' });
    expect(parseDeviceLinkOffer(malformedKey)).toBeNull();
  });

  it('round-trips the secondary reply through a scannable code', () => {
    const primary = new DeviceLinkManager();
    const secondary = new DeviceLinkManager();
    const offer = primary.createOffer();
    const response = secondary.acceptOffer(offer);

    const encoded = encodeDeviceLinkResponse(response);
    expect(parseDeviceLinkResponse(encoded)).toEqual(response);

    const primarySession = primary.finalizeFromResponse(parseDeviceLinkResponse(encoded)!);
    const secondarySession = secondary.finalizeFromStoredSecret(offer.publicKey, offer.code);
    expect(primarySession.sharedSecret).toBe(secondarySession.sharedSecret);
  });

  it('rejects malformed secondary replies', () => {
    expect(parseDeviceLinkResponse('nova://device-link?code=ABCDEF')).toBeNull();
    expect(parseDeviceLinkResponse('https://device-link-response?code=ABCDEF')).toBeNull();
    expect(parseDeviceLinkResponse('nova://device-link-response?pk=abc')).toBeNull();

    const manager = new DeviceLinkManager();
    const response = manager.acceptOffer(manager.createOffer());
    expect(parseDeviceLinkResponse(encodeDeviceLinkResponse({ ...response, publicKey: 'nope' }))).toBeNull();
  });

  it('refuses to accept an expired offer', () => {
    const primary = new DeviceLinkManager();
    const secondary = new DeviceLinkManager();
    const offer = { ...primary.createOffer(), expiresAt: Date.now() - 1 };

    expect(() => secondary.acceptOffer(offer)).toThrow(/expired/i);
  });

  it('exports, encrypts, decrypts and imports history snapshot across linked devices', async () => {
    const primary = new DeviceLinkManager();
    const secondary = new DeviceLinkManager();
    const offer = primary.createOffer();
    const response = secondary.acceptOffer(offer);

    const primarySession = primary.finalizeFromResponse(response);
    const secondarySession = secondary.finalizeFromStoredSecret(offer.publicKey, offer.code);

    const mockHistories = {
      katie: [
        { id: 'm1', senderId: 'katie', text: 'Hey there', time: '10:00' },
        { id: 'm2', senderId: 'me', text: 'Hello Katie', time: '10:01', isRead: true },
      ],
      thailand: [
        { id: 'm3', senderId: 'other', text: 'Trip planning', time: 'Yesterday' },
      ],
    };

    const encrypted = await primary.exportHistorySnapshot(primarySession, mockHistories);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();

    const imported = await secondary.importHistorySnapshot(secondarySession, encrypted);
    expect(imported.version).toBe(1);
    expect(imported.chats).toHaveLength(2);
    expect(imported.chats[0].id).toBe('katie');
    expect(imported.chats[0].messages).toHaveLength(2);
    expect(imported.chats[0].messages[0].text).toBe('Hey there');
    expect(imported.chats[1].id).toBe('thailand');
    expect(imported.chats[1].messages[0].text).toBe('Trip planning');
  });
});
