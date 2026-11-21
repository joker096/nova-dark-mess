import { describe, expect, it } from 'vitest';
import { isAllowedMiniAppUrl, normalizeMiniAppOrigin, parseMiniAppOrigins } from './miniAppOrigins';

describe('Mini App origin allowlist', () => {
  it('normalizes http(s) origins and drops invalid entries', () => {
    expect(normalizeMiniAppOrigin('https://apps.example.com/path?x=1')).toBe('https://apps.example.com');
    expect(normalizeMiniAppOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(normalizeMiniAppOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizeMiniAppOrigin('https://user:pass@apps.example.com')).toBeNull();
    expect(normalizeMiniAppOrigin('not a url')).toBeNull();
  });

  it('parses a comma-separated list, deduplicates and keeps order', () => {
    expect(
      parseMiniAppOrigins(
        ' https://apps.example.com,https://apps.example.com/path,http://localhost:5173,bad ',
      ),
    ).toEqual(['https://apps.example.com', 'http://localhost:5173']);
    expect(parseMiniAppOrigins(undefined)).toEqual([]);
  });

  it('allows only exact allowlisted origins', () => {
    const origins = ['https://apps.example.com'];

    expect(isAllowedMiniAppUrl('https://apps.example.com/echo/', origins)).toBe(true);
    expect(isAllowedMiniAppUrl('https://apps.example.com.evil.test/echo', origins)).toBe(false);
    expect(isAllowedMiniAppUrl('https://other.example.com/echo', origins)).toBe(false);
    expect(isAllowedMiniAppUrl('http://apps.example.com/echo', origins)).toBe(false);
    expect(isAllowedMiniAppUrl('javascript:alert(1)', origins)).toBe(false);
  });

  it('denies every remote Mini App when the allowlist is empty', () => {
    expect(isAllowedMiniAppUrl('https://example.com/app', [])).toBe(false);
  });
});
