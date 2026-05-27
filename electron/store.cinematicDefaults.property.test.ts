import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { StoreManager } from './store';

// We use a global to inject the generated initial state into the mock.
let mockStoreState: Record<string, any> = {};

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private state: Record<string, any>;
      constructor() {
        // Initialize from the global injected state
        this.state = { ...mockStoreState };
      }
      get(key: string) {
        return this.state[key];
      }
      set(key: string, value: any) {
        this.state[key] = value;
      }
      get store() {
        return this.state;
      }
      clear() {
        this.state = {};
      }
    }
  };
});

describe('Property 13: PersistedState defaults are correct on missing fields', () => {
  beforeEach(() => {
    mockStoreState = {};
  });

  const partialStateArb = fc.record({
    playlists: fc.array(fc.anything(), { maxLength: 5 }),
    favorites: fc.array(fc.uuid(), { maxLength: 5 }),
    volume: fc.integer({ min: 0, max: 100 }),
    muted: fc.boolean(),
  }, { requiredKeys: [] });

  it('missing fields are initialized to defaults', () => {
    fc.assert(
      fc.property(partialStateArb, (partialState) => {
        // Inject the partial state (missing cinematic fields)
        mockStoreState = { ...partialState };

        const storeManager = new StoreManager();
        const all = storeManager.getAll();

        expect(all.showUncategorized).toBe(false);
        expect(all.currentView).toBe('home');
        expect(all.recentlyPlayedChannelIds).toEqual([]);
      }),
      { numRuns: 200 }
    );
  });

  const corruptedStateArb = fc.record({
    currentView: fc.string().filter(s => s !== 'home' && s !== 'fullPlayer'),
    recentlyPlayedChannelIds: fc.array(fc.anything(), { minLength: 15, maxLength: 20 }),
    showUncategorized: fc.anything().filter(v => typeof v !== 'boolean'),
  });

  it('corrupted fields are repaired to safe values', () => {
    fc.assert(
      fc.property(corruptedStateArb, (corrupted) => {
        mockStoreState = { ...corrupted };

        const storeManager = new StoreManager();
        const all = storeManager.getAll();

        expect(all.currentView).toBe('home');
        expect(all.recentlyPlayedChannelIds.length).toBeLessThanOrEqual(10);
        // showUncategorized should be boolean coerced
        expect(typeof all.showUncategorized).toBe('boolean');
        expect(all.recentlyPlayedChannelIds.every(id => typeof id === 'string')).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
