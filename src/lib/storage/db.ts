import { encryptAESGCM, decryptAESGCM, EncryptedData } from '../crypto/aes';
import { deriveKeyFromPassphrase } from './kdf';

const DB_NAME = 'NovaDarkMessengerDB';
const DB_VERSION = 2;
const STORE_MESSAGES = 'encrypted_messages';
const STORE_SESSIONS = 'ratchet_sessions';
const STORE_PREKEYS = 'prekey_store';
const STORE_SETTINGS = 'security_settings';

export interface StoredEncryptedMessage {
  id: string;
  chatId: string;
  encryptedData: EncryptedData;
  timestamp: number;
}

interface StoredEncryptedRecord {
  key: string;
  encryptedData: EncryptedData;
  updatedAt: number;
}

export interface DatabaseSnapshot {
  messages: Array<{ id: string; chatId: string; timestamp: number; payload: string }>;
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

  private deleteRecord(storeName: string, key: string): Promise<void> {
    if (!this.db) return Promise.reject(new Error('DB not initialized'));
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async saveEncryptedMessage(chatId: string, messageId: string, payloadJson: string): Promise<void> {
    if (!this.db || !this.masterKey) throw new Error('DB not initialized');
    const encryptedData = await encryptAESGCM(payloadJson, this.masterKey);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_MESSAGES, 'readwrite');
      const record: StoredEncryptedMessage = {
        id: messageId,
        chatId,
        encryptedData,
        timestamp: Date.now(),
      };
      const req = tx.objectStore(STORE_MESSAGES).put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getEncryptedMessages(chatId: string): Promise<string[]> {
    if (!this.db || !this.masterKey) throw new Error('DB not initialized');

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
      await this.saveEncryptedMessage(message.chatId, message.id, message.payload);
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
