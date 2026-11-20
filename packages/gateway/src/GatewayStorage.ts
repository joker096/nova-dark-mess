/**
 * GatewayStorage — Persistent storage for gateway prekey store, sessions, and group keys.
 * 
 * Implementations can use:
 * - File system (JSON/LevelDB)
 * - SQLite
 * - IndexedDB (in browser)
 * - OS keychain + file for sessions
 */

export interface PreKeyStoreState {
  signedPreKey: any; // SignedPreKey
  previousSignedPreKeys?: any[];
  oneTimePreKeys: any[]; // OneTimePreKey[]
  nextPreKeyId: number;
  pqKemPublicKey?: string;
  pqKemSecretKey?: string;
}

export interface SessionState {
  ratchetState: any; // Full RatchetState from crypto/ratchet
  theirFingerprint: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface SenderKeyState {
  chainKey: Uint8Array;
  messageIndex: number;
  members: Map<string, { chainKey: Uint8Array; index: number }>;
}

export interface GatewayStorage {
  loadPreKeyStore(): Promise<PreKeyStoreState | null>;
  savePreKeyStore(store: PreKeyStoreState): Promise<void>;
  loadSession(chatId: string): Promise<SessionState | null>;
  saveSession(chatId: string, session: SessionState): Promise<void>;
  loadGroupSenderKey(groupId: string): Promise<SenderKeyState | null>;
  saveGroupSenderKey(groupId: string, state: SenderKeyState): Promise<void>;
}

/** File-system based storage for Node.js environments. */
export class FileGatewayStorage implements GatewayStorage {
  private readonly basePath: string;
  private readonly fs: any;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.fs = require('fs/promises');
    this.ensureDirs();
  }

  private async ensureDirs(): Promise<void> {
    await this.fs.mkdir(this.basePath, { recursive: true });
    await this.fs.mkdir(`${this.basePath}/sessions`, { recursive: true });
    await this.fs.mkdir(`${this.basePath}/groups`, { recursive: true });
  }

  async loadPreKeyStore(): Promise<PreKeyStoreState | null> {
    try {
      const data = await this.fs.readFile(`${this.basePath}/prekeys.json`, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        signedPreKey: {
          ...parsed.signedPreKey,
          privateKey: new Uint8Array(Buffer.from(parsed.signedPreKey.privateKey, 'base64')),
          publicKey: new Uint8Array(Buffer.from(parsed.signedPreKey.publicKey, 'base64')),
        },
        previousSignedPreKeys: parsed.previousSignedPreKeys?.map((k: any) => ({
          ...k,
          privateKey: new Uint8Array(Buffer.from(k.privateKey, 'base64')),
          publicKey: new Uint8Array(Buffer.from(k.publicKey, 'base64')),
        })),
        oneTimePreKeys: parsed.oneTimePreKeys.map((k: any) => ({
          ...k,
          privateKey: new Uint8Array(Buffer.from(k.privateKey, 'base64')),
          publicKey: new Uint8Array(Buffer.from(k.publicKey, 'base64')),
        })),
        pqKemPublicKey: parsed.pqKemPublicKey,
        pqKemSecretKey: parsed.pqKemSecretKey,
      };
    } catch {
      return null;
    }
  }

  async savePreKeyStore(store: PreKeyStoreState): Promise<void> {
    const data = {
      ...store,
      signedPreKey: {
        ...store.signedPreKey,
        privateKey: Buffer.from(store.signedPreKey.privateKey).toString('base64'),
        publicKey: Buffer.from(store.signedPreKey.publicKey).toString('base64'),
      },
      previousSignedPreKeys: store.previousSignedPreKeys?.map((k: any) => ({
        ...k,
        privateKey: Buffer.from(k.privateKey).toString('base64'),
        publicKey: Buffer.from(k.publicKey).toString('base64'),
      })),
      oneTimePreKeys: store.oneTimePreKeys.map((k: any) => ({
        ...k,
        privateKey: Buffer.from(k.privateKey).toString('base64'),
        publicKey: Buffer.from(k.publicKey).toString('base64'),
      })),
    };
    await this.fs.writeFile(`${this.basePath}/prekeys.json`, JSON.stringify(data, null, 2));
  }

  async loadSession(chatId: string): Promise<SessionState | null> {
    try {
      const safeId = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const data = await this.fs.readFile(`${this.basePath}/sessions/${safeId}.json`, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        ratchetState: {
          ...parsed.ratchetState,
          rootKey: new Uint8Array(Buffer.from(parsed.ratchetState.rootKey, 'base64')),
          chainKey: new Uint8Array(Buffer.from(parsed.ratchetState.chainKey, 'base64')),
          theirRatchetKey: new Uint8Array(Buffer.from(parsed.ratchetState.theirRatchetKey, 'base64')),
          ourRatchetKey: parsed.ratchetState.ourRatchetKey ? {
            privateKey: new Uint8Array(Buffer.from(parsed.ratchetState.ourRatchetKey.privateKey, 'base64')),
            publicKey: new Uint8Array(Buffer.from(parsed.ratchetState.ourRatchetKey.publicKey, 'base64')),
          } : undefined,
          previousChainKeys: parsed.ratchetState.previousChainKeys?.map((k: any) => new Uint8Array(Buffer.from(k, 'base64'))),
        },
      };
    } catch {
      return null;
    }
  }

  async saveSession(chatId: string, session: SessionState): Promise<void> {
    const safeId = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const data = {
      ...session,
      ratchetState: {
        ...session.ratchetState,
        rootKey: Buffer.from(session.ratchetState.rootKey).toString('base64'),
        chainKey: Buffer.from(session.ratchetState.chainKey).toString('base64'),
        theirRatchetKey: Buffer.from(session.ratchetState.theirRatchetKey).toString('base64'),
        ourRatchetKey: session.ratchetState.ourRatchetKey ? {
          privateKey: Buffer.from(session.ratchetState.ourRatchetKey.privateKey).toString('base64'),
          publicKey: Buffer.from(session.ratchetState.ourRatchetKey.publicKey).toString('base64'),
        } : undefined,
        previousChainKeys: session.ratchetState.previousChainKeys?.map((k: Uint8Array) => Buffer.from(k).toString('base64')),
      },
    };
    await this.fs.writeFile(`${this.basePath}/sessions/${safeId}.json`, JSON.stringify(data, null, 2));
  }

  async loadGroupSenderKey(groupId: string): Promise<SenderKeyState | null> {
    try {
      const safeId = groupId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const data = await this.fs.readFile(`${this.basePath}/groups/${safeId}.json`, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        chainKey: new Uint8Array(Buffer.from(parsed.chainKey, 'base64')),
        messageIndex: parsed.messageIndex,
        members: new Map(Object.entries(parsed.members).map(([k, v]: [string, any]) => [
          k,
          { chainKey: new Uint8Array(Buffer.from(v.chainKey, 'base64')), index: v.index }
        ])),
      };
    } catch {
      return null;
    }
  }

  async saveGroupSenderKey(groupId: string, state: SenderKeyState): Promise<void> {
    const safeId = groupId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const data = {
      chainKey: Buffer.from(state.chainKey).toString('base64'),
      messageIndex: state.messageIndex,
      members: Object.fromEntries(
        Array.from(state.members.entries()).map(([k, v]) => [
          k,
          { chainKey: Buffer.from(v.chainKey).toString('base64'), index: v.index }
        ])
      ),
    };
    await this.fs.writeFile(`${this.basePath}/groups/${safeId}.json`, JSON.stringify(data, null, 2));
  }
}

/** In-memory storage for testing and ephemeral gateways. */
export class InMemoryGatewayStorage implements GatewayStorage {
  private preKeyStore: PreKeyStoreState | null = null;
  private sessions = new Map<string, SessionState>();
  private groupKeys = new Map<string, SenderKeyState>();

  async loadPreKeyStore(): Promise<PreKeyStoreState | null> {
    return this.preKeyStore;
  }
  async savePreKeyStore(store: PreKeyStoreState): Promise<void> {
    this.preKeyStore = store;
  }
  async loadSession(chatId: string): Promise<SessionState | null> {
    return this.sessions.get(chatId) ?? null;
  }
  async saveSession(chatId: string, session: SessionState): Promise<void> {
    this.sessions.set(chatId, session);
  }
  async loadGroupSenderKey(groupId: string): Promise<SenderKeyState | null> {
    return this.groupKeys.get(groupId) ?? null;
  }
  async saveGroupSenderKey(groupId: string, state: SenderKeyState): Promise<void> {
    this.groupKeys.set(groupId, state);
  }
}

/** IndexedDB storage for browser environments (if needed). */
export class IndexedDBGatewayStorage implements GatewayStorage {
  private dbName = 'NovaGateway';
  private db: any = null;

  private async openDB(): Promise<any> {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.createObjectStore('prekeys');
        db.createObjectStore('sessions');
        db.createObjectStore('groups');
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async loadPreKeyStore(): Promise<PreKeyStoreState | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('prekeys', 'readonly');
      const store = tx.objectStore('prekeys');
      const request = store.get('main');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async savePreKeyStore(store: PreKeyStoreState): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('prekeys', 'readwrite');
      const store = tx.objectStore('prekeys');
      const request = store.put(store, 'main');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadSession(chatId: string): Promise<SessionState | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.get(chatId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveSession(chatId: string, session: SessionState): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      const request = store.put(session, chatId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadGroupSenderKey(groupId: string): Promise<SenderKeyState | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('groups', 'readonly');
      const store = tx.objectStore('groups');
      const request = store.get(groupId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveGroupSenderKey(groupId: string, state: SenderKeyState): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('groups', 'readwrite');
      const store = tx.objectStore('groups');
      const request = store.put(state, groupId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}