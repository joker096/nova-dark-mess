/**
 * Compares two secret strings without leaking where they first differ.
 *
 * Used for PIN hashes and other locally stored secrets: a plain `===` returns
 * on the first mismatching character, which is measurably faster than a full
 * comparison and can be observed from a script running on the page.
 */
const encoder = new TextEncoder();

export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
