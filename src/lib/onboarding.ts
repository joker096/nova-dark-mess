export const ONBOARDING_KEY = 'nova_onboarding_v1';

export type OnboardingPath = 'create' | 'restore';

export interface OnboardingRecord {
  version: 1;
  completedAt: string;
  path: OnboardingPath;
}

function readRecord(): OnboardingRecord | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingRecord>;
    if (parsed?.version !== 1) return null;
    return {
      version: 1,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : '',
      path: parsed.path === 'restore' ? 'restore' : 'create',
    };
  } catch {
    return null;
  }
}

/** First launch has no record, so the wizard has to run before the app shell. */
export function isOnboardingComplete(): boolean {
  return readRecord() !== null;
}

export function getOnboardingRecord(): OnboardingRecord | null {
  return readRecord();
}

export function completeOnboarding(path: OnboardingPath = 'create'): OnboardingRecord {
  const record: OnboardingRecord = {
    version: 1,
    completedAt: new Date().toISOString(),
    path,
  };
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(record));
  } catch {
    /* private mode: the wizard simply shows again next launch */
  }
  return record;
}

/** Used when the local identity is wiped so setup runs again from scratch. */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    /* ignore */
  }
}
