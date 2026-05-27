import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkManager } from './network';
import { NetworkError, TimeoutError, HttpError } from '../src/shared/types/index';

describe('NetworkManager', () => {
  let networkManager: NetworkManager;

  beforeEach(() => {
    networkManager = new NetworkManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPlaylist', () => {
    it('should return M3U content on successful fetch', async () => {
      const m3uContent = '#EXTM3U\n#EXTINF:-1,Channel 1\nhttp://example.com/stream.m3u8';
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(m3uContent, { status: 200 })
      );

      const result = await networkManager.fetchPlaylist('http://example.com/playlist.m3u');
      expect(result).toBe(m3uContent);
    });

    it('should throw HttpError on non-2xx response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      );

      await expect(
        networkManager.fetchPlaylist('http://example.com/missing.m3u')
      ).rejects.toThrow(HttpError);

      await expect(
        networkManager.fetchPlaylist('http://example.com/missing.m3u')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should throw TimeoutError when request exceeds timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            const signal = options?.signal as AbortSignal;
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          })
      );

      await expect(
        networkManager.fetchPlaylist('http://example.com/slow.m3u', 50)
      ).rejects.toThrow(TimeoutError);
    });

    it('should throw NetworkError on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new TypeError('fetch failed')
      );

      await expect(
        networkManager.fetchPlaylist('http://unreachable.example.com/playlist.m3u')
      ).rejects.toThrow(NetworkError);
    });

    it('should use default timeout of 30000ms', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('#EXTM3U', { status: 200 })
      );

      await networkManager.fetchPlaylist('http://example.com/playlist.m3u');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://example.com/playlist.m3u',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should throw HttpError with correct status code for 500 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
      );

      try {
        await networkManager.fetchPlaylist('http://example.com/error.m3u');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).statusCode).toBe(500);
      }
    });
  });
});
