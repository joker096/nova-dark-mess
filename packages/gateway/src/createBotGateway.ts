/**
 * Factory for creating and configuring BotGateway instances.
 */

import { BotGateway, type BotGatewayOptions, type GatewayStorage, type GatewayCallbacks } from './BotGateway';
import { GatewayHttpApi, type GatewayHttpApiOptions } from './GatewayHttpApi';

export interface BotGatewayConfig {
  /** Bot's identity keypair (Ed25519 signing + X25519 encryption) */
  identity: {
    fingerprint: string;
    signingKey: Uint8Array; // Ed25519 private key (32 bytes)
    signingKeyPublic: Uint8Array; // Ed25519 public key (32 bytes)
    encryptionKey: Uint8Array; // X25519 private key (32 bytes)
    encryptionKeyPublic: Uint8Array; // X25519 public key (32 bytes)
  };
  /** Signaling server WebSocket URL */
  signalingUrl?: string;
  /** Optional custom storage implementation */
  storage?: GatewayStorage;
  /** Optional callbacks for bot runtime integration */
  callbacks?: GatewayCallbacks;
  /** HTTP API config (for L3 Telegram compatibility) */
  httpApi?: {
    enabled: boolean;
    port: number;
    host?: string;
  };
}

/**
 * Create a BotGateway from config.
 * Handles key loading/generation and gateway initialization.
 */
export async function createBotGateway(config: BotGatewayConfig): Promise<{
  gateway: BotGateway;
  httpApi?: GatewayHttpApi;
  shutdown: () => Promise<void>;
}> {
  const { UserIdentity } = await import('../../lib/crypto/identity');
  
  // Create UserIdentity from config
  const identity: any = {
    fingerprint: config.identity.fingerprint,
    signingKey: config.identity.signingKey,
    signingKeyPublic: config.identity.signingKeyPublic,
    encryptionKey: config.identity.encryptionKey,
    encryptionKeyPublic: config.identity.encryptionKeyPublic,
  };
  
  // Create gateway
  const gateway = new BotGateway({
    identity,
    signalingUrl: config.signalingUrl,
    storage: config.storage,
    callbacks: config.callbacks,
  });
  
  await gateway.initialize();
  
  let httpApi: GatewayHttpApi | undefined;
  if (config.httpApi?.enabled) {
    httpApi = new GatewayHttpApi({
      gateway,
      port: config.httpApi.port,
      host: config.httpApi.host,
    });
    await httpApi.start();
  }
  
  const shutdown = async () => {
    if (httpApi) await httpApi.stop();
    await gateway.shutdown();
  };
  
  return { gateway, httpApi, shutdown };
}

/**
 * Generate a new bot identity and save to config.
 */
export async function generateBotIdentity(): Promise<{
  fingerprint: string;
  signingKey: Uint8Array;
  signingKeyPublic: Uint8Array;
  encryptionKey: Uint8Array;
  encryptionKeyPublic: Uint8Array;
}> {
  const { generateX25519KeyPair, generateEd25519KeyPair } = await import('../../lib/crypto/identity');
  
  const signingKeyPair = generateEd25519KeyPair();
  const encryptionKeyPair = generateX25519KeyPair();
  
  // Fingerprint = base64url(Ed25519 public key)
  const fingerprint = 'nova_pk_' + btoa(String.fromCharCode(...signingKeyPair.publicKey))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '').slice(0, 43);
  
  return {
    fingerprint,
    signingKey: signingKeyPair.privateKey,
    signingKeyPublic: signingKeyPair.publicKey,
    encryptionKey: encryptionKeyPair.privateKey,
    encryptionKeyPublic: encryptionKeyPair.publicKey,
  };
}

/**
 * Load bot identity from secure storage (e.g., OS keychain, encrypted file).
 */
export async function loadBotIdentity(path: string): Promise<{
  fingerprint: string;
  signingKey: Uint8Array;
  signingKeyPublic: Uint8Array;
  encryptionKey: Uint8Array;
  encryptionKeyPublic: Uint8Array;
} | null> {
  const fs = await import('fs/promises');
  try {
    const data = await fs.readFile(path, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      fingerprint: parsed.fingerprint,
      signingKey: new Uint8Array(Buffer.from(parsed.signingKey, 'base64')),
      signingKeyPublic: new Uint8Array(Buffer.from(parsed.signingKeyPublic, 'base64')),
      encryptionKey: new Uint8Array(Buffer.from(parsed.encryptionKey, 'base64')),
      encryptionKeyPublic: new Uint8Array(Buffer.from(parsed.encryptionKeyPublic, 'base64')),
    };
  } catch {
    return null;
  }
}

/**
 * Save bot identity to secure storage.
 */
export async function saveBotIdentity(
  path: string,
  identity: {
    fingerprint: string;
    signingKey: Uint8Array;
    signingKeyPublic: Uint8Array;
    encryptionKey: Uint8Array;
    encryptionKeyPublic: Uint8Array;
  }
): Promise<void> {
  const fs = await import('fs/promises');
  const data = {
    fingerprint: identity.fingerprint,
    signingKey: Buffer.from(identity.signingKey).toString('base64'),
    signingKeyPublic: Buffer.from(identity.signingKeyPublic).toString('base64'),
    encryptionKey: Buffer.from(identity.encryptionKey).toString('base64'),
    encryptionKeyPublic: Buffer.from(identity.encryptionKeyPublic).toString('base64'),
  };
  await fs.writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}