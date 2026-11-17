function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function generateQueueId(): string {
  return `q_${bytesToHex(randomBytes(16))}`;
}

export function generateQueueToken(): string {
  const bytes = randomBytes(32);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function isQueueId(value: string): boolean {
  return /^q_[0-9a-f]{32}$/.test(value);
}

export function isQueueToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(value);
}
