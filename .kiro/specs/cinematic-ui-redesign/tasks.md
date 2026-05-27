# Implementation Plan: Cinematic UI Redesign

## Overview

This plan converts the cinematic-ui-redesign design into a dependency-ordered, incremental code path. Work starts with pure utilities (which are testable in isolation via property-based tests), then extends the persistence and store layers, then builds the central MPV surface management primitive, then composes UI components from the bottom up (cards → rows → grid → views), and finally wires everything together in `App.tsx`. The existing core-functionality stack (shared types, IPC bridge, MPV `--wid` integration, `electron-store`, M3U parser, FavoritesStore base) is preserved; legacy components (`AppLayout`, `Sidebar`, `CategoryList`, `ChannelList`, `IdleView`, `LoadingView`, `ErrorView`, `PlayerView`) remain in the repo but stop being rendered after the App.tsx rewrite.

All 24 correctness properties from the design's Testing Strategy section are mapped to property-test tasks below. Property tests are mandatory; unit and integration tests are marked optional with `*` so they can be skipped for an MVP path without sacrificing the property coverage.

## Tasks

- [x] 1. Set up new dev dependencies and test environment
  - [x] 1.1 Install component-test dependencies
    - Add `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom` as devDependencies in `package.json`
    - Pin `react-window` at the existing `1.8.10` (no change), confirm `fast-check@4.8.0` and `vitest@^4.0.18` are present
    - Run `npm install` to refresh `package-lock.json`
    - _Requirements: 11.1, 11.5_

  - [x] 1.2 Configure Vitest for JSDOM and component testing
    - Create `vitest.config.ts` at the repo root that extends the existing `vite.config.ts`, sets `test.environment = 'jsdom'`, registers `test.setupFiles = ['./src/tests/setup-tests.ts']` (which imports `@testing-library/jest-dom`), and includes `**/*.property.test.ts(x)` and `**/*.test.ts(x)` patterns
    - Create `src/tests/setup-tests.ts` that imports `@testing-library/jest-dom/vitest` and resets all mocks between tests
    - _Requirements: 11.1_

- [x] 2. Extend shared types for the new persisted state
  - [x] 2.1 Add `ViewName` and extend `PersistedState`
    - In `src/shared/types/index.ts`, add `export type ViewName = 'home' | 'fullPlayer';`
    - Extend `PersistedState` with `showUncategorized: boolean`, `currentView: ViewName`, and `recentlyPlayedChannelIds: string[]`
    - Do not add new IPC channels — existing `store.get` / `store.set` / `store.getAll` cover the new fields
    - _Requirements: 1.1, 6.1, 9.5, 2.4_

- [x] 3. Implement pure utilities (extractor, hero selector, ring buffer, card sizing)
  - [x] 3.1 Implement `extractCategoriesV2`
    - Create `src/shared/utils/categoryExtractor.ts` exporting `extractCategoriesV2(channels, options): ExtractedCategories` along with the `ExtractedCategories` and `ExtractOptions` interfaces
    - Implement the algorithm from the design: split each `group` on `;`, trim, drop empties, classify uncategorized when group is missing/empty/`undefined`/`uncategorized` (case-insensitive on trimmed value), build a `Favorites`-first then locale-alphabetical-sorted (`Intl.Collator(undefined, { sensitivity: 'variant' })`) ordered map, append `Uncategorized` last when `showUncategorized` is true
    - Export `uncategorizedCount` on the result
    - The function must be pure — no `Date`, `Math.random`, `console`, or IPC
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.2, 6.3, 6.4_

  - [x] 3.2 Write property tests for `extractCategoriesV2`
    - Create `src/shared/utils/categoryExtractor.property.test.ts`
    - **Property 1: Category membership matches semicolon-split tag set** _Validates: Requirements 5.1, 5.2, 5.3, 5.4_
    - **Property 2: Case-sensitive deduplication preserves source casing** _Validates: Requirements 5.5_
    - **Property 3: CategoryExtractor is pure and deterministic** (mock `Date.now`/`Math.random` to throw and run twice) _Validates: Requirements 5.6_
    - **Property 4: Uncategorized classification rule** _Validates: Requirements 6.2_
    - **Property 5: `showUncategorized` toggles the uncategorized bucket atomically** _Validates: Requirements 6.3, 6.4_
    - **Property 6: `uncategorizedCount` equals the size of the uncategorized bucket** _Validates: Requirements 6.7_
    - **Property 7: Row ordering is Favorites-first then locale-alphabetical** _Validates: Requirements 3.2_
    - Each `test()` is tagged inline with its property number; `numRuns: 500` for these pure-function properties

  - [x] 3.3 Implement `selectFeaturedChannel`
    - Create `src/renderer/utils/heroSelector.ts` exporting `selectFeaturedChannel(channels, recentlyPlayedChannelIds, favoriteIds): Channel | null`
    - Algorithm: empty channels → `null`; otherwise first matching id from `recentlyPlayedChannelIds` (MRU), else first favorited channel in input order, else `channels[0]`
    - Pure function — no side effects, no time, no random
    - _Requirements: 2.4_

  - [x] 3.4 Write property test for `selectFeaturedChannel`
    - Create `src/renderer/utils/heroSelector.property.test.ts`
    - **Property 8: `selectFeaturedChannel` follows MRU → favorite → first priority** _Validates: Requirements 2.4_
    - `numRuns: 500`

  - [x] 3.5 Implement `pushRecent` ring buffer helper
    - Create `src/renderer/utils/pushRecent.ts` exporting `pushRecent(ids: readonly string[], id: string): string[]`
    - Move-to-front semantics: filter out `id`, prepend, slice to capacity 10
    - Pure function
    - _Requirements: 2.4_

  - [x] 3.6 Write property test for `pushRecent`
    - Create `src/renderer/stores/playerStore.recent.property.test.ts`
    - **Property 9: `recentlyPlayedChannelIds` is a capacity-10 MRU ring buffer** _Validates: Requirements 2.4_
    - Generate arbitrary initial arrays and push sequences; assert length ≤ 10, no duplicates, head === most-recent push, set membership matches MRU window
    - `numRuns: 500`

  - [x] 3.7 Implement `useCardSize` hook
    - Create `src/renderer/hooks/useCardSize.ts` exporting `useCardSize(): { cardWidth: number; cardHeight: number; heroMin: number; heroMax: number }`
    - Subscribe to `window.innerWidth` via `resize` event with a 250 ms trailing debounce
    - Compute card width per band: `[800,1024)` → 140-160, `[1024,1440)` → 160-180, `[1440,1920)` → 180-220, `≥ 1920` → 220-260; `cardHeight = round(cardWidth * 9 / 16)`; hero band `[200, 280]` for `< 1024` else `[280, 420]`
    - Export the pure helper `computeCardSize(width: number)` so it is testable without React
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 3.8 Write property test for `useCardSize`
    - Create `src/renderer/utils/cardSize.property.test.ts` that imports `computeCardSize` from `src/renderer/hooks/useCardSize.ts`
    - **Property 22: `useCardSize` is a piecewise function within band ranges** _Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.6_
    - For arbitrary `w ≥ 800`, assert `cardWidth` falls in the band's `[min, max]`, that `w < 1920 ⇒ cardWidth ≤ 220`, and that `cardHeight === Math.round(cardWidth * 9 / 16)`
    - `numRuns: 500`

- [~] 4. Checkpoint - Pure utilities pass
  - Ensure `npx tsc --noEmit`, `npx vitest run` for all new property tests pass, ask the user if questions arise.

- [ ] 5. Extend the persistence layer with cinematic defaults and schema
  - [x] 5.1 Extend `StoreManager` defaults and schema validation
    - Update `electron/store.ts`: add `showUncategorized: false`, `currentView: 'home'`, `recentlyPlayedChannelIds: []` to `defaults`
    - In `validateAndRepair()` and `set()`, coerce `showUncategorized` to boolean, clamp `currentView` to `'home'` or `'fullPlayer'` (resetting unknown values to `'home'`), and on `recentlyPlayedChannelIds` drop non-string entries and truncate to length 10
    - Preserve all existing behavior (volume clamp, playlist cap, name validation)
    - _Requirements: 6.1, 9.5, 2.4_

  - [ ] 5.2 Write property test for cinematic defaults
    - Create `electron/store.cinematicDefaults.property.test.ts`
    - **Property 13: PersistedState defaults are correct on missing fields** _Validates: Requirements 1.1, 6.1, 9.5_
    - Generate arbitrary partial persisted-state JSON missing the new fields, write to a temp `electron-store` instance, instantiate `StoreManager`, and assert `getAll()` returns `showUncategorized === false`, `currentView === 'home'`, `recentlyPlayedChannelIds === []`
    - Cover the corruption cases (e.g., `currentView: 'unknown'` → `'home'`, `recentlyPlayedChannelIds: ['a', 1, null, 'b']` → `['a', 'b']`, length > 10 → truncated)
    - `numRuns: 200`

- [ ] 6. Extend renderer stores
  - [x] 6.1 Extend `SettingsStore` with `showUncategorized`
    - Update `src/renderer/stores/settingsStore.ts` to add `showUncategorized: boolean` (initial `false`) and `setShowUncategorized(value: boolean): Promise<void>`
    - `setShowUncategorized` writes to `electronAPI.store.set('showUncategorized', value)` and updates state
    - Extend `loadFromPersisted` to read and hydrate `showUncategorized`
    - _Requirements: 6.1, 6.5, 6.6_

  - [x] 6.2 Extend `PlayerStore` with recently-played ring buffer
    - Update `src/renderer/stores/playerStore.ts`: add `recentlyPlayedChannelIds: string[]` (initial `[]`), import `pushRecent` from `src/renderer/utils/pushRecent.ts`
    - Modify `playChannel` to call `pushRecent(state.recentlyPlayedChannelIds, channel.id)`, set state, and persist via `electronAPI.store.set('recentlyPlayedChannelIds', next)`
    - Add `loadFromPersisted(): Promise<void>` that reads `recentlyPlayedChannelIds`, `volume`, and `muted` from `electronAPI.store.getAll()` and hydrates state
    - _Requirements: 2.4, 9.4_

  - [x] 6.3 Create `ViewStore`
    - Create `src/renderer/stores/viewStore.ts` exporting `useViewStore` with state `currentView: ViewName`, `homeScrollY: number`, `mpvRect: MpvRect | null` and actions `setView`, `setHomeScrollY`, `setMpvRect`, `loadFromPersisted`
    - `setView` writes `currentView` via `electronAPI.store.set('currentView', view)` and updates state; it does not touch PlayerStore
    - `setHomeScrollY` and `setMpvRect` are pure in-memory state writes
    - `loadFromPersisted` reads `currentView` and clamps to `'home'` if unknown
    - _Requirements: 1.3, 8.1, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [~] 6.4 Write property tests for `ViewStore`
    - Create `src/renderer/stores/viewStore.property.test.ts` with a mocked `window.electronAPI.store` backing dictionary
    - **Property 10: View changes do not modify PlayerStore** _Validates: Requirements 8.1, 8.4, 9.2, 9.3, 9.4_
    - **Property 11: `currentView` round-trips through persistence** _Validates: Requirements 9.5_
    - **Property 12: `homeScrollY` round-trips across home→fullPlayer→home** _Validates: Requirements 1.3_
    - For each property, reset both stores, generate arbitrary sequences of `setView`/`setHomeScrollY` calls, then assert the invariant
    - `numRuns: 200`

  - [x] 6.5 Implement `useUncategorizedCount` selector helper
    - Create `src/renderer/utils/uncategorizedCount.ts` exporting `useUncategorizedCount(): number` that subscribes to `usePlaylistStore` and computes `extractCategoriesV2(channels, { showUncategorized: false, favoriteIds: emptySet }).uncategorizedCount` memoized by `channels` reference
    - Used by `SettingsDialog` to render the "{N} hidden uncategorized channels" subtitle
    - _Requirements: 6.7_

- [~] 7. Checkpoint - Stores and persistence pass
  - Ensure all tests including the new store property tests pass, ask the user if questions arise.

- [ ] 8. Build the MPV surface-management primitive
  - [~] 8.1 Implement `useMpvSlot` hook
    - Create `src/renderer/hooks/useMpvSlot.ts` exporting `useMpvSlot(active: boolean): React.RefObject<HTMLDivElement>`
    - On mount, read `getBoundingClientRect()` of the ref'd div and call `useViewStore.getState().setMpvRect({top, left, width, height})`
    - Re-measure on `ResizeObserver`, `window.resize`, and `scroll` events; coalesce updates with `requestAnimationFrame`
    - On unmount or when `active` becomes false, set `mpvRect` to `null`
    - _Requirements: 7.1, 7.7, 8.2, 12.5_

  - [~] 8.2 Implement `MpvMountSurface` component
    - Create `src/renderer/components/MpvMountSurface.tsx` that subscribes to `useViewStore.mpvRect` and `usePlayerStore.status`
    - Render a `<div data-testid="mpv-mount" />` with `position: fixed`, `pointer-events: none`, `background: black`, `z-index: 0`, and `display: 'none'` when `status` is `idle` or `error` or `mpvRect` is null; otherwise apply `top/left/width/height` from `mpvRect` with a 150 ms CSS transition on those four properties
    - The surface contains no children; MPV draws on top of the BrowserWindow at this rect
    - _Requirements: 7.2, 7.7, 8.2_

- [ ] 9. Build channel grid components (cards, rows, scroll affordances, grid, hero, empty state)
  - [~] 9.1 Implement `ChannelCard`
    - Create `src/renderer/components/ChannelCard.tsx` exporting `ChannelCard` accepting `channel`, `width`, `height`, `isFavorite`, `onPlay`, `onToggleFavorite`
    - Layout: 16:9 outer frame, ~70% logo region with `<img object-fit: contain />`, single-line name region with `text-overflow: ellipsis` and `title={channel.name}`
    - Logo failure handling: maintain local `loadFailed` state, set it on `<img onError>` (synchronously, no retries), set it on a 5-second `setTimeout` if neither `load` nor `error` has fired, render initial-letter fallback when `loadFailed === true` or `channel.logo` is empty
    - Maintain a per-component `Set<string>` of failed URLs in a `useRef`; if the same URL appears in props again during the session, render the fallback immediately without setting the `<img src>`
    - Hover: CSS `transition: transform 150ms ease, box-shadow 150ms ease`, `:hover { transform: scale(1.06); }`
    - Keyboard: root is `<button>` with `tabIndex={0}`, `aria-label={channel.name}`, `title={channel.name}`; `onKeyDown` Enter/Space → `onPlay(channel)` (preventDefault for Space)
    - Favorite control: nested `<button aria-pressed={isFavorite}>` with `onClick={(e) => { e.stopPropagation(); onToggleFavorite(channel.id); }}`
    - Wrap export in `React.memo` with shallow prop compare
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 10.2, 10.3, 10.7, 11.5, 2.6_

  - [~] 9.2 Write property tests for `ChannelCard`
    - Create `src/renderer/components/ChannelCard.property.test.tsx`
    - **Property 16: ChannelCard exposes the full channel name** _Validates: Requirements 4.5, 10.7_
    - **Property 17: ChannelCard fallback rendering predicate** _Validates: Requirements 4.4_ — drive `<img>` `error` event, advance fake timers past 5 s, omit `logo`, assert which subtree is mounted in each case
    - **Property 18: Failed logo URLs are not retried during a view session** _Validates: Requirements 2.6, 11.5_
    - **Property 19: Click handlers route correctly and do not interfere** _Validates: Requirements 4.7, 4.8_
    - **Property 20: Keyboard activation on a focused ChannelCard plays the channel** _Validates: Requirements 10.3_
    - Use `@testing-library/react`, `@testing-library/user-event`, and `vi.useFakeTimers()`; `numRuns: 100` per property

  - [~] 9.3 Implement `RowScrollControls`
    - Create `src/renderer/components/RowScrollControls.tsx` exporting `RowScrollControls` accepting `onScrollLeft` and `onScrollRight` callbacks plus `visible` (truthy on hover/focus)
    - Render two icon buttons (`lucide-react` `ChevronLeft`/`ChevronRight`) absolutely positioned at the row's left/right edges with `opacity` driven by `visible`
    - _Requirements: 3.7_

  - [~] 9.4 Implement `ChannelRow`
    - Create `src/renderer/components/ChannelRow.tsx` exporting `ChannelRow` accepting `category`, `channels`, `cardWidth`, `cardHeight`
    - Render `<h2>` heading with the category name and the channel count (Requirement 10.6, 3.3)
    - For `channels.length > 20`: render horizontal `react-window` `FixedSizeList` with `layout="horizontal"`, `itemSize = cardWidth + gutter`, `overscanCount: 2`, `width = containerWidth` (measured with `ResizeObserver`)
    - For `channels.length ≤ 20`: render a flex row of `<ChannelCard />` directly
    - Mount `<RowScrollControls />` shown on hover or keyboard focus; on click programmatically scroll the list by `containerWidth`
    - Keyboard: ArrowLeft/Right shifts focus to neighbor card and scrolls the list to keep the focused card fully visible; ArrowUp/Down emits a `'channel-row-vertical-nav'` `CustomEvent` with `{ direction, focusedX }` for `BrowseGrid` to handle
    - Wire `onPlay` and `onToggleFavorite` for each card by reading `usePlayerStore.playChannel` and `useFavoritesStore.toggleFavorite`
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 4.7, 10.4, 10.6, 11.3_

  - [~] 9.5 Implement `BrowseGrid`
    - Create `src/renderer/components/BrowseGrid.tsx` exporting `BrowseGrid` accepting `rows: ChannelRowData[]`, `initialScrollY: number`, `onScrollYChange: (y: number) => void`, `cardWidth`, `cardHeight`
    - Render a vertical `react-window` `FixedSizeList` with one `<ChannelRow />` per item, `itemSize = cardHeight + 80` (heading + spacing), `overscanCount: 3` (≥ 600 px buffer per Requirement 11.2)
    - Use `outerRef` to capture the scrollable element, restore `scrollTop = initialScrollY` on mount, call `onScrollYChange(scrollTop)` from `onScroll`
    - Listen for `'channel-row-vertical-nav'` `CustomEvent`s and move keyboard focus to the closest-x card in the prev/next row (binary search by card center x)
    - _Requirements: 3.1, 3.2, 3.3, 11.2, 11.3, 10.5_

  - [~] 9.6 Write property tests for `BrowseGrid`
    - Create `src/renderer/components/BrowseGrid.property.test.tsx`
    - **Property 21: Arrow-key focus navigation is correct** _Validates: Requirements 10.4, 10.5_ — generate row counts `[n_1, ..., n_R]` and starting positions, assert `ArrowRight/Left/Up/Down` from any focused position routes to the design's specified target index
    - **Property 23: Virtualization renders a bounded number of rows and cards** _Validates: Requirements 3.6, 11.2, 11.3_ — generate `R` and `n_j`, mount with a fixed JSDOM viewport (mock `getBoundingClientRect`), assert the count of mounted `<ChannelRow>` and `<ChannelCard>` elements is bounded by `ceil(viewport / itemSize) + 2*overscanCount + 1`
    - **Property 24: BrowseGrid mirrors the extractor output** _Validates: Requirements 3.1, 3.3_ — generate channel arrays, run `extractCategoriesV2`, render `<BrowseGrid>` with the resulting rows, assert one mounted row per key in insertion order with matching count text
    - `numRuns: 100` per property

  - [~] 9.7 Implement `HeroBanner`
    - Create `src/renderer/components/HeroBanner.tsx` exporting `HeroBanner` accepting `channel: Channel | null`, `categoryTags: string[]`, `onPlay: () => void`
    - Height: clamped to `[280, 420]` px at default; reduced to `[200, 280]` px when `window.innerWidth < 1024` (use the `useCardSize` hero bands)
    - Logo policy: on `<img onLoad>` measure `naturalHeight` after `object-fit: contain` projection; if projected height ≥ 20 px render the logo at height clamped to `[20, 160]` px and **do not** render the channel name as a substitute treatment alongside the logo; on `<img onError>` or projected height `< 20` px switch to text-only treatment using `channel.name` and add the URL to a per-instance `retriedUrls: Set<string>` so it is not refetched during the session
    - Render category tags as small badges under the channel name; render a primary "Play" button that calls `onPlay()`
    - When `channel` is `null`, render nothing (the empty playlist case is handled by `BrowseEmptyState`)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 12.4_

  - [~] 9.8 Implement `BrowseEmptyState`
    - Create `src/renderer/components/BrowseEmptyState.tsx` exporting `BrowseEmptyState` accepting `reason: 'no-playlist' | 'all-uncategorized-hidden'`
    - Render the matching guidance text per Requirement 1.4: `"Add a playlist to start browsing."` for `'no-playlist'`, and `"All channels in this playlist are uncategorized. Enable 'Show uncategorized channels' in Settings to see them."` for `'all-uncategorized-hidden'`
    - Center the message in the available space with neutral styling
    - _Requirements: 1.4_

- [ ] 10. Build the home view shell
  - [~] 10.1 Implement `HomeView`
    - Create `src/renderer/components/HomeView.tsx` that reads `channels`/`searchTerm` from PlaylistStore, `showUncategorized` from SettingsStore, `favoriteIds` from FavoritesStore, `currentChannel`/`recentlyPlayedChannelIds` from PlayerStore, and `homeScrollY` from ViewStore
    - Memoize `extractCategoriesV2(channels, { showUncategorized, favoriteIds })` keyed on `channels`, `showUncategorized`, and `favoriteIds` references
    - Apply the per-row `searchTerm` filter inside a `useMemo` keyed on `searchTerm` and the row arrays — never re-run the extractor on keystrokes
    - Compute the featured channel via `selectFeaturedChannel(channels, recentlyPlayedChannelIds, favoriteIds)`
    - Render `<HeroBanner />` above `<BrowseGrid />`; render `<BrowseEmptyState reason="no-playlist" />` when `channels.length === 0` or `<BrowseEmptyState reason="all-uncategorized-hidden" />` when extractor output is empty but uncategorized channels exist
    - On mount restore `useViewStore.getState().homeScrollY`; on unmount write the latest scroll position back via `setHomeScrollY`
    - Mount `<MiniPlayer />` as a sibling so it overlays the home view (visibility predicate handled inside MiniPlayer)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.4, 3.1, 3.2, 6.3, 6.4, 7.1, 9.2, 11.4_

- [ ] 11. Build the player views
  - [~] 11.1 Implement `MiniPlayer`
    - Create `src/renderer/components/MiniPlayer.tsx` reading `currentChannel`, `status`, `volume`, `muted` from PlayerStore and `currentView` from ViewStore
    - Visibility: render only when `status ∈ {'playing', 'paused'}` AND `currentView === 'home'`; otherwise return null
    - Layout: `position: fixed`, anchored to `bottom: 16px; right: 16px`, width clamped to `[320, 480]` px, 16:9 aspect via inline `aspect-ratio: 16 / 9`
    - Mount a `data-mpv-slot` div via `useMpvSlot(active=true)` that occupies the video region; this is the rect MPV draws into
    - Overlay the controls strip (`z-index: 1`, `pointer-events: auto`) with play/pause, stop, mute, expand, and the channel name label
    - Stop button → `usePlayerStore.getState().stop()`; expand button → `useViewStore.getState().setView('fullPlayer')`
    - Set `role="region"` and `aria-label={"Mini player: " + channel.name}` on the root
    - Add a global keyboard shortcut (e.g., `M`) that focuses the play/pause control while the MiniPlayer is mounted
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.5, 10.8_

  - [~] 11.2 Write property tests for `MiniPlayer`
    - Create `src/renderer/components/MiniPlayer.property.test.tsx`
    - **Property 14: MiniPlayer visibility predicate** _Validates: Requirements 7.1, 7.8, 8.5_ — generate the cross product of `status` values and `currentView` values, render, assert presence/absence by `data-testid="mini-player"`
    - **Property 15: MiniPlayer reflects the current channel name without changing position** _Validates: Requirements 7.4, 7.6, 10.8_ — generate channel sequences, replay `playChannel(c_i)`, assert rendered text and `aria-label` reflect the active channel and that `getBoundingClientRect()` is identical across the sequence
    - `numRuns: 100`

  - [~] 11.3 Implement `FullPlayerView`
    - Create `src/renderer/components/FullPlayerView.tsx`
    - Render a header strip with a "Back to browse" button that calls `useViewStore.getState().setView('home')` (Requirements 8.3, 8.4)
    - Body: a `data-mpv-slot` div via `useMpvSlot(active=true)` filling the remaining content area (Requirement 8.2)
    - Footer: import and render the existing `<PlayerControlBar />` unchanged (Requirement 8.6)
    - Do not render `<MiniPlayer />` (Requirement 8.5)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 12. Extend the SettingsDialog
  - [~] 12.1 Add the "Browse" section with `showUncategorized` toggle
    - Update `src/renderer/components/SettingsDialog.tsx` to render a new "Browse" section below the MPV path field
    - Add a labelled toggle "Show uncategorized channels" bound to `useSettingsStore.showUncategorized` and `setShowUncategorized` (Requirement 6.5)
    - When the toggle is off and `useUncategorizedCount() > 0`, render a subtitle `"{N} hidden uncategorized channels"` immediately below the toggle (Requirement 6.7)
    - Keep all existing MPV-path behavior unchanged
    - _Requirements: 6.1, 6.5, 6.6, 6.7_

- [~] 13. Checkpoint - Components compile and component property tests pass
  - Ensure all tests pass (especially the 9 property test files), ask the user if questions arise.

- [ ] 14. Wire everything into the App shell
  - [~] 14.1 Rewrite `App.tsx`
    - Replace the existing 3-pane layout in `src/App.tsx` with: top-level `<MpvMountSurface />`, then exactly one of `<HomeView />` or `<FullPlayerView />` based on `useViewStore.currentView`, then the always-mounted `<SettingsDialog />`
    - In the boot effect, call `loadFromPersisted` on PlaylistStore, FavoritesStore, SettingsStore, ViewStore, and PlayerStore (in that order), then call `subscribeToPlayerEvents()`
    - Stop importing/rendering `AppLayout`, `Sidebar`, `PlaylistSelector`, `CategoryList`, `ChannelList`, `PlayerView`, `IdleView`, `LoadingView`, `ErrorView` (the files are kept on disk but no longer rendered)
    - Provide a global "Open settings" affordance (a small icon button overlaid on HomeView) so settings remain reachable
    - Confirm `PlaylistSelector`/playlist management is reachable from the new layout (e.g., embed a compact entry in the Settings dialog or a top-of-HomeView toolbar) — pick the smallest change that keeps Requirement 1.4 testable
    - _Requirements: 1.1, 1.2, 1.4, 6.5, 8.1, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [~] 14.2 Write boot-path integration test
    - Create `src/tests/cinematic-boot.integration.test.tsx`
    - Seed `electronAPI.store.getAll` with `currentView: 'fullPlayer'`, a valid `lastActivePlaylistId`, `status: 'idle'`; mount `<App />`; assert FullPlayerView renders with a "Back to browse" control and an empty MPV slot; click "Back to browse"; assert HomeView mounts with hero/grid populated and the MiniPlayer is not visible
    - _Requirements: 1.1, 8.3, 9.1, 9.5_

  - [~] 14.3 Write view-transition integration test
    - Create `src/tests/cinematic-transition.integration.test.tsx`
    - Mount `<App />` on HomeView with channels available; call `playChannel(c)`; assert `status === 'playing'` and the MiniPlayer mounts; click the expand button; assert `currentView === 'fullPlayer'`, FullPlayerView mounts, MiniPlayer unmounts, and `usePlayerStore.getState().status` is still `'playing'` and `currentChannel` is unchanged
    - _Requirements: 8.1, 8.4, 8.5, 9.4_

  - [~] 14.4 Write `showUncategorized` toggle integration test
    - Create `src/tests/cinematic-uncategorized.integration.test.tsx`
    - Build a synthetic playlist where 90 % of channels resolve to uncategorized; mount `<App />`; assert `BrowseEmptyState reason="all-uncategorized-hidden"` is shown when extractor output is empty; toggle `showUncategorized` to `true` via Settings; within 500 ms, assert the "Uncategorized" row appears as the last row of the grid
    - _Requirements: 6.3, 6.4, 6.6, 1.4_

- [~] 15. Final checkpoint - Full test suite green
  - Ensure `npx tsc --noEmit && npx vitest run && npx eslint .` all pass, ask the user if questions arise.

- [~] 16. Manual MPV verification on X11
  - This step cannot be automated under JSDOM and is required before release per the design's MPV verification section.
  - Build and run the app on an X11 host with a valid MPV binary configured.
  - Verify mini-player → full-player transition: video does not blink, no second MPV process spawns (`ps aux | grep mpv` shows one process before, during, and after).
  - Verify window resize while in MiniPlayer mode: the corner rect tracks the window's bottom-right with the configured 16-px margin.
  - Verify Stop in MiniPlayer: status returns to idle, the MPV surface hides, the MPV process remains alive (no `loadfile` issued).
  - Verify back-to-browse from FullPlayerView: HomeView scroll position is preserved across the round-trip.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP path. All 24 correctness properties from the design are covered by mandatory (non-`*`) property test tasks.
- Each property test task references the exact property number(s) it validates and the requirements clauses each property maps to.
- The MPV surface management primitive (`useMpvSlot` + `MpvMountSurface`) is the central architectural piece — it lands before any consumer (`MiniPlayer`, `FullPlayerView`) so both views share the same DOM rect with no second MPV process.
- Pure utilities (`extractCategoriesV2`, `selectFeaturedChannel`, `pushRecent`, `computeCardSize`) are implemented and property-tested before any UI work, so the core algorithmic correctness is established up front.
- The store layer is extended before components consume it: `PersistedState` types → `StoreManager` schema → renderer stores → views.
- Legacy components (`AppLayout`, `Sidebar`, `CategoryList`, `ChannelList`, `IdleView`, `LoadingView`, `ErrorView`, `PlayerView`) remain on disk to ease incremental migration but are no longer rendered after task 14.1.
- Layout-only and pure-performance criteria (HeroBanner height bands, MiniPlayer positional CSS, focus outline contrast, 50 FPS during scroll, 500 ms first-paint) are not represented as properties — they are covered by the optional integration/unit tests and by the manual MPV verification step.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "3.1", "3.3", "3.5", "3.7", "5.1"] },
    { "id": 2, "tasks": ["3.2", "3.4", "3.6", "3.8", "5.2", "6.1", "6.2", "6.3", "6.5"] },
    { "id": 3, "tasks": ["6.4", "8.1", "8.2", "9.1", "9.3", "9.7", "9.8"] },
    { "id": 4, "tasks": ["9.2", "9.4"] },
    { "id": 5, "tasks": ["9.5"] },
    { "id": 6, "tasks": ["9.6", "10.1"] },
    { "id": 7, "tasks": ["11.1", "11.3", "12.1"] },
    { "id": 8, "tasks": ["11.2"] },
    { "id": 9, "tasks": ["14.1"] },
    { "id": 10, "tasks": ["14.2", "14.3", "14.4"] }
  ]
}
```
