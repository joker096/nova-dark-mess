export const POW_MIN_DIFFICULTY: 1;
export const POW_MAX_DIFFICULTY: 24;

export interface PowChallenge {
  /** Challenge bytes, base64url (issued by the receiver inside the invite). */
  challenge: string;
  /** Required number of leading zero bits in SHA-256(challenge || nonce). */
  difficulty: number;
}

export interface PowSolution {
  nonce: number;
  digest: string;
}

export function isPowChallenge(value: unknown): value is PowChallenge;
export function isPowSolution(value: unknown): value is PowSolution;
export function createPowChallenge(difficulty?: number): PowChallenge;
export function solvePow(challenge: PowChallenge): Promise<PowSolution>;
export function verifyPow(challenge: PowChallenge, solution: PowSolution): boolean;
export function createInviteToken(): string;
export function isInviteToken(value: unknown): value is string;
