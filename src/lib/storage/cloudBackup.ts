/**
 * Opt-in encrypted cloud backup to a user-selected WebDAV/S3-compatible endpoint.
 * The payload is already an encrypted .nova-backup blob; this module only
 * transports it. Keys never leave the device.
 */

export interface CloudBackupTarget {
  url: string;
  headers?: Record<string, string>;
}

export async function uploadEncryptedBackup(
  target: CloudBackupTarget,
  blob: Blob,
): Promise<void> {
  const response = await fetch(target.url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(target.headers ?? {}),
    },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Cloud backup upload failed: ${response.status} ${response.statusText}`);
  }
}

export async function downloadEncryptedBackup(target: CloudBackupTarget): Promise<Blob> {
  const response = await fetch(target.url, {
    method: 'GET',
    headers: target.headers ?? {},
  });
  if (!response.ok) {
    throw new Error(`Cloud backup download failed: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}
