import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Relay response receipts (finding A6).
 *
 * A proxy sits between the client and the relay, so a poll reply, an ACK reply
 * or a created queue can be fabricated: the realistic attack is quietly
 * dropping a message ("nothing new") or hiding an ACK failure. Both sides
 * already share a secret — the recipient token — so the relay can prove a
 * response is its own with an HMAC over the body it sent.
 *
 * This is not a substitute for the sealed-sender signature: it only says
 * "a holder of the recipient token produced these bytes", which rules out a
 * proxy that never talked to the relay and rules out tampering with the
 * packet list. A relay that is itself malicious can still answer "empty".
 */

const RECEIPT_CONTEXT = 'nova-anon-receipt-v1';

export type ReceiptAction = 'create' | 'poll' | 'ack';

/** Deterministic JSON: key order is fixed by the caller's literal. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

function receiptBytes(secret: string): Uint8Array {
  // `encode` keeps separators and length-prefixes nothing, so the context,
  // the action and the body cannot be shifted into one another.
  return new TextEncoder().encode(`${RECEIPT_CONTEXT}\u0000${secret}`);
}

export function receiptMessage(action: ReceiptAction, body: unknown): Uint8Array {
  return new TextEncoder().encode(`${action}\u0000${canonicalJson(body)}`);
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function computeRelayReceipt(secret: string, action: ReceiptAction, body: unknown): string {
  return toBase64Url(hmac(sha256, receiptBytes(secret), receiptMessage(action, body)));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * Verifies a receipt. `null` means "no receipt at all" (an older relay, which
 * the caller may accept explicitly); `false` means "a receipt that does not
 * match", which must never be treated as a valid answer.
 */
export function verifyRelayReceipt(
  secret: string,
  action: ReceiptAction,
  body: unknown,
  receipt: unknown,
): boolean | null {
  if (receipt === undefined || receipt === null) return null;
  if (typeof receipt !== 'string' || receipt.length === 0) return false;
  try {
    return constantTimeEqual(computeRelayReceipt(secret, action, body), receipt);
  } catch {
    return false;
  }
}

/**
 * True when a relay answered without a receipt when one was required.
 * Used to distinguish "old relay, we accept it" from "proxy stripped the tag".
 */
export function receiptMissing(receipt: unknown): boolean {
  return receipt === undefined || receipt === null || receipt === '';
}
