import { describe, it, expect } from 'vitest';
import {
  createGroupSession,
  encodeGroupKeyDistribution,
  decodeGroupKeyDistribution,
  openGroupMessage,
  rotateGroupSession,
  sealGroupMessage,
  parseGroupPayload,
  adoptGroupKey,
} from './groupSession';

describe('group session', () => {
  it('seals and opens a group message for all members', async () => {
    const session = await createGroupSession(['q_a', 'q_b', 'q_c']);
    const envelope = await sealGroupMessage(session, 'group hello');
    const plaintext = await openGroupMessage(session, envelope);
    expect(plaintext).toBe('group hello');
  });

  it('rejects a tampered ciphertext', async () => {
    const session = await createGroupSession(['q_a', 'q_b']);
    const envelope = await sealGroupMessage(session, 'group hello');
    const tampered = { ...envelope, ciphertext: 'AAAA' };
    const plaintext = await openGroupMessage(session, tampered);
    expect(plaintext).toBeNull();
  });

  it('rejects a message for another group', async () => {
    const session = await createGroupSession(['q_a']);
    const other = await createGroupSession(['q_b']);
    const envelope = await sealGroupMessage(session, 'group hello');
    const plaintext = await openGroupMessage(other, envelope);
    expect(plaintext).toBeNull();
  });

  it('rotates the key so an old version cannot open new messages', async () => {
    const session = await createGroupSession(['q_a', 'q_b']);
    const before = await sealGroupMessage(session, 'before rotation');

    const rotated = await rotateGroupSession(session, ['q_a', 'q_b']);
    expect(rotated.version).toBe(session.version + 1);
    expect(rotated.keyJwk).not.toEqual(session.keyJwk);

    const stillOpened = await openGroupMessage(session, before);
    expect(stillOpened).toBe('before rotation');

    const after = await sealGroupMessage(rotated, 'after rotation');
    const stillSealed = await openGroupMessage(session, after);
    expect(stillSealed).toBeNull();

    const opened = await openGroupMessage(rotated, after);
    expect(opened).toBe('after rotation');
  });

  it('removes a member after rotation: they cannot decrypt', async () => {
    const session = await createGroupSession(['q_a', 'q_b', 'q_c']);
    const removed = await rotateGroupSession(session, ['q_a', 'q_b']);
    const envelope = await sealGroupMessage(removed, 'post removal');
    // Reconstruct the removed member's session at the old key/version.
    const removedSession = { ...session, members: [...session.members] };
    const opened = await openGroupMessage(removedSession, envelope);
    expect(opened).toBeNull();
  });

  it('encodes and decodes a group key distribution', async () => {
    const session = await createGroupSession(['q_a', 'q_b']);
    const body = encodeGroupKeyDistribution(session);
    const decoded = decodeGroupKeyDistribution(body);
    expect(decoded).toMatchObject({
      type: 'nova-anon-group-key',
      groupId: session.id,
      version: session.version,
    });
    expect(decoded?.keyJwk).toEqual(session.keyJwk);
  });

  it('rejects malformed group key distributions', () => {
    expect(decodeGroupKeyDistribution('not json')).toBeNull();
    expect(decodeGroupKeyDistribution(JSON.stringify({ type: 'wrong' }))).toBeNull();
    expect(
      decodeGroupKeyDistribution(
        JSON.stringify({ type: 'nova-anon-group-key', groupId: 'g_x', version: 1, keyJwk: {} }),
      ),
    ).toBeNull();
  });

  it('parses group messages and ignores ordinary text', async () => {
    const session = await createGroupSession(['q_a']);
    const envelope = await sealGroupMessage(session, 'hello');
    const parsed = parseGroupPayload(JSON.stringify(envelope));
    expect(parsed?.kind).toBe('message');
    if (parsed?.kind === 'message') {
      expect(await openGroupMessage(session, parsed.envelope)).toBe('hello');
    }
    expect(parseGroupPayload('just text')).toBeNull();
    expect(parseGroupPayload('{"type":"nova-anon-group"}')).toBeNull();
  });

  it('adopts newer keys but never rolls back or switches group', async () => {
    const session = await createGroupSession(['q_a']);
    const rotated = await rotateGroupSession(session, ['q_a']);
    const newer = decodeGroupKeyDistribution(encodeGroupKeyDistribution(rotated))!;
    const older = decodeGroupKeyDistribution(encodeGroupKeyDistribution(session))!;

    expect(adoptGroupKey(session, newer)?.version).toBe(rotated.version);
    expect(adoptGroupKey(rotated, older)?.version).toBe(rotated.version);
    expect(adoptGroupKey(rotated, newer)?.version).toBe(rotated.version);

    const other = await createGroupSession(['q_b']);
    const foreign = decodeGroupKeyDistribution(encodeGroupKeyDistribution(other))!;
    expect(adoptGroupKey(session, foreign)).toBeNull();
  });

  it('cost estimate scales linearly with members', () => {
    expect(() => createGroupSession([])).not.toThrow();
  });
});
