/**
 * IndexedDB storage implementation for BotGateway.
 * Provides per-bot isolation by scoping all keys to the bot's fingerprint.
 */
export interface IndexedDBStorageOptions {
  /** Database name (default: 'nova-bot-gateway') */
  dbName?: string;
  /** Database version (default: 1) */
  version?: number;
}

const DEFAULT_DB_NAME = 'nova-bot-gateway';
const DEFAULT_VERSION = 1;
const PREKEY_STORE_NAME = 'prekeyStore';
const SESSION_STORE_NAME = 'sessionStore';

/**
 * Creates an IndexedDB-based storage adapter for P2PManager.
 * All data is scoped by bot fingerprint for isolation.
 * Returns undefined if IndexedDB is not available (e.g., Node.js test environment).
 */
export function createIndexedDBStorage(
  botFingerprint: string,
  options: IndexedDBStorageOptions = {}
): P2PStorage | undefined {
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }
  const dbName = options.dbName ?? DEFAULT_DB_NAME;
  const version = options.version ?? DEFAULT_VERSION;
  const dbPromise = openDB(dbName, version);

  async function openDB(name: string, ver: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, ver);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(PREKEY_STORE_NAME)) {
          db.createObjectStore(PREKEY_STORE_NAME);
        }
        if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
          db.createObjectStore(SESSION_STORE_NAME);
        }
      };
    });
  }

  function makeKey(store: string, key: string): string {
    return `${botFingerprint}:${store}:${key}`;
  }

  return {
    async loadPreKeyStore<T>(owner: string): Promise<T | null> {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PREKEY_STORE_NAME, 'readonly');
        const store = tx.objectStore(PREKEY_STORE_NAME);
        const request = store.get(makeKey(PREKEY_STORE_NAME, owner));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve((request.result as T) ?? null);
      });
    },

    async savePreKeyStore(owner: string, store: unknown): Promise<void> {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PREKEY_STORE_NAME, 'readwrite');
        const storeObj = tx.objectStore(PREKEY_STORE_NAME);
        const request = storeObj.put(store, makeKey(PREKEY_STORE_NAME, owner));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async loadSession<T>(chatId: string): Promise<T | null> {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SESSION_STORE_NAME, 'readonly');
        const store = tx.objectStore(SESSION_STORE_NAME);
        const request = store.get(makeKey(SESSION_STORE_NAME, chatId));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve((request.result as T) ?? null);
      });
    },

    async saveSession(chatId: string, session: unknown): Promise<void> {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SESSION_STORE_NAME);
        const request = store.put(session, makeKey(SESSION_STORE_NAME, chatId));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },
  };
}

/**
 * Clears all data for a specific bot fingerprint.
 * Useful for bot uninstall/reset.
 */
export async function clearBotData(
  botFingerprint: string,
  options: IndexedDBStorageOptions = {}
): Promise<void> {
  const dbName = options.dbName ?? DEFAULT_DB_NAME;
  const version = options.version ?? DEFAULT_VERSION;

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  return new Promise((resolve, reject) => {
    const tx = db.transaction([PREKEY_STORE_NAME, SESSION_STORE_NAME], 'readwrite');
    let completed = 0;
    const total = 2;

    function checkDone() {
      completed++;
      if (completed === total) resolve();
    }

    // Clear prekey store entries for this bot
    const prekeyStore = tx.objectStore(PREKEY_STORE_NAME);
    const prekeyIndex = prekeyStore.index ? prekeyStore.index('by-bot') : null;
    if (prekeyIndex) {
      const range = IDBKeyRange.bound(
        `${botFingerprint}:${PREKEY_STORE_NAME}:`,
        `${botFingerprint}:${PREKEY_STORE_NAME}:\uffff`
      );
      prekeyIndex.openCursor(range).onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          checkDone();
        }
      };
    } else {
      // Fallback: clear all (less precise)
      prekeyStore.clear().onsuccess = checkDone;
    }

    // Clear session store entries for this bot
    const sessionStore = tx.objectStore(SESSION_STORE_NAME);
    const sessionIndex = sessionStore.index ? sessionStore.index('by-bot') : null;
    if (sessionIndex) {
      const range = IDBKeyRange.bound(
        `${botFingerprint}:${SESSION_STORE_NAME}:`,
        `${botFingerprint}:${SESSION_STORE_NAME}:\uffff`
      );
      sessionIndex.openCursor(range).onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          checkDone();
        }
      };
    } else {
      sessionStore.clear().onsuccess = checkDone;
    }

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Type guard for P2PStorage interface (compatibility with P2PManager)
 */
export interface P2PStorage {
  loadPreKeyStore<T>(owner: string): Promise<T | null>;
  savePreKeyStore(owner: string, store: unknown): Promise<void>;
  loadSession<T>(chatId: string): Promise<T | null>;
  saveSession(chatId: string, session: unknown): Promise<void>;
}