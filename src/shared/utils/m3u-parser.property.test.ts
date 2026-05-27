import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseM3U } from './m3u-parser';

/**
 * Feature: iptv-core-functionality, Property 1: M3U parsing round-trip preserves channel data
 *
 * Validates: Requirements 3.1
 *
 * For any valid M3U content string containing EXTINF entries with names, group-titles,
 * logos, and URLs, parsing the content should produce Channel objects where each channel's
 * `name`, `url`, `group`, and `logo` fields match the corresponding values in the original M3U text.
 */

// Arbitrary for a channel name: non-empty string without commas or newlines,
// and no leading/trailing whitespace (parser trims names)
const channelNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.includes(',') && !s.includes('\n') && !s.includes('\r'));

// Arbitrary for group-title: non-empty string without quotes or newlines
const groupTitleArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => !s.includes('"') && !s.includes('\n') && !s.includes('\r') && s.trim().length > 0);

// Arbitrary for tvg-logo URL (optional)
const tvgLogoArb = fc.option(fc.webUrl(), { nil: undefined });

// Arbitrary for stream URL (valid URL format)
const streamUrlArb = fc.webUrl();

// Arbitrary for a single M3U entry
interface M3UEntry {
  name: string;
  groupTitle: string;
  tvgLogo: string | undefined;
  streamUrl: string;
}

const m3uEntryArb: fc.Arbitrary<M3UEntry> = fc.record({
  name: channelNameArb,
  groupTitle: groupTitleArb,
  tvgLogo: tvgLogoArb,
  streamUrl: streamUrlArb,
});

// Build a valid M3U string from generated entries
function buildM3UContent(entries: M3UEntry[]): string {
  const lines: string[] = ['#EXTM3U'];

  for (const entry of entries) {
    let attributes = `group-title="${entry.groupTitle}"`;
    if (entry.tvgLogo !== undefined) {
      attributes += ` tvg-logo="${entry.tvgLogo}"`;
    }
    lines.push(`#EXTINF:-1 ${attributes},${entry.name}`);
    lines.push(entry.streamUrl);
  }

  return lines.join('\n');
}

describe('Property 1: M3U parsing round-trip preserves channel data', () => {
  /**
   * **Validates: Requirements 3.1**
   */
  it('parsing a constructed M3U string preserves all channel data', () => {
    fc.assert(
      fc.property(
        fc.array(m3uEntryArb, { minLength: 1, maxLength: 20 }),
        fc.uuid(),
        (entries: M3UEntry[], playlistId: string) => {
          const m3uContent = buildM3UContent(entries);
          const channels = parseM3U(m3uContent, playlistId);

          // Number of parsed channels equals number of generated entries
          expect(channels.length).toBe(entries.length);

          // Each channel's fields match the generated data
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const channel = channels[i];

            expect(channel.name).toBe(entry.name);
            expect(channel.url).toBe(entry.streamUrl);
            expect(channel.group).toBe(entry.groupTitle);
            expect(channel.playlistId).toBe(playlistId);

            if (entry.tvgLogo !== undefined) {
              expect(channel.logo).toBe(entry.tvgLogo);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
