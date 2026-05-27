import { describe, it, expect } from 'vitest';
import { parseM3U } from './m3u-parser';

describe('parseM3U', () => {
    it('should parse basic M3U content', () => {
        const content = `#EXTM3U
#EXTINF:-1 tvg-id="cnn" group-title="News" tvg-logo="cnn.png",CNN International
http://example.com/cnn.m3u8`;

        const channels = parseM3U(content, 'playlist-1');
        expect(channels).toHaveLength(1);
        expect(channels[0].name).toBe('CNN International');
        expect(channels[0].url).toBe('http://example.com/cnn.m3u8');
        expect(channels[0].group).toBe('News');
        expect(channels[0].logo).toBe('cnn.png');
        expect(channels[0].tvgId).toBe('cnn');
        expect(channels[0].playlistId).toBe('playlist-1');
    });

    it('should handle channels without attributes', () => {
        const content = `#EXTM3U
#EXTINF:-1,Simple Channel
http://example.com/simple.m3u8`;

        const channels = parseM3U(content, 'playlist-2');
        expect(channels).toHaveLength(1);
        expect(channels[0].name).toBe('Simple Channel');
        expect(channels[0].group).toBe('Uncategorized');
        expect(channels[0].playlistId).toBe('playlist-2');
    });

    it('should handle raw URLs', () => {
        const content = `http://example.com/raw.m3u8`;
        const channels = parseM3U(content, 'playlist-3');
        expect(channels).toHaveLength(1);
        expect(channels[0].url).toBe('http://example.com/raw.m3u8');
        expect(channels[0].playlistId).toBe('playlist-3');
    });
});
