import { describe, it, expect } from 'vitest';
import { InMemoryAnonRelay } from './relay';
import { blockSender } from './blocks';
import { queueSigningPublicKey } from './signing';
import {
  acceptInvitation,
  ackInboxPackets,
  contactFromOffer,
  createInvitation,
  receiveInboxPackets,
  receiveContactMessages,
  receiveContactOffers,
  receiveInboxMessages,
  rotateInbox,
  sendContactMessage,
  sendContactOffer,
} from './pairing';
import { decodeInvite, encodeInvite } from './session';

describe('anonymous contact pairing', () => {
  it('pairs two independent one-way inbox queues', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost');
    expect(alice).not.toBeNull();

    const invite = decodeInvite(encodeInvite(alice!.invite));
    expect(invite).not.toBeNull();

    const bob = await acceptInvitation(relay, invite!);
    expect(bob).not.toBeNull();
    expect(bob!.offerSent).toBe(true);

    const bobInbox = bob!.contact.inbox;
    expect(bobInbox.queueId).not.toBe(alice!.inbox.queueId);
    expect(bob!.contact.peerInvite.queueId).toBe(alice!.inbox.queueId);

    const aliceMessages = await receiveInboxMessages(relay, alice!.inbox);
    expect(aliceMessages).toHaveLength(1);
    expect(aliceMessages[0].offer?.queueId).toBe(bobInbox.queueId);

    const aliceContact = contactFromOffer(alice!.inbox, aliceMessages[0].offer!);
    expect(aliceContact).not.toBeNull();
    expect(aliceContact!.peerInvite.queueId).toBe(bobInbox.queueId);
    expect(aliceContact!.peerInvite.queueId).not.toBe(alice!.inbox.queueId);

    await sendContactMessage(relay, aliceContact!, 'hello bob');
    const forBob = await receiveContactMessages(relay, bob!.contact);
    expect(forBob.map((message) => message.body)).toEqual(['hello bob']);

    await sendContactMessage(relay, bob!.contact, 'hello alice');
    const forAlice = await receiveContactMessages(relay, aliceContact!);
    expect(forAlice.map((message) => message.body)).toEqual(['hello alice']);
  });

  it('lets the app persist inbox packets before acknowledging them', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost');
    const bob = await acceptInvitation(relay, alice!.invite);
    expect(bob).not.toBeNull();
    await receiveInboxMessages(relay, alice!.inbox);

    await sendContactMessage(relay, bob!.contact, 'persist before ack');
    const firstRead = await receiveInboxPackets(relay, alice!.inbox);
    expect(firstRead.map((packet) => packet.body)).toEqual(['persist before ack']);
    expect(await receiveInboxPackets(relay, alice!.inbox)).toEqual(firstRead);

    expect(
      await ackInboxPackets(
        relay,
        alice!.inbox,
        firstRead.map((packet) => packet.packetId),
      ),
    ).toBe(true);
    expect(await receiveInboxPackets(relay, alice!.inbox)).toEqual([]);
  });

  it('carries a one-time invite token in invites and inboxes', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost');
    expect(alice?.inbox.inviteToken).toBeTruthy();
    expect(alice?.invite.inviteToken).toBe(alice?.inbox.inviteToken);

    const decoded = decodeInvite(encodeInvite(alice!.invite));
    expect(decoded?.inviteToken).toBe(alice?.inbox.inviteToken);

    // Bob's own inbox gets its own independent token.
    const bob = await acceptInvitation(relay, alice!.invite);
    expect(bob?.contact.inbox.inviteToken).toBeTruthy();
    expect(bob?.contact.inbox.inviteToken).not.toBe(alice?.inbox.inviteToken);
  });

  it('does not accept an invitation from a blocked sender', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost');
    blockSender(queueSigningPublicKey(alice!.invite.signingKey));
    await expect(acceptInvitation(relay, alice!.invite)).resolves.toBeNull();
  });

  it('filters contact offers from blocked senders', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost');
    const bob = await acceptInvitation(relay, alice!.invite);
    expect(bob).not.toBeNull();

    const carol = await createInvitation(relay, 'http://localhost');
    // Carol is blocked: her offer sent into Bob's inbox must be dropped.
    await sendContactOffer(relay, bob!.contact.peerInvite, carol!.inbox);
    blockSender(queueSigningPublicKey(carol!.invite.signingKey));

    const offers = await receiveContactOffers(relay, bob!.contact.inbox);
    expect(offers).toHaveLength(0);
  });

  it('rejects expired invites', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost');
    const expired = { ...alice!.invite, expiresAt: Date.now() - 1 };
    expect(decodeInvite(encodeInvite(expired))).toBeNull();
    await expect(acceptInvitation(relay, expired)).resolves.toBeNull();
  });

  it('rejects non-HTTPS relay URLs outside localhost', async () => {
    const relay = new InMemoryAnonRelay();
    await expect(createInvitation(relay, 'http://relay.example')).resolves.toBeNull();
  });

  it('rejects a contact offer that points at the local queue', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost');
    expect(contactFromOffer(alice!.inbox, alice!.invite)).toBeNull();
  });

  it('requires first-contact proof of work and propagates the difficulty', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost', undefined, 8);
    expect(alice?.invite.pow?.difficulty).toBe(8);

    const bob = await acceptInvitation(relay, alice!.invite);
    expect(bob).not.toBeNull();
    expect(bob!.contact.inbox.pow?.difficulty).toBe(8);
    expect(bob!.offerSent).toBe(true);

    await sendContactMessage(relay, bob!.contact, 'hello alice');
    const messages = await receiveInboxMessages(relay, alice!.inbox);
    expect(messages.map((message) => message.body)).toContain('hello alice');
  });

  it('rejects an invalid proof-of-work difficulty', async () => {
    const relay = new InMemoryAnonRelay();
    await expect(createInvitation(relay, 'http://localhost', undefined, 0)).resolves.toBeNull();
    await expect(createInvitation(relay, 'http://localhost', undefined, 25)).resolves.toBeNull();
    await expect(createInvitation(relay, 'http://localhost', undefined, 1.5)).resolves.toBeNull();
  });

  it('rotates an inbox queue to the next relay after the rotation window', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'https://r1.example', undefined, 8);
    const inbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };
    inbox.createdAt = Date.now() - (8 * 24 * 60 * 60 * 1000);
    inbox.expiresAt = Date.now() + 60_000;

    const rotated = await rotateInbox(relay, inbox, Date.now());
    expect(rotated).not.toBeNull();
    expect(rotated!.relayUrl).toBe('https://r2.example');
    expect(rotated!.queueId).not.toBe(inbox.queueId);
    expect(rotated!.createdAt).toBeGreaterThanOrEqual(Date.now() - 1000);
    expect(rotated!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('does not rotate an inbox queue before the rotation window', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'https://r1.example', undefined, 8);
    const inbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };

    const rotated = await rotateInbox(relay, inbox, Date.now());
    expect(rotated).toBeNull();
  });

  it('does not rotate an inbox queue without a secondary relay', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'https://r1.example', undefined, 8);
    const inbox = {
      ...alice!.inbox,
      relays: [{ id: 'r1', url: 'https://r1.example' }],
    };

    const rotated = await rotateInbox(relay, inbox, Date.now());
    expect(rotated).toBeNull();
  });
});
