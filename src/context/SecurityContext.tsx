import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import {
  PreKeyBundle,
  UserIdentity,
  createAnonymousIdentity,
  createOneTimePreKey,
  createPreKeyBundle,
  createSignedPreKey,
  deriveIdentityFromMnemonic,
  isValidMnemonic,
  verifyPreKeyBundle,
} from '../lib/crypto/identity';
import {
  RatchetMessagePayload,
  RatchetState,
  X3DHHeader,
  createOutboundRatchetSession,
  ratchetDecryptMessage,
  ratchetEncryptMessage,
} from '../lib/crypto/ratchet';
import { dbInstance } from '../lib/storage/db';
import {
  createEncryptedBackupBlob,
  restoreEncryptedBackup,
  BackupPayload,
} from '../lib/storage/backup';
import {
  clearStoredIdentity,
  loadStoredIdentity,
  saveStoredIdentity,
} from '../lib/storage/identityStore';
import { deriveKeyFromRandomSecret, deriveKeyFromPassphrase } from '../lib/storage/kdf';
import { generateTOTPSecret, verifyTOTPCode } from '../lib/p2p/totp';
import { getPeerKeyChanges, observePeerKey, type PeerKeyChange } from '../lib/security/peerKeyJournal';
import {
  clearPinFailures,
  getPinLockoutUntil,
  recordPinFailure,
} from '../lib/security/pinAttemptLimiter';

export interface SecurityContextType {
  identity: UserIdentity | null;
  isInitialized: boolean;
  isP2PConnected: boolean;
  is2FAEnabled: boolean;
  totpSecret: string | null;
  pinEnabled: boolean;
  pinHash: string | null;
  pinLockoutUntil: number | null;
  isLocked: boolean;
  ratchetSessions: Record<string, RatchetState>;
  regenerateIdentity: () => Promise<UserIdentity>;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  removePin: () => Promise<void>;
  unlock: () => void;
  encryptAndSendMessage: (
    chatId: string,
    text: string,
    options?: { messageId?: string; expiresAt?: number }
  ) => Promise<{ encryptedPayload: RatchetMessagePayload; plaintext: string }>;
  checkPeerKey: (chatId: string) => Promise<{
    peerFingerprint: string;
    history: PeerKeyChange[];
  }>;
  decryptIncomingMessage: (chatId: string, payload: RatchetMessagePayload) => Promise<string>;
  enable2FA: (secret: string, inputCode: string) => Promise<boolean>;
  disable2FA: () => void;
  exportEncryptedBackup: (
    passphrase: string,
    chatList: Array<{ id: string; name: string; isEncrypted: boolean }>
  ) => Promise<Blob>;
  importEncryptedBackup: (backupContent: string, passphrase: string) => Promise<BackupPayload>;
  /** Rebuilds the identity from a 12/24-word phrase, keeping the same fingerprint. */
  restoreIdentityFromMnemonic: (mnemonic: string) => Promise<UserIdentity>;
  clearLocalEncryptedData: () => Promise<void>;
}

export const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

const DEMO_PEER_PREFIX = 'nova_demo_peer_bundle_';
const STORAGE_SECRET_KEY = 'nova_storage_secret';
const STORAGE_SALT_KEY = 'nova_storage_salt';
const TOTP_SECRET_SETTING = 'totp_secret';
const TOTP_ENABLED_SETTING = 'totp_enabled';
const PIN_HASH_KEY = 'nova_pin_hash';
const PIN_ENABLED_KEY = 'nova_pin_enabled';

export { PIN_HASH_KEY, PIN_ENABLED_KEY };

function randomBase64(length: number): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(length))));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getOrCreateStorageCredentials(): { passphrase: string; salt: Uint8Array } {
  let passphrase = localStorage.getItem(STORAGE_SECRET_KEY);
  if (!passphrase) {
    passphrase = randomBase64(32);
    localStorage.setItem(STORAGE_SECRET_KEY, passphrase);
  }

  let salt = localStorage.getItem(STORAGE_SALT_KEY);
  if (!salt) {
    salt = randomBase64(16);
    localStorage.setItem(STORAGE_SALT_KEY, salt);
  }

  return { passphrase, salt: base64ToBytes(salt) };
}

function identityIsConsistent(identity: UserIdentity): boolean {
  try {
    if (!identity.mnemonic || !isValidMnemonic(identity.mnemonic)) return false;
    const derived = deriveIdentityFromMnemonic(identity.mnemonic, identity.createdAt);
    return (
      derived.fingerprint === identity.fingerprint &&
      derived.publicKey === identity.publicKey &&
      derived.signingPublicKey === identity.signingPublicKey
    );
  } catch {
    return false;
  }
}

async function getOrCreateDemoPeerBundle(chatId: string): Promise<PreKeyBundle> {
  const storageKey = `${DEMO_PEER_PREFIX}${chatId}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    try {
      return JSON.parse(existing) as PreKeyBundle;
    } catch {
      throw new Error(`Stored peer key bundle for "${chatId}" is corrupted.`);
    }
  }

  const peerIdentity = await createAnonymousIdentity();
  const signedPreKey = createSignedPreKey(peerIdentity, 1);
  const oneTimePreKey = createOneTimePreKey(1);
  const bundle = createPreKeyBundle(peerIdentity, signedPreKey, oneTimePreKey);
  localStorage.setItem(storageKey, JSON.stringify(bundle));
  return bundle;
}

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [ratchetSessions, setRatchetSessions] = useState<Record<string, RatchetState>>({});
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinLockoutUntil, setPinLockoutUntil] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const sessionsRef = useRef<Record<string, RatchetState>>({});
  const storageReadyRef = useRef(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const readyPromiseRef = useRef<Promise<{
    identity: UserIdentity;
    secret: string | null;
    enabled: boolean;
  }> | null>(null);

  const runSerialized = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(task, task);
    queueRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }, []);

  const rememberSession = useCallback((chatId: string, session: RatchetState) => {
    sessionsRef.current = { ...sessionsRef.current, [chatId]: session };
    setRatchetSessions((prev) => ({ ...prev, [chatId]: session }));
  }, []);

  const checkPeerKey = useCallback(
    (chatId: string) =>
      runSerialized(async () => {
        const bundle = await getOrCreateDemoPeerBundle(chatId);
        if (!verifyPreKeyBundle(bundle)) {
          throw new Error('Peer pre-key bundle failed verification.');
        }

        await observePeerKey(chatId, {
          fingerprint: bundle.fingerprint,
          signingKey: bundle.signingKey,
          identityKey: bundle.identityKey,
        });

        return {
          peerFingerprint: bundle.fingerprint,
          history: getPeerKeyChanges(chatId),
        };
      }),
    [runSerialized]
  );

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      let currentIdentity: UserIdentity;
      try {
        const stored = await loadStoredIdentity();
        if (stored && identityIsConsistent(stored)) {
          currentIdentity = stored;
        } else {
          currentIdentity = await createAnonymousIdentity();
          await saveStoredIdentity(currentIdentity);
        }
      } catch {
        currentIdentity = await createAnonymousIdentity();
      }

      try {
        const { passphrase, salt } = getOrCreateStorageCredentials();
        const masterKey = await deriveKeyFromRandomSecret(passphrase, salt);
        await dbInstance.initializeWithKey(masterKey);
        await dbInstance.purgeExpiredMessages();
        storageReadyRef.current = true;
      } catch (err) {
        console.warn('Encrypted local storage is unavailable:', err);
      }

      let secret: string | null;
      let enabled = false;

      if (storageReadyRef.current) {
        try {
          secret = await dbInstance.loadSetting<string>(TOTP_SECRET_SETTING);
          enabled = (await dbInstance.loadSetting<boolean>(TOTP_ENABLED_SETTING)) === true;
          if (!secret) {
            secret = generateTOTPSecret();
            await dbInstance.saveSetting(TOTP_SECRET_SETTING, secret);
          }
        } catch {
          secret = generateTOTPSecret();
        }
      } else {
        secret = generateTOTPSecret();
      }

      return { identity: currentIdentity, secret, enabled };
    };

    const readyPromise = initialize();
    readyPromiseRef.current = readyPromise;

    void readyPromise
      .then(({ identity: readyIdentity, secret, enabled }) => {
        if (cancelled) return;
        setIdentity(readyIdentity);
        setTotpSecret(secret);
        setIs2FAEnabled(enabled);
        try {
          const storedPinHash = localStorage.getItem(PIN_HASH_KEY);
          if (storedPinHash) setPinHash(storedPinHash);
          const enabledPin = Boolean(storedPinHash);
          setPinEnabled(enabledPin);
          setIsLocked(enabledPin);
          setPinLockoutUntil(getPinLockoutUntil());
        } catch (error) {
          console.error('Unable to load PIN protection state:', error);
        }
        setIsInitialized(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsInitialized(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pinEnabled || !pinHash) return;
    const lockWhenHidden = () => {
      if (document.visibilityState === 'hidden') setIsLocked(true);
    };
    document.addEventListener('visibilitychange', lockWhenHidden);
    return () => document.removeEventListener('visibilitychange', lockWhenHidden);
  }, [pinEnabled, pinHash]);

  const regenerateIdentity = useCallback(async (): Promise<UserIdentity> => {
    const nextIdentity = await createAnonymousIdentity();
    await saveStoredIdentity(nextIdentity);
    sessionsRef.current = {};
    setRatchetSessions({});
    if (storageReadyRef.current) {
      await dbInstance.clearSessions().catch(() => undefined);
      await dbInstance.clearPreKeys().catch(() => undefined);
    }
    setIdentity(nextIdentity);
    return nextIdentity;
  }, []);

  const encryptAndSendMessage = useCallback(
    (chatId: string, text: string, options?: { messageId?: string; expiresAt?: number }) =>
      runSerialized(async () => {
        const activeIdentity =
          identity ?? (readyPromiseRef.current ? (await readyPromiseRef.current).identity : null);
        if (!activeIdentity) throw new Error('Identity not initialized');

        const bundle = await getOrCreateDemoPeerBundle(chatId);
        if (!verifyPreKeyBundle(bundle)) {
          throw new Error('Peer pre-key bundle failed verification.');
        }
        await observePeerKey(chatId, {
          fingerprint: bundle.fingerprint,
          signingKey: bundle.signingKey,
          identityKey: bundle.identityKey,
        });

        let session: RatchetState | undefined = sessionsRef.current[chatId];
        if (!session && storageReadyRef.current) {
          session =
            (await dbInstance.loadSession<RatchetState>(`chat:${chatId}`)) ?? undefined;
        }

        let x3dhHeader: X3DHHeader | undefined;
        if (!session) {
          const outbound = await createOutboundRatchetSession(activeIdentity, bundle);
          session = outbound.state;
          x3dhHeader = outbound.header;
        }

        const { payload, updatedState } = await ratchetEncryptMessage(
          session,
          text,
          activeIdentity.fingerprint,
          session.peerFingerprint ?? `peer_${chatId}`,
          x3dhHeader
        );

        if (storageReadyRef.current) {
          await dbInstance.saveEncryptedMessageWithSession(
            chatId,
            options?.messageId ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            JSON.stringify(payload),
            updatedState,
            options?.expiresAt,
          );
        }

        rememberSession(chatId, updatedState);
        return { encryptedPayload: payload, plaintext: text };
      }),
    [identity, rememberSession, runSerialized]
  );

  const decryptIncomingMessage = useCallback(
    (chatId: string, payload: RatchetMessagePayload) =>
      runSerialized(async () => {
        const activeIdentity =
          identity ?? (readyPromiseRef.current ? (await readyPromiseRef.current).identity : null);
        if (!activeIdentity) throw new Error('Identity not initialized');

        let session: RatchetState | undefined = sessionsRef.current[chatId];
        if (!session && storageReadyRef.current) {
          session =
            (await dbInstance.loadSession<RatchetState>(`chat:${chatId}`)) ?? undefined;
        }
        if (!session) {
          throw new Error('No established inbound ratchet session for this chat');
        }

        const { plaintext, updatedState } = await ratchetDecryptMessage(session, payload);
        rememberSession(chatId, updatedState);

        if (storageReadyRef.current) {
          await dbInstance.saveSession(chatId, updatedState).catch(() => undefined);
        }

        return plaintext;
      }),
    [identity, rememberSession, runSerialized]
  );

  const enable2FA = useCallback(async (secret: string, inputCode: string): Promise<boolean> => {
    const valid = await verifyTOTPCode(secret, inputCode);
    if (!valid) return false;

    if (storageReadyRef.current) {
      await dbInstance.saveSetting(TOTP_SECRET_SETTING, secret).catch(() => undefined);
      await dbInstance.saveSetting(TOTP_ENABLED_SETTING, true).catch(() => undefined);
    }
    setTotpSecret(secret);
    setIs2FAEnabled(true);
    return true;
  }, []);

  const disable2FA = useCallback(() => {
    if (storageReadyRef.current) {
      void dbInstance.saveSetting(TOTP_ENABLED_SETTING, false).catch(() => undefined);
    }
    setIs2FAEnabled(false);
  }, []);

  const exportEncryptedBackup = useCallback(
    async (
      passphrase: string,
      chatList: Array<{ id: string; name: string; isEncrypted: boolean }>
    ): Promise<Blob> => {
      if (!identity) throw new Error('No identity available for backup');
      const snapshot = storageReadyRef.current
        ? await dbInstance.exportSnapshot().catch(() => undefined)
        : undefined;
      const payload: BackupPayload = {
        version: 2,
        identity,
        chatsMetadata: chatList,
        exportedAt: new Date().toISOString(),
        data: snapshot,
      };
      return createEncryptedBackupBlob(payload, passphrase);
    },
    [identity]
  );

  const importEncryptedBackup = useCallback(
    async (backupContent: string, passphrase: string): Promise<BackupPayload> => {
      const restored = await restoreEncryptedBackup(backupContent, passphrase);
      if (!identityIsConsistent(restored.identity)) {
        throw new Error('Backup contains an invalid identity');
      }

      await saveStoredIdentity(restored.identity);
      sessionsRef.current = {};
      setRatchetSessions({});
      setIdentity(restored.identity);

      if (restored.data) {
        if (!storageReadyRef.current) {
          throw new Error('Encrypted local storage is unavailable for restore');
        }
        await dbInstance.importSnapshot(restored.data);
        const restoredSecret = await dbInstance.loadSetting<string>(TOTP_SECRET_SETTING);
        const restoredEnabled =
          (await dbInstance.loadSetting<boolean>(TOTP_ENABLED_SETTING)) === true;
        setTotpSecret(restoredSecret ?? generateTOTPSecret());
        setIs2FAEnabled(restoredEnabled);
      } else if (storageReadyRef.current) {
        await dbInstance.clearSessions().catch(() => undefined);
        await dbInstance.clearPreKeys().catch(() => undefined);
      }

      return restored;
    },
    []
  );

  const restoreIdentityFromMnemonic = useCallback(
    async (mnemonic: string): Promise<UserIdentity> => {
      if (!isValidMnemonic(mnemonic)) throw new Error('Invalid recovery phrase');
      const restored = deriveIdentityFromMnemonic(mnemonic);
      await saveStoredIdentity(restored);
      sessionsRef.current = {};
      setRatchetSessions({});
      if (storageReadyRef.current) {
        await dbInstance.clearSessions().catch(() => undefined);
        await dbInstance.clearPreKeys().catch(() => undefined);
      }
      setIdentity(restored);
      return restored;
    },
    []
  );

  const pinHashSalt = 'nova-pin-v1';

  const hashPin = useCallback(async (pin: string): Promise<string> => {
    const salt = new TextEncoder().encode(pinHashSalt);
    const key = await deriveKeyFromPassphrase(pin, salt as unknown as Uint8Array, undefined, true);
    const raw = await crypto.subtle.exportKey('raw', key);
    return bufferToHex(new Uint8Array(raw));
  }, []);

  const setPin = useCallback(async (pin: string): Promise<void> => {
    const hash = await hashPin(pin);
    clearPinFailures();
    localStorage.setItem(PIN_HASH_KEY, hash);
    localStorage.setItem(PIN_ENABLED_KEY, 'true');
    setPinHash(hash);
    setPinEnabled(true);
    setPinLockoutUntil(null);
  }, [hashPin]);

  const verifyPin = useCallback(
    (pin: string): Promise<boolean> =>
      runSerialized(async () => {
        if (!pinHash) return false;
        const lockedUntil = getPinLockoutUntil();
        setPinLockoutUntil(lockedUntil);
        if (lockedUntil !== null) return false;

        const hash = await hashPin(pin);
        if (hash === pinHash) {
          clearPinFailures();
          setPinLockoutUntil(null);
          return true;
        }

        setPinLockoutUntil(recordPinFailure());
        return false;
      }),
    [hashPin, pinHash, runSerialized]
  );

  const removePin = useCallback(async (): Promise<void> => {
    clearPinFailures();
    localStorage.removeItem(PIN_HASH_KEY);
    localStorage.removeItem(PIN_ENABLED_KEY);
    setPinHash(null);
    setPinEnabled(false);
    setPinLockoutUntil(null);
    setIsLocked(false);
  }, []);

  const unlock = useCallback((): void => {
    setIsLocked(false);
  }, []);

  const clearLocalEncryptedData = useCallback(async () => {
    if (storageReadyRef.current) {
      await dbInstance.clearAll();
    }
    sessionsRef.current = {};
    setRatchetSessions({});
    clearStoredIdentity();
    setIs2FAEnabled(false);
    setTotpSecret(generateTOTPSecret());
    await removePin();
  }, [removePin]);

  return (
    <SecurityContext.Provider
      value={{
        identity,
        isInitialized,
        isP2PConnected: false,
        is2FAEnabled,
        totpSecret,
        pinEnabled,
        pinHash,
        pinLockoutUntil,
        isLocked,
        ratchetSessions,
        regenerateIdentity,
        setPin,
        verifyPin,
        removePin,
        unlock,
        encryptAndSendMessage,
        checkPeerKey,
        decryptIncomingMessage,
        enable2FA,
        disable2FA,
        exportEncryptedBackup,
        importEncryptedBackup,
        restoreIdentityFromMnemonic,
        clearLocalEncryptedData,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};
