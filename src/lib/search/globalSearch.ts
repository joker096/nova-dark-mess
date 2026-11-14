/**
 * Local, in-memory global search across chats, channels and shared media.
 * No server index is involved: callers pass the already-decrypted local data.
 */

export type GlobalSearchKind = 'message' | 'channel-post' | 'media' | 'file';

export interface GlobalSearchItem {
  id: string;
  chatId: string;
  chatName: string;
  chatAvatar?: string;
  kind: GlobalSearchKind;
  text: string;
  senderName?: string;
  time?: string;
  timestamp?: number;
}

export interface GlobalSearchResult extends GlobalSearchItem {
  score: number;
  matchedTerms: string[];
}

export interface GlobalSearchOptions {
  kinds?: GlobalSearchKind[];
  limit?: number;
  caseSensitive?: boolean;
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase();
}

export function tokenizeQuery(query: string): string[] {
  return query
    .split(/\s+/)
    .map(normalizeTerm)
    .filter((term) => term.length > 0);
}

function scoreText(text: string, terms: string[], caseSensitive: boolean): number {
  if (terms.length === 0) return 0;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needles = caseSensitive ? terms : terms.map((term) => term.toLowerCase());

  let score = 0;
  let matched = 0;
  for (const term of needles) {
    const index = haystack.indexOf(term);
    if (index !== -1) {
      matched += 1;
      // Prefer matches near the start and exact-ish matches.
      score += 10 + Math.max(0, 5 - Math.floor(index / 10));
      if (haystack === term) score += 25;
    }
  }

  if (matched === 0) return 0;
  // Require all terms for multi-word queries.
  if (matched < terms.length) return 0;
  return score;
}

export function searchGlobal(
  items: GlobalSearchItem[],
  query: string,
  options: GlobalSearchOptions = {},
): GlobalSearchResult[] {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];

  const allowedKinds = options.kinds ? new Set(options.kinds) : null;
  const limit = options.limit ?? 50;
  const caseSensitive = options.caseSensitive ?? false;

  const results: GlobalSearchResult[] = [];

  for (const item of items) {
    if (allowedKinds && !allowedKinds.has(item.kind)) continue;
    const text = item.text ?? '';
    const score = scoreText(text, terms, caseSensitive);
    if (score <= 0) continue;

    const matchedTerms = terms.filter((term) => {
      const haystack = caseSensitive ? text : text.toLowerCase();
      return haystack.includes(caseSensitive ? term : term.toLowerCase());
    });

    results.push({ ...item, score, matchedTerms });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.timestamp ?? 0) - (a.timestamp ?? 0);
  });

  return results.slice(0, limit);
}

export function buildSearchSnippet(text: string, query: string, radius = 40): string {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return text.slice(0, radius * 2);

  const lower = text.toLowerCase();
  let firstIndex = -1;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index;
    }
  }

  if (firstIndex === -1) return text.slice(0, radius * 2);

  const start = Math.max(0, firstIndex - radius);
  const end = Math.min(text.length, firstIndex + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}
