/**
 * Encrypted backup upload/download to the Nova relay (/api/backup/*).
 * The server never sees plaintext: the caller passes an already-encrypted
 * .nova-backup JSON string (produced by createEncryptedBackupBlob). The relay
 * stores the opaque blob under a destination fingerprint with a TTL (30 days)
 * and returns it on download. Keys never leave the device.
 *
 * Auth: Bearer token matching RELAY_HMAC_SECRET (dev mode: open when unset).
 */

export interface RelayBackupTarget {
  baseUrl: string;
  bearerToken: string;
  destination: string; // peer fingerprint used as the storage key
}

export async function uploadEncryptedBackup(
  target: RelayBackupTarget,
  encryptedBlobJson: string,
): Promise<void> {
  const response = await fetch(`${target.baseUrl}/api/backup/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${target.bearerToken}`,
    },
    body: JSON.stringify({
      destination: target.destination,
      blob: encryptedBlobJson,
    }),
  });
  if (response.status === 401) {
    throw new Error('Relay backup upload unauthorized');
  }
  if (response.status === 413) {
    throw new Error('Relay backup too large');
  }
  if (!response.ok) {
    throw new Error(`Relay backup upload failed: ${response.status} ${response.statusText}`);
  }
}

export async function downloadEncryptedBackup(
  target: RelayBackupTarget,
): Promise<{ blob: string; storedAt: string; size: number } | null> {
  const response = await fetch(
    `${target.baseUrl}/api/backup/download?destination=${encodeURIComponent(target.destination)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${target.bearerToken}`,
      },
    },
  );
  if (response.status === 404) {
    return null;
  }
  if (response.status === 401) {
    throw new Error('Relay backup download unauthorized');
  }
  if (!response.ok) {
    throw new Error(`Relay backup download failed: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  return {
    blob: json.blob,
    storedAt: json.storedAt,
    size: json.size,
  };
}
