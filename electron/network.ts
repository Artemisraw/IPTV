import { NetworkError, TimeoutError, HttpError } from '../src/shared/types/index';

const DEFAULT_TIMEOUT_MS = 30000;

export class NetworkManager {
  /**
   * Fetches playlist content from the given URL.
   * @param url - The M3U playlist URL to fetch
   * @param timeoutMs - Timeout in milliseconds (defaults to 30000)
   * @returns Raw M3U content string
   * @throws NetworkError on network failure
   * @throws TimeoutError if the request exceeds the timeout
   * @throws HttpError on non-2xx HTTP response
   */
  async fetchPlaylist(url: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new HttpError(
          `HTTP error ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      return await response.text();
    } catch (error: unknown) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }

      if (error instanceof TypeError) {
        throw new NetworkError(`Network request failed: ${error.message}`);
      }

      throw new NetworkError(
        `Network request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
