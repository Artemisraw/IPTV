import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Channel } from '../../shared/types/index';
import { extractCategories } from './playlistStore';

/**
 * Feature: iptv-core-functionality, Property 3: Category extraction produces correct groupings
 *
 * Validates: Requirements 4.1, 4.3, 4.4
 *
 * For any list of channels with various `group` values (including empty/undefined groups),
 * extracting categories should produce a sorted list of unique group names where channels
 * with no group appear under "Uncategorized", and filtering by any category returns exactly
 * the channels belonging to that group.
 */

// Arbitrary for Channel with various group values (including empty strings)
const channelArb: fc.Arbitrary<Channel> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  url: fc.webUrl(),
  group: fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.constant(''),
  ),
  logo: fc.option(fc.webUrl(), { nil: undefined }),
  tvgId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  tvgName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  userAgent: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  playlistId: fc.uuid(),
  attributes: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ maxLength: 100 }),
  ),
});

describe('Property 3: Category extraction produces correct groupings', () => {
  /**
   * **Validates: Requirements 4.1, 4.3, 4.4**
   */
  it('result always starts with "All"', () => {
    fc.assert(
      fc.property(fc.array(channelArb, { minLength: 0, maxLength: 30 }), (channels: Channel[]) => {
        const categories = extractCategories(channels);
        expect(categories[0]).toBe('All');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.1, 4.3, 4.4**
   */
  it('all unique group values appear in the result (empty mapped to "Uncategorized")', () => {
    fc.assert(
      fc.property(fc.array(channelArb, { minLength: 1, maxLength: 30 }), (channels: Channel[]) => {
        const categories = extractCategories(channels);

        // Compute expected unique groups
        const expectedGroups = new Set<string>();
        for (const channel of channels) {
          expectedGroups.add(channel.group || 'Uncategorized');
        }

        // Every expected group should be in the categories (after "All")
        for (const group of expectedGroups) {
          expect(categories).toContain(group);
        }

        // No extra categories beyond "All" + expected groups
        const categoriesAfterAll = categories.slice(1);
        expect(categoriesAfterAll.length).toBe(expectedGroups.size);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.1, 4.3, 4.4**
   */
  it('categories after "All" are sorted alphabetically', () => {
    fc.assert(
      fc.property(fc.array(channelArb, { minLength: 1, maxLength: 30 }), (channels: Channel[]) => {
        const categories = extractCategories(channels);
        const categoriesAfterAll = categories.slice(1);

        // Verify sorted using localeCompare
        for (let i = 0; i < categoriesAfterAll.length - 1; i++) {
          expect(categoriesAfterAll[i].localeCompare(categoriesAfterAll[i + 1])).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.1, 4.3, 4.4**
   */
  it('filtering channels by any returned category gives exactly the channels with that group value', () => {
    fc.assert(
      fc.property(fc.array(channelArb, { minLength: 1, maxLength: 30 }), (channels: Channel[]) => {
        const categories = extractCategories(channels);
        const categoriesAfterAll = categories.slice(1);

        for (const category of categoriesAfterAll) {
          // Filter channels that belong to this category
          const filtered = channels.filter((ch) => {
            const group = ch.group || 'Uncategorized';
            return group === category;
          });

          // There should be at least one channel for each category
          expect(filtered.length).toBeGreaterThan(0);

          // Every channel in filtered should have the matching group
          for (const ch of filtered) {
            const group = ch.group || 'Uncategorized';
            expect(group).toBe(category);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
