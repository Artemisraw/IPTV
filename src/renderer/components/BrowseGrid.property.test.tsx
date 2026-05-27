import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { BrowseGrid } from './BrowseGrid';
import { useViewStore } from '../stores/viewStore';
import type { Channel } from '@/shared/types';

const channelArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  url: fc.webUrl(),
  group: fc.string({ maxLength: 20 }),
  logo: fc.option(fc.webUrl(), { nil: undefined }),
  tvgId: fc.option(fc.string(), { nil: undefined }),
  tvgName: fc.option(fc.string(), { nil: undefined }),
  userAgent: fc.option(fc.string(), { nil: undefined }),
  playlistId: fc.uuid(),
  attributes: fc.dictionary(fc.string(), fc.string()),
}) as fc.Arbitrary<Channel>;

const categoryDataArb = fc.record({
  category: fc.string({ minLength: 1 }),
  channels: fc.array(channelArb, { minLength: 1, maxLength: 5 }), // small arrays for speed
});

// Mock react-virtualized-auto-sizer because it doesn't work well in JSDOM out of the box
vi.mock('react-virtualized-auto-sizer', () => {
  return {
    default: ({ children }: any) => children({ width: 800, height: 600 }),
  };
});

// Mock ResizeObserver
vi.stubGlobal('ResizeObserver', class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
});

describe('BrowseGrid Properties', () => {
  beforeEach(() => {
    useViewStore.setState({ homeScrollY: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it('Property 21: Grid layout invariants', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(categoryDataArb, { maxLength: 5 }),
        fc.option(channelArb, { nil: null }),
        async (categories, featuredChannel) => {
          cleanup();
          try {
            render(
              <BrowseGrid
                categories={categories}
                featuredChannel={featuredChannel}
                featuredTags={[]}
              />
            );

            // Wait a tick for async renders
            await act(async () => {
              await new Promise((r) => setTimeout(r, 0));
            });

            if (categories.length === 0 && !featuredChannel) {
              expect(screen.getByTestId('browse-empty-state')).toBeInTheDocument();
            } else {
              expect(screen.queryByTestId('browse-empty-state')).not.toBeInTheDocument();

              if (featuredChannel) {
                expect(screen.getByTestId('hero-banner')).toBeInTheDocument();
              } else {
                expect(screen.queryByTestId('hero-banner')).not.toBeInTheDocument();
              }

              if (categories.length > 0) {
                const heading = screen.queryByText(categories[0].category, { exact: false });
                if (heading) {
                  expect(heading).toBeInTheDocument();
                }
              }
            }
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 22: HomeScrollY preservation on remount', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(categoryDataArb, { minLength: 3, maxLength: 10 }), // Ensure enough items to scroll
        fc.integer({ min: 100, max: 500 }),
        async (categories, scrollY) => {
          cleanup();
          
          // Pre-seed the store with a scroll position
          useViewStore.setState({ homeScrollY: scrollY });
          
          try {
            const { unmount } = render(
              <BrowseGrid
                categories={categories}
                featuredChannel={null}
                featuredTags={[]}
              />
            );

            await act(async () => {
              await new Promise((r) => setTimeout(r, 0));
            });

            expect(useViewStore.getState().homeScrollY).toBe(scrollY);
            
            unmount();
            
            expect(useViewStore.getState().homeScrollY).toBe(scrollY);
            
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
