import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, toSafeExternalUrl } from './safeUrl';

describe('safe external URLs', () => {
  it('accepts http, https and mailto links', () => {
    expect(isSafeExternalUrl('https://example.com/path?q=1')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
    expect(isSafeExternalUrl('mailto:help@example.com')).toBe(true);
  });

  it('rejects script, data and local-file schemes', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects scheme obfuscation with control characters and whitespace', () => {
    expect(isSafeExternalUrl('java\nscript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('javascript\u0000:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('  ')).toBe(false);
  });

  it('rejects relative and non-string values', () => {
    expect(isSafeExternalUrl('/relative/path')).toBe(false);
    expect(isSafeExternalUrl('example.com')).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
    expect(isSafeExternalUrl(42)).toBe(false);
  });

  it('normalizes accepted URLs', () => {
    expect(toSafeExternalUrl(' https://example.com ')).toBe('https://example.com/');
    expect(toSafeExternalUrl('javascript:alert(1)')).toBeNull();
  });
});
