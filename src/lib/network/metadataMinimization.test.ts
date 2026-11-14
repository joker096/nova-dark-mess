/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import { padPayload, unpadPayload } from './metadataMinimization';

describe('metadataMinimization', () => {
  it('round-trips padded payload', () => {
    const text = 'secret message';
    const padded = padPayload(text);
    expect(unpadPayload(padded)).toBe(text);
  });

  it('pads to block boundary', () => {
    const padded = padPayload('hi');
    const binary = atob(padded);
    expect(binary.length % 256).toBe(0);
  });
});
