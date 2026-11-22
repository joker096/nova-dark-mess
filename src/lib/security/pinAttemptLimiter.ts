const STORAGE_KEY = 'nova_pin_attempts_v1';
const RESET_REQUEST_KEY = 'nova_pin_reset_request_v1';
const MAX_DELAY_MS = 5 * 60 * 1000;
const PIN_RESET_WAIT_MS = 7 * 24 * 60 * 60 * 1000;

interface PinAttemptState {
  version: 1;
  failedAttempts: number;
  lockedUntil: number;
}

function readState(): PinAttemptState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new Error(
      `PIN retry state is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!raw) return { version: 1, failedAttempts: 0, lockedUntil: 0 };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('PIN retry state is corrupted; refusing PIN verification.');
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('failedAttempts' in value) ||
    typeof value.failedAttempts !== 'number' ||
    !Number.isInteger(value.failedAttempts) ||
    value.failedAttempts < 0 ||
    !('lockedUntil' in value) ||
    typeof value.lockedUntil !== 'number' ||
    !Number.isFinite(value.lockedUntil) ||
    value.lockedUntil < 0
  ) {
    throw new Error('PIN retry state has an unsupported format.');
  }

  return {
    version: 1,
    failedAttempts: value.failedAttempts,
    lockedUntil: value.lockedUntil,
  };
}

function writeState(state: PinAttemptState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    throw new Error(
      `PIN retry state could not be saved: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function getPinLockoutUntil(now = Date.now()): number | null {
  const { lockedUntil } = readState();
  return lockedUntil > now ? lockedUntil : null;
}

export function recordPinFailure(now = Date.now()): number | null {
  const state = readState();
  const failedAttempts = Math.min(state.failedAttempts + 1, 32);
  const delay =
    failedAttempts < 3
      ? 0
      : Math.min(MAX_DELAY_MS, 1000 * 2 ** Math.min(failedAttempts - 3, 10));
  const lockedUntil = delay > 0 ? now + delay : 0;
  writeState({ version: 1, failedAttempts, lockedUntil });
  return lockedUntil || null;
}

export function clearPinFailures(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    throw new Error(
      `PIN retry state could not be cleared: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function requestPinReset(): number {
  const now = Date.now();
  try {
    localStorage.setItem(RESET_REQUEST_KEY, String(now));
  } catch (error) {
    throw new Error(
      `PIN reset request could not be saved: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return now + PIN_RESET_WAIT_MS;
}

export function getPinResetAllowedAt(): number | null {
  try {
    const raw = localStorage.getItem(RESET_REQUEST_KEY);
    if (!raw) return null;
    const requestedAt = parseInt(raw, 10);
    if (isNaN(requestedAt)) return null;
    return requestedAt + PIN_RESET_WAIT_MS;
  } catch {
    return null;
  }
}

export function isPinResetAllowed(): boolean {
  const allowedAt = getPinResetAllowedAt();
  if (allowedAt === null) return false;
  return Date.now() >= allowedAt;
}

export function clearPinResetRequest(): void {
  try {
    localStorage.removeItem(RESET_REQUEST_KEY);
  } catch {
    /* ignore */
  }
}
