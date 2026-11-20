const DRAFT_PREFIX = 'nova_draft_';
const DRAFT_EVENT = 'nova:draft:change';

export function getDraft(chatId: string): string {
  if (typeof window === 'undefined' || !chatId) return '';
  try {
    return localStorage.getItem(`${DRAFT_PREFIX}${chatId}`) || '';
  } catch {
    return '';
  }
}

export function setDraft(chatId: string, text: string): void {
  if (typeof window === 'undefined' || !chatId) return;
  try {
    const trimmed = text.trim();
    if (!trimmed) {
      localStorage.removeItem(`${DRAFT_PREFIX}${chatId}`);
    } else {
      localStorage.setItem(`${DRAFT_PREFIX}${chatId}`, text);
    }
    window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { chatId, text: trimmed } }));
  } catch {
    // Ignore localStorage quota or private mode errors
  }
}

export function clearDraft(chatId: string): void {
  if (typeof window === 'undefined' || !chatId) return;
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${chatId}`);
    window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { chatId, text: '' } }));
  } catch {
    // Ignore localStorage errors
  }
}

export function getAllDrafts(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const drafts: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DRAFT_PREFIX)) {
        const chatId = key.slice(DRAFT_PREFIX.length);
        const val = localStorage.getItem(key);
        if (val && val.trim()) {
          drafts[chatId] = val;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return drafts;
}

export function subscribeDraftChanges(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = () => callback();
  window.addEventListener(DRAFT_EVENT, listener);
  return () => window.removeEventListener(DRAFT_EVENT, listener);
}
