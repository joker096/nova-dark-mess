const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;

function base32Encode(bytes: Uint8Array): string {
  let output = '';
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid Base32 TOTP secret');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }

  return new Uint8Array(bytes);
}

function secretToBytes(secret: string): Uint8Array {
  try {
    const decoded = base32Decode(secret);
    if (decoded.length > 0) return decoded;
  } catch {
    // Fall back to raw UTF-8 input for legacy secrets.
  }
  return new TextEncoder().encode(secret);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function generateTOTPSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export async function computeTOTPCode(
  secret: string,
  timestampMs: number = Date.now(),
  periodSeconds = DEFAULT_PERIOD_SECONDS,
  digits = DEFAULT_DIGITS
): Promise<string> {
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setUint32(0, Math.floor(counter / 0x100000000), false);
  counterView.setUint32(4, counter >>> 0, false);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secretToBytes(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const bytes = new Uint8Array(signature);
  const offset = bytes[bytes.length - 1] & 0x0f;

  const binary =
    ((bytes[offset] & 0x7f) << 24) |
    ((bytes[offset + 1] & 0xff) << 16) |
    ((bytes[offset + 2] & 0xff) << 8) |
    (bytes[offset + 3] & 0xff);

  const code = binary % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

export async function verifyTOTPCode(
  secret: string,
  inputCode: string,
  periodSeconds = DEFAULT_PERIOD_SECONDS,
  window = 1
): Promise<boolean> {
  const now = Date.now();
  const normalized = inputCode.trim();

  for (let offset = -window; offset <= window; offset += 1) {
    const code = await computeTOTPCode(secret, now + offset * periodSeconds * 1000, periodSeconds);
    if (constantTimeEqual(code, normalized)) {
      return true;
    }
  }
  return false;
}

export function buildTOTPUri(
  secret: string,
  accountName: string,
  issuer = 'Nova Dark Messenger'
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
