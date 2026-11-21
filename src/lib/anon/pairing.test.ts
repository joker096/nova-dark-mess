import { describe, it, expect, vi } from 'vitest';
import { InMemoryAnonRelay } from './relay';
import { blockSender } from './blocks';
import { queueSigningPublicKey } from './signing';
import {
  acceptInvitation,
  ackInboxPackets,
  contactFromOffer,
  contactIdentity,
  isBlockedContact,
  createInvitation,
  receiveInboxPackets,
  receiveContactMessages,
  receiveContactOffers,
  failoverInbox,
  inviteFromInbox,
  migrateInbox,
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

  it('creates a standby queue and sends through it when the primary relay fails', async () => {
    const primary = new InMemoryAnonRelay();
    const backup = new InMemoryAnonRelay();
    const backupTarget = { transport: backup, relayUrl: 'http://127.0.0.1:9002' };

    const alice = await createInvitation(
      primary,
      'http://localhost',
      undefined,
      undefined,
      undefined,
      backupTarget,
    );
    expect(alice).not.toBeNull();
    expect(alice!.inbox.standby).toBeTruthy();
    expect(alice!.inbox.standby!.queueId).not.toBe(alice!.inbox.queueId);
    expect(alice!.invite.standby?.relayUrl).toBe('http://127.0.0.1:9002');

    const invite = decodeInvite(encodeInvite(alice!.invite));
    expect(invite?.standby?.queueId).toBe(alice!.inbox.standby!.queueId);

    const bob = await acceptInvitation(
      primary,
      invite!,
      undefined,
      backupTarget,
      backup,
    );
    expect(bob).not.toBeNull();
    expect(bob!.contact.inbox.standby?.relayUrl).toBe('http://127.0.0.1:9002');

    const offers = await receiveContactOffers(primary, alice!.inbox);
    const aliceContact = contactFromOffer(alice!.inbox, offers[0]!);
    expect(aliceContact).not.toBeNull();

    // Simulate the primary relay being unreachable while the standby is fine.
    vi.spyOn(primary, 'enqueue').mockResolvedValue(null);
    const sent = await sendContactMessage(primary, aliceContact!, 'fallback hello', {
      standbyTransport: backup,
    });
    expect(sent).toBeTruthy();

    expect(await receiveInboxMessages(primary, bob!.contact.inbox)).toHaveLength(0);
    const fallback = await receiveInboxMessages(backup, bob!.contact.inbox.standby!);
    expect(fallback.map((message) => message.body)).toEqual(['fallback hello']);
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

  it('creates the rotated queue on the next relay, not the current one', async () => {
    const r1 = new InMemoryAnonRelay();
    const r2 = new InMemoryAnonRelay();
    const alice = await createInvitation(r1, 'https://r1.example', undefined, 8);
    const inbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };
    inbox.createdAt = Date.now() - (8 * 24 * 60 * 60 * 1000);
    inbox.expiresAt = Date.now() + 60_000;

    const rotated = await rotateInbox(
      (relayUrl) => (relayUrl === 'https://r2.example' ? r2 : r1),
      inbox,
      Date.now(),
    );
    expect(rotated).not.toBeNull();
    expect(rotated!.relayUrl).toBe('https://r2.example');
    expect(rotated!.queueId).not.toBe(inbox.queueId);
    expect(rotated!.createdAt).toBeGreaterThanOrEqual(Date.now() - 1000);
    expect(rotated!.expiresAt).toBeGreaterThan(Date.now());
    // The new queue has to live on r2: polling it there works, r1 never saw it.
    expect(() =>
      r2.poll(rotated!.queueId, rotated!.recipientToken, 32, rotated!.signingKey),
    ).not.toThrow();
    expect(() =>
      r1.poll(rotated!.queueId, rotated!.recipientToken, 32, rotated!.signingKey),
    ).toThrow();
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

    const rotated = await rotateInbox(() => relay, inbox, Date.now());
    expect(rotated).toBeNull();
  });

  it('does not rotate an inbox queue without a secondary relay', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'https://r1.example', undefined, 8);
    const inbox = {
      ...alice!.inbox,
      relays: [{ id: 'r1', url: 'https://r1.example' }],
    };

    const rotated = await rotateInbox(() => relay, inbox, Date.now());
    expect(rotated).toBeNull();
  });

  it('moves a contact to the new relay via a migration offer', async () => {
    const r1 = new InMemoryAnonRelay();
    const r2 = new InMemoryAnonRelay();
    const transportFor = (relayUrl: string) => (relayUrl === 'https://r2.example' ? r2 : r1);

    const alice = await createInvitation(r1, 'https://r1.example', undefined, 8);
    const aliceInbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };
    const bob = await acceptInvitation(r1, alice!.invite);
    expect(bob).not.toBeNull();

    // Alice learns Bob's inbox from the offer he posted on her queue.
    const [offer] = await receiveContactOffers(r1, aliceInbox);
    const aliceContact = contactFromOffer(aliceInbox, offer)!;
    expect(aliceContact).not.toBeNull();

    aliceInbox.createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    aliceInbox.expiresAt = Date.now() + 60_000;
    const migration = await migrateInbox(transportFor, aliceInbox, [aliceContact], Date.now());
    expect(migration).not.toBeNull();
    expect(migration!.notified).toBe(1);
    expect(migration!.failed).toBe(0);
    expect(migration!.inbox.relayUrl).toBe('https://r2.example');

    // Bob picks the new invite up from his own queue: it points at r2.
    const [moved] = await receiveContactOffers(r1, bob!.contact.inbox);
    expect(moved).not.toBeNull();
    expect(moved.queueId).toBe(migration!.inbox.queueId);
    expect(moved.relayUrl).toBe('https://r2.example');

    const bobUpdated = contactFromOffer(bob!.contact.inbox, moved)!;
    await sendContactMessage(r2, bobUpdated, 'still here');

    const movedContact = { ...aliceContact, inbox: migration!.inbox };
    const messages = await receiveContactMessages(r2, movedContact);
    expect(messages.map((message) => message.body)).toEqual(['still here']);
    // Nothing was left behind on the old relay for this queue.
    expect(() => r1.poll(migration!.inbox.queueId, migration!.inbox.recipientToken)).toThrow();
  });

  it('moves a live queue off a relay that failed before its rotation window', async () => {
    const r1 = new InMemoryAnonRelay();
    const r2 = new InMemoryAnonRelay();
    const transportFor = (relayUrl: string) => (relayUrl === 'https://r2.example' ? r2 : r1);

    const alice = await createInvitation(r1, 'https://r1.example', undefined, 8);
    const aliceInbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };
    const bob = await acceptInvitation(r1, alice!.invite);
    const [bobOffer] = await receiveContactOffers(r1, aliceInbox);
    const aliceContact = contactFromOffer(aliceInbox, bobOffer)!;

    // The queue is fresh, so a scheduled rotation would refuse to move it.
    expect(await rotateInbox(transportFor, aliceInbox, Date.now())).toBeNull();

    const migration = await failoverInbox(transportFor, aliceInbox, [aliceContact], Date.now());
    expect(migration).not.toBeNull();
    expect(migration!.notified).toBe(1);
    expect(migration!.inbox.relayUrl).toBe('https://r2.example');
    expect(migration!.inbox.queueId).not.toBe(aliceInbox.queueId);
    // Identity survives failover, so contacts and block lists still match.
    expect(contactIdentity(inviteFromInbox(migration!.inbox))).toBe(contactIdentity(alice!.invite));
    expect(migration!.inbox.signingKey).not.toBe(aliceInbox.signingKey);

    // Bob is told over his own queue and keeps writing to the new relay.
    const [moved] = await receiveContactOffers(r1, bob!.contact.inbox);
    expect(moved.relayUrl).toBe('https://r2.example');
    await sendContactMessage(r2, contactFromOffer(bob!.contact.inbox, moved)!, 'after failover');
    const messages = await receiveContactMessages(r2, {
      ...aliceContact,
      inbox: migration!.inbox,
    });
    expect(messages.map((message) => message.body)).toEqual(['after failover']);
  });

  it('keeps a blocked contact blocked after it moves to another relay', async () => {
    const r1 = new InMemoryAnonRelay();
    const r2 = new InMemoryAnonRelay();
    const alice = await createInvitation(r1, 'https://r1.example', undefined, 8);
    const bob = await acceptInvitation(r1, alice!.invite);
    expect(bob).not.toBeNull();

    const [bobOffer] = await receiveContactOffers(r1, alice!.inbox);
    const aliceContact = contactFromOffer(alice!.inbox, bobOffer)!;
    // Alice blocks Bob; the entry is keyed on his identity, not his queue key.
    const bobIdentity = contactIdentity(aliceContact.peerInvite);
    expect(blockSender(bobIdentity)).toBe(true);
    expect(isBlockedContact(bobOffer)).toBe(true);

    // Bob moves his inbox to r2 and announces the new invite.
    const bobInbox = {
      ...bob!.contact.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };
    bobInbox.createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const migration = await migrateInbox(
      (relayUrl) => (relayUrl === 'https://r2.example' ? r2 : r1),
      bobInbox,
      // Bob notifies Alice by writing into the queue he already has for her.
      [bob!.contact],
      Date.now(),
    );
    expect(migration).not.toBeNull();
    expect(migration!.notified).toBe(1);

    const [movedBob] = await receiveInboxMessages(r1, alice!.inbox).then((messages) =>
      messages.flatMap((message) => (message.offer ? [message.offer] : [])),
    );
    expect(movedBob.queueId).toBe(migration!.inbox.queueId);
    expect(queueSigningPublicKey(movedBob.signingKey)).not.toBe(queueSigningPublicKey(bobOffer.signingKey));
    // Different queue key, same identity: the block still applies and pairing stays refused.
    expect(contactIdentity(movedBob)).toBe(bobIdentity);
    expect(isBlockedContact(movedBob)).toBe(true);
    expect(await acceptInvitation(r1, movedBob)).toBeNull();
  });

  it('falls back to the queue key for invites without an identity key', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'http://localhost');
    const legacy = { ...alice!.invite } as Record<string, unknown>;
    delete legacy.identityKey;

    expect(contactIdentity(legacy as never)).toBe(
      queueSigningPublicKey(alice!.invite.signingKey),
    );
    expect(blockSender(contactIdentity(legacy as never))).toBe(true);
    expect(isBlockedContact(legacy as never)).toBe(true);
  });

  it('reports contacts it could not notify instead of hiding them', async () => {
    const r1 = new InMemoryAnonRelay();
    const r2 = new InMemoryAnonRelay();
    const alice = await createInvitation(r1, 'https://r1.example', undefined, 8);
    const inbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };
    inbox.createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;

    const migration = await migrateInbox(
      (relayUrl) => (relayUrl === 'https://r2.example' ? r2 : r1),
      inbox,
      [{ inbox, peerInvite: { v: 1 } as never, createdAt: Date.now() }],
      Date.now(),
    );
    expect(migration).not.toBeNull();
    expect(migration!.notified).toBe(0);
    expect(migration!.failed).toBe(1);
  });

  it('does not call a second entry with the same URL a rotation', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'https://r1.example', undefined, 8);
    const inbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r1-mirror', url: 'https://r1.example' },
      ],
    };
    inbox.createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;

    const rotated = await rotateInbox(() => relay, inbox, Date.now());
    expect(rotated).toBeNull();
  });
});
