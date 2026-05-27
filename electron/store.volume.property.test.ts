import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { clamp } from './store';

/**
 * Feature: iptv-core-functionality, Property 5: Volume clamping invariant
 *
 * **Validates: Requirements 2.2, 2.7, 2.8**
 *
 * For any integer value passed to setVolume, the resulting persisted volume
 * should be clamped to the range [0, 100]. Values below 0 become 0, values
 * above 100 become 100, and values within range are stored as-is.
 */
describe('Property 5: Volume clamping invariant', () => {
  it('clamp(value, 0, 100) always produces a result in [0, 100]', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const result = clamp(value, 0, 100);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 }
    );
  });

  it('values already in [0, 100] are unchanged', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (value) => {
        const result = clamp(value, 0, 100);
        expect(result).toBe(value);
      }),
      { numRuns: 100 }
    );
  });

  it('values below 0 become 0', () => {
    fc.assert(
      fc.property(fc.integer({ max: -1 }), (value) => {
        const result = clamp(value, 0, 100);
        expect(result).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('values above 100 become 100', () => {
    fc.assert(
      fc.property(fc.integer({ min: 101 }), (value) => {
        const result = clamp(value, 0, 100);
        expect(result).toBe(100);
      }),
      { numRuns: 100 }
    );
  });
});
