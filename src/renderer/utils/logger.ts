import type { LogLevel } from '@/shared/types';

/**
 * Renderer-side logger that mirrors output to both:
 *   - The DevTools console (via console.{debug,info,warn,error})
 *   - The main process terminal (via IPC `log:write`)
 *
 * This makes errors and state transitions visible in the terminal where
 * the dev server runs, even when DevTools is closed.
 */

function send(level: LogLevel, tag: string, message: string, data?: unknown): void {
  // Always log to the renderer console
  const consoleFn =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    level === 'info' ? console.info :
    console.debug;
  if (data !== undefined) {
    consoleFn(`[${tag}] ${message}`, data);
  } else {
    consoleFn(`[${tag}] ${message}`);
  }

  // Forward to main process terminal (best effort, fire-and-forget)
  try {
    window.electronAPI?.log?.write?.(level, tag, message, serializeData(data));
  } catch {
    // Ignore — renderer logger should never throw
  }
}

/** Serialize structured data so it survives IPC (handles Errors, Sets, etc.) */
function serializeData(data: unknown): unknown {
  if (data === undefined || data === null) return data;
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  if (data instanceof Set) return [...data];
  if (data instanceof Map) return Object.fromEntries(data);
  if (typeof data === 'object') {
    try {
      // Round-trip through JSON to drop functions and circular refs
      return JSON.parse(JSON.stringify(data));
    } catch {
      return String(data);
    }
  }
  return data;
}

export const logger = {
  debug: (tag: string, message: string, data?: unknown) => send('debug', tag, message, data),
  info: (tag: string, message: string, data?: unknown) => send('info', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => send('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => send('error', tag, message, data),
};
