import { v4 as uuidv4 } from 'uuid';
import { Channel } from '../types';

export function parseM3U(content: string, playlistId: string): Channel[] {
    const lines = content.split(/\r?\n/);
    const channels: Channel[] = [];
    let currentChannel: Partial<Channel> = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            // Example: #EXTINF:-1 tvg-id="cnn" group-title="News",CNN
            // Remove header
            const info = line.substring(8);
            // Find the first comma that is outside of quotes to separate attributes from name
            let commaIndex = -1;
            let inQuotes = false;
            for (let j = 0; j < info.length; j++) {
                if (info[j] === '"') {
                    inQuotes = !inQuotes;
                } else if (info[j] === ',' && !inQuotes) {
                    commaIndex = j;
                    break;
                }
            }

            let meta = info;
            let name = '';

            if (commaIndex !== -1) {
                meta = info.substring(0, commaIndex);
                name = info.substring(commaIndex + 1).trim();
            }

            const attributes: Record<string, string> = {};
            // Regex to match key="value"
            // Note: this is a simple regex and might fail on complex nested quotes, but standard for M3U
            const regex = /([a-zA-Z0-9-]+)="([^"]*)"/g;
            let match;
            while ((match = regex.exec(meta)) !== null) {
                attributes[match[1]] = match[2];
            }

            currentChannel = {
                id: uuidv4(),
                name,
                attributes,
                logo: attributes['tvg-logo'],
                group: attributes['group-title'] || 'Uncategorized',
                tvgId: attributes['tvg-id'],
                tvgName: attributes['tvg-name'],
                playlistId,
            };
        } else if (!line.startsWith('#')) {
            // It's a URL
            if (currentChannel.id) {
                currentChannel.url = line;
                channels.push(currentChannel as Channel);
                currentChannel = {}; // reset
            } else {
                // Handle URL without EXTINF? 
                // Some M3Us might just be list of URLs. 
                // For now, only support EXTINF preceded URLs or generate basic info
                channels.push({
                    id: uuidv4(),
                    name: line.substring(line.lastIndexOf('/') + 1) || 'Unknown Channel',
                    url: line,
                    attributes: {},
                    group: 'Uncategorized',
                    playlistId,
                });
            }
        }
    }

    return channels;
}
