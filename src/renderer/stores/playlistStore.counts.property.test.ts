import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractCategories } from './playlistStore';
import { Channel } from '../../shared/types';

/**
 * Feature: iptv-core-functionality, Property 8: Category channel counts are consistent
 *
 * Validates: Requirements 4.6
 *
 * For any list of channels, the sum of channel counts across all individual categories
 * should equal the total channel count shown for the "All" category.
 */

// Arbitrary for a group name: non-empty string or undefined (to test "Uncategorized" fallback)
const groupNameArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
  fc.constant('')
);

// Arbitrary for a Channel object with a given group
const channelArb = (group: string): fc.Arbitrary<Channel> =>
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    url: fc.webUrl(),
    group: fc.constant(group),
    logo: fc.option(fc.webUrl(), { nil: undefined }),
    tvgId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    tvgName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    userAgent: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    playlistId: fc.uuid(),
    attributes: fc.constant({} as Record<string, string>),
  });

// Arbitrary for a list of channels with various group values
const channelListArb: fc.Arbitrary<Channel[]> = fc
  .array(groupNameArb, { minLength: 0, maxLength: 30 })
  .chain(groups => {
    if (groups.length === 0) return fc.constant([] as Channel[]);
    return fc.tuple(...groups.map(g => channelArb(g))).map(channels => channels as Channel[]);
  });

describe('Property 8: Category channel counts are consistent', () => {
  /**
   * **Validates: Requirements 4.6**
   */
  it('the total channel count equals the sum of channels across all individual categories', () => {
    fc.assert(
      fc.property(channelListArb, (channels: Channel[]) => {
        const categories = extractCategories(channels);

        // "All" category represents the total count
        const totalCount = channels.length;

        // Get all categories except "All"
        const individualCategories = categories.filter(c => c !== 'All');

        // Sum of channels in each individual category
        let sumOfCategoryCounts = 0;
        for (const category of individualCategories) {
          const channelsInCategory = channels.filter(ch => {
            const group = ch.group || 'Uncategorized';
            return group === category;
          });
          sumOfCategoryCounts += channelsInCategory.length;
        }

        // The total channel count must equal the sum across all individual categories
        expect(sumOfCategoryCounts).toBe(totalCount);
      }),
      { numRuns: 100 }
    );
  });
});
