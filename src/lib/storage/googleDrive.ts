/**
 * Google Drive backup integration (drive.file scope).
 * - PKCE OAuth flow for web/desktop (Tauri deep link) and mobile
 * - Encrypted token storage in IndexedDB (via EncryptedDatabase)
 * - Folder management: creates/finds "MessengerBackups/" app folder
 * - Resumable upload for large encrypted backups
 */

import { EncryptedDatabase, type DatabaseSnapshot } from './db';
import { createEncryptedBackupBlob, restoreEncryptedBackup, type BackupPayload } from './backup';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface GoogleDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiry: number; // Unix ms
  scope: string;
}

export interface GoogleDriveConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface BackupFileMetadata {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  appProperties?: {
    schemaVersion?: string;
    deviceId?: string;
    sha256?: string;
    kind?: string;
  };
}

export interface UploadSession {
  sessionUri: string;
  fileId?: string;
  totalSize: number;
  uploadedBytes: number;
  fileName: string;
  folderId: string;
  sha256: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Constants & Config
// ──────────────────────────────────────────────────────────────────────────

const GOOGLE_DRIVE_SETTINGS_KEY = 'google_drive_tokens';
const GOOGLE_DRIVE_FOLDER_KEY = 'google_drive_folder_id';
const GOOGLE_DRIVE_STATE_KEY = 'google_drive_oauth_state';

const DEFAULT_CONFIG: GoogleDriveConfig = {
  // These should be injected via env or build config
  clientId: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID ?? '',
  redirectUri: import.meta.env.VITE_GOOGLE_DRIVE_REDIRECT_URI ?? '',
  scopes: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'],
};

const FOLDER_NAME = 'MessengerBackups';
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB chunks for resumable upload
const ACCESS_TOKEN_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

// ──────────────────────────────────────────────────────────────────────────
// PKCE Helpers
// ──────────────────────────────────────────────────────────────────────────

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function sha256(data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(data));
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  // challenge = base64url(sha256(verifier))
  const challenge = base64UrlEncode(
    new Uint8Array(await sha256(verifier))
  );
  return { verifier, challenge };
}

// ──────────────────────────────────────────────────────────────────────────
// Token Storage (encrypted in IndexedDB)
// ──────────────────────────────────────────────────────────────────────────

let dbInstance: EncryptedDatabase | null = null;

function getDb(): EncryptedDatabase {
  if (!dbInstance) dbInstance = new EncryptedDatabase();
  return dbInstance;
}

export async function saveGoogleDriveTokens(tokens: GoogleDriveTokens): Promise<void> {
  const db = getDb();
  await db.saveSetting(GOOGLE_DRIVE_SETTINGS_KEY, tokens);
}

export async function loadGoogleDriveTokens(): Promise<GoogleDriveTokens | null> {
  const db = getDb();
  return db.loadSetting<GoogleDriveTokens>(GOOGLE_DRIVE_SETTINGS_KEY);
}

export async function clearGoogleDriveTokens(): Promise<void> {
  const db = getDb();
  await db.saveSetting(GOOGLE_DRIVE_SETTINGS_KEY, null as any);
}

export async function saveGoogleDriveFolderId(folderId: string): Promise<void> {
  const db = getDb();
  await db.saveSetting(GOOGLE_DRIVE_FOLDER_KEY, folderId);
}

export async function loadGoogleDriveFolderId(): Promise<string | null> {
  const db = getDb();
  return db.loadSetting<string>(GOOGLE_DRIVE_FOLDER_KEY);
}

export async function clearGoogleDriveFolderId(): Promise<void> {
  const db = getDb();
  await db.saveSetting(GOOGLE_DRIVE_FOLDER_KEY, null as any);
}

// ──────────────────────────────────────────────────────────────────────────
// OAuth Flow
// ──────────────────────────────────────────────────────────────────────────

export interface OAuthState {
  state: string;
  verifier: string;
  userId: string;
  createdAt: number;
}

export async function saveOAuthState(state: OAuthState): Promise<void> {
  const db = getDb();
  await db.saveSetting(GOOGLE_DRIVE_STATE_KEY, state);
}

export async function loadAndClearOAuthState(): Promise<OAuthState | null> {
  const db = getDb();
  const state = await db.loadSetting<OAuthState>(GOOGLE_DRIVE_STATE_KEY);
  if (state) {
    await db.saveSetting(GOOGLE_DRIVE_STATE_KEY, null as any);
  }
  return state;
}

export function buildGoogleAuthUrl(config: GoogleDriveConfig, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  config: GoogleDriveConfig,
  code: string,
  verifier: string
): Promise<GoogleDriveTokens> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${response.status} ${error.error_description ?? error.error ?? response.statusText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope,
  };
}

export async function refreshAccessToken(config: GoogleDriveConfig, refreshToken: string): Promise<Omit<GoogleDriveTokens, 'refreshToken'>> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // invalid_grant means token revoked/expired - caller should clear tokens and re-auth
    throw new Error(`Token refresh failed: ${response.status} ${error.error_description ?? error.error ?? response.statusText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? config.scopes.join(' '),
  };
}

export async function revokeToken(config: GoogleDriveConfig, token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Drive API: Folder & File Operations
// ──────────────────────────────────────────────────────────────────────────

async function driveFetch(
  tokens: GoogleDriveTokens,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...options, headers });
}

async function ensureValidToken(config: GoogleDriveConfig): Promise<GoogleDriveTokens> {
  let tokens = await loadGoogleDriveTokens();
  if (!tokens) throw new Error('Not connected to Google Drive');

  if (Date.now() >= tokens.expiry - ACCESS_TOKEN_BUFFER_MS) {
    try {
      const refreshed = await refreshAccessToken(config, tokens.refreshToken);
      tokens = { ...tokens, ...refreshed };
      await saveGoogleDriveTokens(tokens);
    } catch (err) {
      await clearGoogleDriveTokens();
      await clearGoogleDriveFolderId();
      throw new Error('Google Drive session expired. Please reconnect.');
    }
  }
  return tokens;
}

export async function findOrCreateBackupFolder(config: GoogleDriveConfig): Promise<string> {
  let folderId = await loadGoogleDriveFolderId();
  if (folderId) {
    // Verify folder still exists
    try {
      const tokens = await ensureValidToken(config);
      const resp = await driveFetch(tokens, `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id`);
      if (resp.ok) return folderId;
    } catch {
      // Folder deleted or token issue, fall through to recreate
    }
  }

  // Create new folder
  const tokens = await ensureValidToken(config);
  const resp = await driveFetch(tokens, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { createdBy: 'nova-messenger' },
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Failed to create backup folder: ${resp.status} ${err.error?.message ?? resp.statusText}`);
  }

  const data = await resp.json();
  folderId = data.id;
  await saveGoogleDriveFolderId(folderId);
  return folderId;
}

export async function listBackupFiles(config: GoogleDriveConfig): Promise<BackupFileMetadata[]> {
  const tokens = await ensureValidToken(config);
  const folderId = await findOrCreateBackupFolder(config);

  const q = `'${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,createdTime,appProperties)&orderBy=createdTime desc&pageSize=100`;

  const resp = await driveFetch(tokens, url);
  if (!resp.ok) throw new Error(`List failed: ${resp.status}`);

  const data = await resp.json();
  return (data.files ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size ?? 0),
    createdTime: f.createdTime,
    appProperties: f.appProperties,
  }));
}

export async function deleteBackupFile(config: GoogleDriveConfig, fileId: string): Promise<void> {
  const tokens = await ensureValidToken(config);
  const resp = await driveFetch(tokens, `https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Delete failed: ${resp.status}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Resumable Upload
// ──────────────────────────────────────────────────────────────────────────

async function startResumableUpload(
  tokens: GoogleDriveTokens,
  folderId: string,
  fileName: string,
  totalSize: number,
  sha256: string,
  schemaVersion: string,
  deviceId: string
): Promise<string> {
  const resp = await driveFetch(
    tokens,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(totalSize),
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        appProperties: {
          sha256,
          schemaVersion,
          kind: 'nova-backup',
          deviceId,
        },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Upload init failed: ${resp.status} ${err.error?.message ?? resp.statusText}`);
  }

  const sessionUri = resp.headers.get('Location');
  if (!sessionUri) throw new Error('No resumable session URI returned');
  return sessionUri;
}

async function uploadChunk(
  sessionUri: string,
  chunk: Uint8Array,
  start: number,
  end: number,
  totalSize: number
): Promise<{ status: number; nextStart?: number; fileId?: string }> {
  const resp = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(chunk.length),
    },
    body: chunk,
  });

  if (resp.status === 308) {
    // Resume incomplete - get next byte from Range header
    const range = resp.headers.get('Range');
    const nextStart = range ? parseInt(range.split('-')[1], 10) + 1 : end + 1;
    return { status: 308, nextStart };
  }

  if (resp.status === 200 || resp.status === 201) {
    const data = await resp.json();
    return { status: resp.status, fileId: data.id };
  }

  if (resp.status === 404) {
    // Session expired, need to restart
    throw new Error('UPLOAD_SESSION_EXPIRED');
  }

  const err = await resp.json().catch(() => ({}));
  throw new Error(`Chunk upload failed: ${resp.status} ${err.error?.message ?? resp.statusText}`);
}

export async function uploadBackupResumable(
  config: GoogleDriveConfig,
  blob: Blob,
  fileName: string,
  sha256: string,
  schemaVersion: string,
  deviceId: string,
  onProgress?: (uploaded: number, total: number) => void
): Promise<string> {
  const tokens = await ensureValidToken(config);
  const folderId = await findOrCreateBackupFolder(config);
  const totalSize = blob.size;

  // Start resumable session
  const sessionUri = await startResumableUpload(
    tokens,
    folderId,
    fileName,
    totalSize,
    sha256,
    schemaVersion,
    deviceId
  );

  let uploaded = 0;
  const reader = blob.stream().getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Accumulate into CHUNK_SIZE chunks (except last)
    // For simplicity, we upload each stream chunk; in production buffer to CHUNK_SIZE
    const chunk = value;
    const start = uploaded;
    const end = Math.min(uploaded + chunk.length - 1, totalSize - 1);

    const result = await uploadChunk(sessionUri, chunk, start, end, totalSize);

    if (result.status === 308 && result.nextStart !== undefined) {
      uploaded = result.nextStart;
      onProgress?.(uploaded, totalSize);
      continue;
    }

    if (result.fileId) {
      onProgress?.(totalSize, totalSize);
      return result.fileId;
    }

    throw new Error('Upload completed without file ID');
  }

  throw new Error('Upload stream ended unexpectedly');
}

// ──────────────────────────────────────────────────────────────────────────
// Download
// ──────────────────────────────────────────────────────────────────────────

export async function downloadBackupFile(config: GoogleDriveConfig, fileId: string): Promise<Blob> {
  const tokens = await ensureValidToken(config);
  const resp = await driveFetch(tokens, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  return resp.blob();
}

// ──────────────────────────────────────────────────────────────────────────
// High-level Backup/Restore
// ──────────────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function computeSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return arrayBufferToBase64(hash);
}

export async function createAndUploadBackup(
  config: GoogleDriveConfig,
  passphrase: string,
  chatList: Array<{ id: string; name: string; isEncrypted: boolean }>,
  identity: any,
  deviceId: string,
  onProgress?: (stage: string, progress?: number) => void
): Promise<string> {
  onProgress?.('Creating encrypted backup...');

  // Export DB snapshot
  const db = getDb();
  const snapshot = await db.exportSnapshot();

  const payload: BackupPayload = {
    version: 2,
    identity,
    chatsMetadata: chatList,
    exportedAt: new Date().toISOString(),
    data: snapshot,
  };

  const blob = await createEncryptedBackupBlob(payload, passphrase);
  const sha256 = await computeSHA256(blob);

  const fileName = `backup-${deviceId}-${Date.now()}.nova-backup`;

  onProgress?.('Uploading to Google Drive...', 0);

  const fileId = await uploadBackupResumable(
    config,
    blob,
    fileName,
    sha256,
    '2',
    deviceId,
    (uploaded, total) => onProgress?.('Uploading to Google Drive...', uploaded / total)
  );

  onProgress?.('Backup complete!');
  return fileId;
}

export async function downloadAndRestoreBackup(
  config: GoogleDriveConfig,
  fileId: string,
  passphrase: string
): Promise<BackupPayload> {
  const blob = await downloadBackupFile(config, fileId);
  const text = await blob.text();
  return restoreEncryptedBackup(text, passphrase);
}

// ──────────────────────────────────────────────────────────────────────────
// Connection Management
// ──────────────────────────────────────────────────────────────────────────

export async function isGoogleDriveConnected(): Promise<boolean> {
  const tokens = await loadGoogleDriveTokens();
  return !!tokens;
}

export async function disconnectGoogleDrive(config: GoogleDriveConfig): Promise<void> {
  const tokens = await loadGoogleDriveTokens();
  if (tokens) {
    try {
      await revokeToken(config, tokens.refreshToken);
    } catch {
      // Ignore revoke errors
    }
  }
  await clearGoogleDriveTokens();
  await clearGoogleDriveFolderId();
}

export function getConfig(): GoogleDriveConfig {
  return { ...DEFAULT_CONFIG };
}

export function setConfig(config: Partial<GoogleDriveConfig>): void {
  Object.assign(DEFAULT_CONFIG, config);
}