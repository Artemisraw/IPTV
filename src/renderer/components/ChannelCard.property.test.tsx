import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChannelCard } from './ChannelCard';
import type { Channel } from '@/shared/types';

// Arbitrary for Channel
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

describe('ChannelCard Properties', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('Property 16: ChannelCard exposes the full channel name', async () => {
    await fc.assert(
      fc.asyncProperty(channelArb, async (channel) => {
        cleanup();
        const onPlay = vi.fn();
        const onToggleFavorite = vi.fn();
        
        try {
          render(
            <ChannelCard 
              channel={channel} 
              width={200} 
              height={112} 
              isFavorite={false} 
              onPlay={onPlay} 
              onToggleFavorite={onToggleFavorite} 
            />
          );

          const card = screen.getByTestId('channel-card');
          expect(card).toHaveAttribute('aria-label', channel.name);
          expect(card).toHaveAttribute('title', channel.name);
          
          const spans = document.querySelectorAll('span[title]');
          expect(spans.length).toBe(1);
          expect(spans[0].getAttribute('title')).toBe(channel.name);
          expect(spans[0].textContent).toBe(channel.name);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property 17: ChannelCard fallback rendering predicate', async () => {
    await fc.assert(
      fc.asyncProperty(channelArb, async (channel) => {
        cleanup();
        vi.useFakeTimers();
        const onPlay = vi.fn();
        const onToggleFavorite = vi.fn();
        
        try {
          render(
            <ChannelCard 
              channel={channel} 
              width={200} 
              height={112} 
              isFavorite={false} 
              onPlay={onPlay} 
              onToggleFavorite={onToggleFavorite} 
            />
          );

          if (!channel.logo) {
            expect(screen.getByTestId('channel-card-fallback')).toBeInTheDocument();
            expect(screen.queryByTestId('channel-card-logo')).not.toBeInTheDocument();
          } else {
            expect(screen.getByTestId('channel-card-logo')).toBeInTheDocument();
            expect(screen.queryByTestId('channel-card-fallback')).not.toBeInTheDocument();

            act(() => {
              vi.advanceTimersByTime(5000);
            });
            expect(screen.getByTestId('channel-card-fallback')).toBeInTheDocument();
          }
        } finally {
          cleanup();
          vi.useRealTimers();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property 18: Failed logo URLs are not retried during a view session', async () => {
    await fc.assert(
      fc.asyncProperty(channelArb, async (channel) => {
        fc.pre(!!channel.logo);
        cleanup();
        vi.useFakeTimers();
        const onPlay = vi.fn();
        const onToggleFavorite = vi.fn();
        
        try {
          const { rerender } = render(
            <ChannelCard 
              channel={channel} 
              width={200} 
              height={112} 
              isFavorite={false} 
              onPlay={onPlay} 
              onToggleFavorite={onToggleFavorite} 
            />
          );

          expect(screen.getByTestId('channel-card-logo')).toBeInTheDocument();
          
          act(() => {
            fireEvent.error(screen.getByTestId('channel-card-logo'));
          });
          
          expect(screen.getByTestId('channel-card-fallback')).toBeInTheDocument();
          
          rerender(
            <ChannelCard 
              channel={{ ...channel }} 
              width={200} 
              height={112} 
              isFavorite={false} 
              onPlay={onPlay} 
              onToggleFavorite={onToggleFavorite} 
            />
          );
          
          expect(screen.getByTestId('channel-card-fallback')).toBeInTheDocument();
          expect(screen.queryByTestId('channel-card-logo')).not.toBeInTheDocument();
        } finally {
          cleanup();
          vi.useRealTimers();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property 19: Click handlers route correctly and do not interfere', async () => {
    const user = userEvent.setup();
    await fc.assert(
      fc.asyncProperty(channelArb, fc.boolean(), async (channel, isFavorite) => {
        cleanup();
        const onPlay = vi.fn();
        const onToggleFavorite = vi.fn();
        
        try {
          render(
            <ChannelCard 
              channel={channel} 
              width={200} 
              height={112} 
              isFavorite={isFavorite} 
              onPlay={onPlay} 
              onToggleFavorite={onToggleFavorite} 
            />
          );

          const favButton = screen.getByTestId('channel-card-favorite');
          await user.click(favButton);
          
          expect(onToggleFavorite).toHaveBeenCalledWith(channel.id);
          expect(onPlay).not.toHaveBeenCalled();
          
          onToggleFavorite.mockClear();
          
          const card = screen.getByTestId('channel-card');
          await user.click(card);
          
          expect(onPlay).toHaveBeenCalledWith(channel);
          expect(onToggleFavorite).not.toHaveBeenCalled();
        } finally {
          cleanup();
        }
      }),
      { numRuns: 50 }
    );
  });

  it('Property 20: Keyboard activation on a focused ChannelCard plays the channel', async () => {
    await fc.assert(
      fc.asyncProperty(channelArb, fc.constantFrom('Enter', ' '), async (channel, key) => {
        cleanup();
        const onPlay = vi.fn();
        const onToggleFavorite = vi.fn();
        
        try {
          render(
            <ChannelCard 
              channel={channel} 
              width={200} 
              height={112} 
              isFavorite={false} 
              onPlay={onPlay} 
              onToggleFavorite={onToggleFavorite} 
            />
          );

          const card = screen.getByTestId('channel-card');
          card.focus();
          
          fireEvent.keyDown(card, { key });
          
          expect(onPlay).toHaveBeenCalledWith(channel);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  });
});
