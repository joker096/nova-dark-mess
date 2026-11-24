import { encryptAESGCM, decryptAESGCM, EncryptedData } from '../crypto/aes';
import { deriveKeyFromPassphrase } from './kdf';

const DB_NAME = 'NovaDarkMessengerDB';
const DB_VERSION = 2;
const STORE_MESSAGES = 'encrypted_messages';
const STORE_SESSIONS = 'ratchet_sessions';
const STORE_PREKEYS = 'prekey_store';
const STORE_SETTINGS = 'security_settings';

function zip<T, U>(a: T[], b: U[]): Array<[T, U]> {
  const len = Math.min(a.length, b.length);
  const out: Array<[T, U]> = new Array(len);
  for (let i = 0; i < len; i++) out[i] = [a[i], b[i]];
  return out;
}

export interface StoredEncryptedMessage {
  id: string;
  chatId: string;
  encryptedData: EncryptedData;
  timestamp: number;
  expiresAt?: number;
}

interface StoredEncryptedRecord {
  key: string;
  id?: string; // Set when the store uses a different keyPath (e.g. STORE_MESSAGES uses 'id')
  encryptedData: EncryptedData;
  updatedAt: number;
}

export interface DatabaseSnapshot {
  messages: Array<{
    id: string;
    chatId: string;
    timestamp: number;
    payload: string;
    expiresAt?: number;
  }>;
  sessions: Array<{ key: string; value: unknown }>;
  prekeys: Array<{ key: string; value: unknown }>;
  settings: Array<{ key: string; value: unknown }>;
}

export class EncryptedDatabase {
  private db: IDBDatabase | null = null;
  private masterKey: CryptoKey | null = null;

  public isReady(): boolean {
    return this.db !== null && this.masterKey !== null;
  }

  public close(): void {
    this.db?.close();
    this.db = null;
    this.masterKey = null;
  }

  public async initialize(passphrase: string, salt?: Uint8Array): Promise<void> {
    const saltValue = salt ?? crypto.getRandomValues(new Uint8Array(16));
    const masterKey = await deriveKeyFromPassphrase(passphrase, saltValue);
    return this.initializeWithKey(masterKey);
  }

  public async initializeWithKey(masterKey: CryptoKey): Promise<void> {
    this.masterKey = masterKey;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          store.createIndex('chatId', 'chatId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_PREKEYS)) {
          db.createObjectStore(STORE_PREKEYS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        // Phase 9 1.5: purge expired encrypted records on startup so they can
        // never be read even if no chat screen is ever opened.
        void this.purgeExpiredMessages();
        resolve();
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  private putEncryptedRecord(storeName: string, key: string, plaintext: string): Promise<void> {
    if (!this.db || !this.masterKey) return Promise.reject(new Error('DB not initialized'));

    return encryptAESGCM(plaintext, this.masterKey).then(
      (encryptedData) =>
        new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(storeName, 'readwrite');
          const record: StoredEncryptedRecord = { key, encryptedData, updatedAt: Date.now() };
          const req = tx.objectStore(storeName).put(record);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        })
    );
  }

  /**
   * Writes multiple encrypted records in a single IndexedDB transaction.
   * Reduces transaction overhead compared to calling `putEncryptedRecord`
   * repeatedly.
   */
  public batchPutEncryptedRecords(
    storeName: string,
    entries: Array<{ key: string; plaintext: string }>,
  ): Promise<void> {
    if (!this.db || !this.masterKey) return Promise.reject(new Error('DB not initialized'));
    if (entries.length === 0) return Promise.resolve();

    return Promise.all(entries.map((e) => encryptAESGCM(e.plaintext, this.masterKey))).then(
      (encryptedDataList) =>
        new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const [entry, encryptedData] of zip(entries, encryptedDataList)) {
            const record: StoredEncryptedRecord = {
              key: entry.key,
              id: entry.key,
              encryptedData,
              updatedAt: Date.now(),
            };
            store.put(record);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('Batch write transaction aborted'));
        })
    );
  }

  private getEncryptedRecord(storeName: string, key: string): Promise<string | null> {
    if (!this.db || !this.masterKey) return Promise.reject(new Error('DB not initialized'));

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = async () => {
        const record = req.result as StoredEncryptedRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        try {
          resolve(await decryptAESGCM(record.encryptedData, this.masterKey!));
        } catch (err) {
          reject(err);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Reads multiple encrypted records in a single IndexedDB transaction.
   * Returns a map keyed by record key; missing keys are absent from the map.
   */
  public batchGetEncryptedRecords(
    storeName: string,
    keys: string[],
  ): Promise<Map<string, string>> {
    if (!this.db || !this.masterKey) return Promise.reject(new Error('DB not initialized'));
    if (keys.length === 0) return Promise.resolve(new Map());

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const results = new Map<string, string>();
      let settled = false;

      function finish(error?: Error): void {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(results);
      }

      let pending = keys.length;
      for (const key of keys) {
        const req = store.get(key);
        req.onsuccess = async () => {
          if (settled) return;
          const record = req.result as StoredEncryptedRecord | undefined;
          if (record) {
            try {
              results.set(key, await decryptAESGCM(record.encryptedData, this.masterKey!));
            } catch (err) {
              finish(err instanceof Error ? err : new Error(String(err)));
              return;
            }
          }
          pending -= 1;
          if (pending === 0) finish();
        };
        req.onerror = () => finish(req.error);
      }
    });
  }

  private deleteRecord(storeName: string, key: string): Promise<void> {
    if (!this.db) return Promise.reject(new Error('DB not initialized'));
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Database delete transaction aborted'));
    });
  }

  public async saveEncryptedMessage(
    chatId: string,
    messageId: string,
    payloadJson: string,
    expiresAt?: number,
  ): Promise<void> {
    if (!this.db || !this.masterKey) throw new Error('DB not initialized');
    if (expiresAt !== undefined && !Number.isFinite(expiresAt)) {
      throw new Error('Message expiration must be a finite timestamp.');
    }
    const encryptedData = await encryptAESGCM(payloadJson, this.masterKey);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_MESSAGES, 'readwrite');
      const record: StoredEncryptedMessage = {
        id: messageId,
        chatId,
        encryptedData,
        timestamp: Date.now(),
        expiresAt,
      };
      const req = tx.objectStore(STORE_MESSAGES).put(record);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Message write transaction aborted'));
    });
  }

  public async saveEncryptedMessageWithSession(
    chatId: string,
    messageId: string,
    payloadJson: string,
    session: unknown,
    expiresAt?: number,
  ): Promise<void> {
    if (!this.db || !this.masterKey) throw new Error('DB not initialized');
    if (expiresAt !== undefined && !Number.isFinite(expiresAt)) {
      throw new Error('Message expiration must be a finite timestamp.');
    }

    const updatedAt = Date.now();
    const [encryptedData, encryptedSessionData] = await Promise.all([
      encryptAESGCM(payloadJson, this.masterKey),
      encryptAESGCM(JSON.stringify(session), this.masterKey),
    ]);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_MESSAGES, STORE_SESSIONS], 'readwrite');
      tx.objectStore(STORE_MESSAGES).put({
        id: messageId,
        chatId,
        encryptedData,
        timestamp: updatedAt,
        expiresAt,
      } satisfies StoredEncryptedMessage);
      tx.objectStore(STORE_SESSIONS).put({
        key: chatId,
        encryptedData: encryptedSessionData,
        updatedAt,
      } satisfies StoredEncryptedRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Encrypted message transaction aborted'));
    });
  }

  public async getEncryptedMessages(chatId: string, now = Date.now()): Promise<string[]> {
    if (!this.db || !this.masterKey) throw new Error('DB not initialized');
    await this.purgeExpiredMessages(now);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_MESSAGES, 'readonly');
      const index = tx.objectStore(STORE_MESSAGES).index('chatId');
      const req = index.getAll(IDBKeyRange.only(chatId));

      req.onsuccess = async () => {
        const records = req.result as StoredEncryptedMessage[];
        try {
          const decryptedList: string[] = [];
          for (const rec of records.sort((a, b) => a.timestamp - b.timestamp)) {
            decryptedList.push(await decryptAESGCM(rec.encryptedData, this.masterKey!));
          }
          resolve(decryptedList);
        } catch (err) {
          reject(err);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  public deleteEncryptedMessage(messageId: string): Promise<void> {
    return this.deleteRecord(STORE_MESSAGES, messageId);
  }

  public async purgeExpiredMessages(now = Date.now()): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_MESSAGES, 'readwrite');
      const request = tx.objectStore(STORE_MESSAGES).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as StoredEncryptedMessage;
        if (record.expiresAt !== undefined && record.expiresAt <= now) {
          cursor.delete();
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Expired-message purge transaction aborted'));
    });
  }

  public saveSession(chatId: string, session: unknown): Promise<void> {
    return this.putEncryptedRecord(STORE_SESSIONS, chatId, JSON.stringify(session));
  }

  public async loadSession<T>(chatId: string): Promise<T | null> {
    const value = await this.getEncryptedRecord(STORE_SESSIONS, chatId);
    return value ? (JSON.parse(value) as T) : null;
  }

  public deleteSession(chatId: string): Promise<void> {
    return this.deleteRecord(STORE_SESSIONS, chatId);
  }

  public savePreKeyStore(owner: string, store: unknown): Promise<void> {
    return this.putEncryptedRecord(STORE_PREKEYS, owner, JSON.stringify(store));
  }

  public async loadPreKeyStore<T>(owner: string): Promise<T | null> {
    const value = await this.getEncryptedRecord(STORE_PREKEYS, owner);
    return value ? (JSON.parse(value) as T) : null;
  }

  public saveSetting(key: string, value: unknown): Promise<void> {
    return this.putEncryptedRecord(STORE_SETTINGS, key, JSON.stringify(value));
  }

  public async loadSetting<T>(key: string): Promise<T | null> {
    const value = await this.getEncryptedRecord(STORE_SETTINGS, key);
    return value ? (JSON.parse(value) as T) : null;
  }

  public async deleteSetting(key: string): Promise<void> {
    return this.deleteRecord(STORE_SETTINGS, key);
  }

  private getAllRecords(storeName: string): Promise<StoredEncryptedRecord[]> {
    if (!this.db) return Promise.reject(new Error('DB not initialized'));
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result as StoredEncryptedRecord[]);
      req.onerror = () => reject(req.error);
    });
  }

  public async exportSnapshot(): Promise<DatabaseSnapshot> {
    if (!this.db || !this.masterKey) throw new Error('DB not initialized');
    await this.purgeExpiredMessages();

    const messages = await new Promise<DatabaseSnapshot['messages']>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_MESSAGES, 'readonly');
      const req = tx.objectStore(STORE_MESSAGES).getAll();
      req.onsuccess = async () => {
        try {
          const records = req.result as StoredEncryptedMessage[];
          const output: DatabaseSnapshot['messages'] = [];
          for (const record of records) {
            output.push({
              id: record.id,
              chatId: record.chatId,
              timestamp: record.timestamp,
              payload: await decryptAESGCM(record.encryptedData, this.masterKey!),
              expiresAt: record.expiresAt,
            });
          }
          resolve(output);
        } catch (err) {
          reject(err);
        }
      };
      req.onerror = () => reject(req.error);
    });

    const decryptRecords = async (
      storeName: string
    ): Promise<Array<{ key: string; value: unknown }>> => {
      const records = await this.getAllRecords(storeName);
      const output: Array<{ key: string; value: unknown }> = [];
      for (const record of records) {
        const plaintext = await decryptAESGCM(record.encryptedData, this.masterKey!);
        output.push({ key: record.key, value: JSON.parse(plaintext) });
      }
      return output;
    };

    return {
      messages,
      sessions: await decryptRecords(STORE_SESSIONS),
      prekeys: await decryptRecords(STORE_PREKEYS),
      settings: await decryptRecords(STORE_SETTINGS),
    };
  }

  public async importSnapshot(snapshot: DatabaseSnapshot): Promise<void> {
    if (!this.db || !this.masterKey) throw new Error('DB not initialized');

    await this.clearAll();

    for (const message of snapshot.messages) {
      await this.saveEncryptedMessage(
        message.chatId,
        message.id,
        message.payload,
        message.expiresAt,
      );
    }
    for (const session of snapshot.sessions) {
      await this.saveSession(session.key, session.value);
    }
    for (const prekey of snapshot.prekeys) {
      await this.savePreKeyStore(prekey.key, prekey.value);
    }
    for (const setting of snapshot.settings) {
      await this.saveSetting(setting.key, setting.value);
    }
    await this.purgeExpiredMessages();
  }

  private async clearStores(storeNames: string[]): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeNames, 'readwrite');
      storeNames.forEach((store) => tx.objectStore(store).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public clearSessions(): Promise<void> {
    return this.clearStores([STORE_SESSIONS]);
  }

  public clearPreKeys(): Promise<void> {
    return this.clearStores([STORE_PREKEYS]);
  }

  public async clearAll(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const stores = [STORE_MESSAGES, STORE_SESSIONS, STORE_PREKEYS, STORE_SETTINGS];
      const tx = this.db!.transaction(stores, 'readwrite');
      stores.forEach((store) => tx.objectStore(store).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const dbInstance = new EncryptedDatabase();
