import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { useViewStore } from './viewStore';
import { usePlayerStore } from './playerStore';
import type { ViewName } from '../../shared/types';

describe('ViewStore Properties', () => {
  let mockStoreState: Record<string, any> = {};

  beforeEach(() => {
    mockStoreState = {};
    
    // Mock electronAPI
    (global as any).window = {
      electronAPI: {
        store: {
          get: vi.fn(async (key: string) => mockStoreState[key]),
          set: vi.fn(async (key: string, value: any) => {
            mockStoreState[key] = value;
          }),
          getAll: vi.fn(async () => mockStoreState),
        }
      }
    };

    // Reset Zustand stores
    useViewStore.setState({
      currentView: 'home',
      homeScrollY: 0,
      mpvRect: null,
    });
    usePlayerStore.setState({
      status: 'idle',
      currentChannel: null,
      error: null,
      volume: 50,
      muted: false,
      recentlyPlayedChannelIds: [],
    });
  });

  const commandsArb = fc.array(
    fc.oneof(
      fc.constantFrom('home', 'fullPlayer').map(view => ({ type: 'setView', value: view })),
      fc.integer({ min: 0, max: 10000 }).map(y => ({ type: 'setHomeScrollY', value: y }))
    ),
    { maxLength: 50 }
  );

  it('Property 10: View changes do not modify PlayerStore', async () => {
    await fc.assert(
      fc.asyncProperty(commandsArb, async (commands) => {
        const initialPlayerState = usePlayerStore.getState();

        for (const cmd of commands) {
          if (cmd.type === 'setView') {
            await useViewStore.getState().setView(cmd.value as ViewName);
          } else if (cmd.type === 'setHomeScrollY') {
            useViewStore.getState().setHomeScrollY(cmd.value as number);
          }
        }

        const finalPlayerState = usePlayerStore.getState();
        expect(finalPlayerState).toEqual(initialPlayerState);
      }),
      { numRuns: 200 }
    );
  });

  it('Property 11: currentView round-trips through persistence', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('home', 'fullPlayer'), async (view) => {
        await useViewStore.getState().setView(view as ViewName);
        
        // Clear in-memory state
        useViewStore.setState({ currentView: 'home' }); // Reset to default to ensure load works
        
        await useViewStore.getState().loadFromPersisted();
        
        expect(useViewStore.getState().currentView).toBe(view);
      }),
      { numRuns: 200 }
    );
  });

  it('Property 12: homeScrollY round-trips across home→fullPlayer→home', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 10000 }), async (scrollY) => {
        const store = useViewStore.getState();
        
        // Set view to home
        await store.setView('home');
        
        // Scroll
        store.setHomeScrollY(scrollY);
        
        // Switch to fullPlayer
        await store.setView('fullPlayer');
        
        // At this point, we assume the component tree might preserve `homeScrollY` in the store.
        // The store is in-memory and shouldn't clobber it just because view changed.
        
        // Switch back to home
        await store.setView('home');
        
        expect(useViewStore.getState().homeScrollY).toBe(scrollY);
      }),
      { numRuns: 200 }
    );
  });
});
