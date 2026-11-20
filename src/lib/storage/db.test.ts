/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';

// Install fake IndexedDB before importing the module that uses it.
(globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB =
  fakeIndexedDB as unknown as IDBFactory;

// fake-indexeddb does not ship IDBKeyRange; install a minimal shim so
// EncryptedDatabase.getEncryptedMessages can use index.getAll(IDBKeyRange.only(...)).
(globalThis as unknown as { IDBKeyRange?: unknown }).IDBKeyRange = {
  only: (value: unknown) => ({ type: 'exact', value }),
  lowerBound: (_lower: unknown, _open?: boolean) =>
    ({ type: 'bound' }),
  upperBound: (_upper: unknown, _open?: boolean) =>
    ({ type: 'bound' }),
  bound: (_lower: unknown, _upper: unknown, _lo?: boolean, _uo?: boolean) =>
    ({ type: 'bound' }),
};

import { EncryptedDatabase } from './db';

const TEST_PASSPHRASE = 'test-passphrase-123';

const DB_NAME = 'NovaDarkMessengerDB';

async function deriveTestKey(): Promise<CryptoKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(TEST_PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveKey'],
  ).then((key) =>
    crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ),
  );
}

let currentDb: EncryptedDatabase | null = null;

async function openDb(): Promise<EncryptedDatabase> {
  const db = new EncryptedDatabase();
  const masterKey = await deriveTestKey();
  await db.initializeWithKey(masterKey);
  currentDb = db;
  return db;
}

describe('EncryptedDatabase', () => {
  afterEach(async () => {
    // Close the database connection and delete the database between tests
    // to avoid cross-test contamination (each test uses a different master key).
    if (currentDb) {
      currentDb.close();
      currentDb = null;
    }
    const idb = (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB;
    if (idb) {
      await new Promise<void>((resolve) => {
        const req = idb.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
        setTimeout(() => resolve(), 1000);
      });
    }
  });
  it('initializes and round-trips a message', async () => {
    const db = await openDb();
    await db.saveEncryptedMessage('chat-1', 'msg-1', JSON.stringify({ text: 'hello' }));
    const messages = await db.getEncryptedMessages('chat-1');
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({ text: 'hello' });
  });

  it('batch writes and reads multiple records in one transaction', async () => {
    const db = await openDb();
    await db.batchPutEncryptedRecords('encrypted_messages', [
      { key: 'k1', plaintext: 'value-1' },
      { key: 'k2', plaintext: 'value-2' },
      { key: 'k3', plaintext: 'value-3' },
    ]);

    const results = await db.batchGetEncryptedRecords('encrypted_messages', ['k1', 'k2', 'k3']);
    expect(results.get('k1')).toBe('value-1');
    expect(results.get('k2')).toBe('value-2');
    expect(results.get('k3')).toBe('value-3');
  });

  it('returns empty map for missing batch keys', async () => {
    const db = await openDb();
    await db.batchPutEncryptedRecords('encrypted_messages', [
      { key: 'k1', plaintext: 'value-1' },
    ]);

    const results = await db.batchGetEncryptedRecords('encrypted_messages', ['k1', 'k2']);
    expect(results.get('k1')).toBe('value-1');
    expect(results.has('k2')).toBe(false);
  });

  it('saves message and session in a single transaction', async () => {
    const db = await openDb();
    await db.saveEncryptedMessageWithSession(
      'chat-1',
      'msg-1',
      JSON.stringify({ text: 'hello' }),
      { ratchet: 'state' },
    );

    const messages = await db.getEncryptedMessages('chat-1');
    expect(messages).toHaveLength(1);

    const session = await db.loadSession('chat-1');
    expect(session).toEqual({ ratchet: 'state' });
  });

  it('deletes a message', async () => {
    const db = await openDb();
    await db.saveEncryptedMessage('chat-1', 'msg-1', JSON.stringify({ text: 'hello' }));
    expect((await db.getEncryptedMessages('chat-1'))).toHaveLength(1);

    await db.deleteEncryptedMessage('msg-1');
    expect((await db.getEncryptedMessages('chat-1'))).toHaveLength(0);
  });

  it('purges expired messages on read', async () => {
    const db = await openDb();
    const now = Date.now();
    await db.saveEncryptedMessage(
      'chat-1',
      'msg-expired',
      JSON.stringify({ text: 'old' }),
      now - 1000,
    );
    await db.saveEncryptedMessage(
      'chat-1',
      'msg-valid',
      JSON.stringify({ text: 'new' }),
      now + 10000,
    );

    const messages = await db.getEncryptedMessages('chat-1', now);
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({ text: 'new' });
  });

  it('exports a snapshot with all records', async () => {
    const db = await openDb();
    await db.saveEncryptedMessage('chat-1', 'msg-1', JSON.stringify({ text: 'a' }));
    await db.saveSetting('theme', 'dark');
    await db.savePreKeyStore('user-1', { keys: [] });

    const snapshot = await db.exportSnapshot();
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.settings).toHaveLength(1);
    expect(snapshot.prekeys).toHaveLength(1);
    expect(snapshot.settings[0].key).toBe('theme');
  });

  it('loads and saves sessions and prekeys', async () => {
    const db = await openDb();
    await db.saveSession('chat-1', { sessionKey: 'abc' });
    const session = await db.loadSession<{ sessionKey: string }>('chat-1');
    expect(session).toEqual({ sessionKey: 'abc' });

    await db.savePreKeyStore('user-1', { publicKey: 'pk' });
    const prekeys = await db.loadPreKeyStore<{ publicKey: string }>('user-1');
    expect(prekeys).toEqual({ publicKey: 'pk' });
  });

  it('isReady returns false before initialization', () => {
    const db = new EncryptedDatabase();
    expect(db.isReady()).toBe(false);
  });
});
