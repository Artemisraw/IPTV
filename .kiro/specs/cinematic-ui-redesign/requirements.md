# Requirements Document

## Introduction

This feature redesigns the IPTV desktop player's user interface from a sidebar-and-list layout into a cinematic, browser-first experience inspired by Disney+ and Apple TV. The home view becomes a scrollable wall of horizontal channel rows grouped by category, anchored by a hero banner at the top. Channel cards present a compact, sized logo and channel name (no overflowing artwork). Category extraction is upgraded to split compound `group-title` values on semicolons so each tag becomes its own category, and the noisy "Undefined" / "Uncategorized" pile is hidden by default behind a settings toggle. A mini-player keeps playback alive in the corner so the user can browse other channels while watching, with a one-click expand to a dedicated full-player view.

The redesign is purely a renderer-side change. The data model in `src/shared/types/index.ts`, the Zustand stores (PlayerStore, PlaylistStore, FavoritesStore, SettingsStore), the Electron IPC bridge, the embedded MPV playback via `--wid`, the M3U parser, and the `electron-store` persistence layer are all preserved. Only category-derivation logic, UI components, and view composition change.

## Glossary

- **HomeView**: The renderer's top-level browse surface that replaces the current sidebar+channel-list layout. Contains the HeroBanner above a vertically stacked list of ChannelRows.
- **HeroBanner**: A full-width, prominent visual element rendered at the top of HomeView that highlights one featured channel.
- **ChannelRow**: A horizontally scrollable row of ChannelCards belonging to one Category, with the category name as a label above the row.
- **ChannelCard**: A fixed-aspect tile representing one Channel, displaying a sized logo (or a fallback initial) and the channel name.
- **MiniPlayer**: A persistent compact playback surface anchored to a corner of the HomeView that continues rendering the active stream while the user browses, exposing basic controls and an expand button.
- **FullPlayerView**: A dedicated view that shows the active stream at full size with the existing PlayerControlBar; reached by expanding the MiniPlayer or via direct navigation.
- **CategoryExtractor**: The pure function that derives the displayed Category list and the Channel-to-Category(ies) mapping from a Channel array.
- **Category**: A single tag derived from a Channel's `group` field. Compound `group` values (semicolon-separated) yield one Category per tag, so a Channel may belong to multiple Categories.
- **UncategorizedChannel**: A Channel whose `group` field is empty, missing, or whose normalized value is "Undefined" or "Uncategorized" (case-insensitive).
- **SettingsStore**: The existing Zustand settings store, extended with a new `showUncategorized` boolean preference.
- **Renderer**: The Electron renderer process running the React UI.
- **Channel**: An IPTV stream entry as defined in `src/shared/types/index.ts`.
- **PlayerStore**: The existing Zustand store that owns playback status and the active Channel.

## Requirements

### Requirement 1: Browser-First Launch

**User Story:** As a user, I want the app to open into a cinematic browse view by default, so that I can discover channels visually before starting playback.

#### Acceptance Criteria

1. WHEN the application finishes restoring persisted state on startup, THE Renderer SHALL render the HomeView as the active view with no Channel selected for playback
2. WHILE no Channel is playing, THE HomeView SHALL occupy the full window content area excluding any persistent chrome (title bar, control bar) and SHALL NOT display a video surface
3. WHEN the user navigates from the FullPlayerView back to HomeView, THE Renderer SHALL preserve the HomeView's vertical scroll position from the prior visit
4. IF the active playlist contains zero Channels after filtering UncategorizedChannels per the user's setting, THEN THE HomeView SHALL display an empty-state message instructing the user to add a playlist or enable "Show uncategorized channels"

### Requirement 2: Hero Banner

**User Story:** As a user, I want a featured hero banner at the top of the home view, so that the browsing experience feels cinematic and highlights a channel to start with.

#### Acceptance Criteria

1. WHILE the HomeView is rendered and at least one Channel is available, THE HeroBanner SHALL display at the top of the HomeView spanning the full content width with a height between 280 and 420 pixels
2. THE HeroBanner SHALL display the featured Channel's name, its category labels, and a "Play" call-to-action button
3. WHEN the user clicks the HeroBanner's "Play" button, THE PlayerStore SHALL begin playback of the featured Channel via the existing `playChannel` action
4. WHEN the active playlist changes, THE HeroBanner SHALL select a featured Channel using the following deterministic priority: first the most recently played Channel from the active playlist, otherwise the first favorited Channel in the active playlist, otherwise the first Channel in the active playlist
5. IF the featured Channel has a logo URL, the logo loads successfully, and the logo's natural rendered height after fitting is at least 20 pixels, THEN THE HeroBanner SHALL display the logo at a height between 20 and 160 pixels with `object-fit: contain` so the artwork is not cropped or stretched, and SHALL NOT display the name as a substitute treatment alongside the logo
6. IF the featured Channel has no logo, the logo fails to load, or the logo would render at a height below 20 pixels, THEN THE HeroBanner SHALL display a text-only treatment using the Channel's name without attempting to load an image again during the current view session

### Requirement 3: Horizontal Category Rows

**User Story:** As a user, I want channels grouped into horizontal rows by category, so that I can scan many categories at once and scroll through each one independently.

#### Acceptance Criteria

1. WHILE the HomeView is rendered, THE Renderer SHALL display each visible Category as one ChannelRow stacked vertically below the HeroBanner
2. THE Renderer SHALL order ChannelRows using the following deterministic sequence: "Favorites" first when the favorites set contains at least one Channel from the active playlist, then all other Categories sorted alphabetically by category name using locale-aware comparison
3. THE ChannelRow SHALL display the Category name as a left-aligned heading above the row and the count of Channels in that Category to the right of the heading
4. WHILE a ChannelRow is rendered, THE ChannelRow SHALL lay out its ChannelCards in a single horizontal track regardless of how many cards the row contains, and SHALL enable horizontal scrolling when the cards exceed the row width
5. WHEN the user scrolls a ChannelRow horizontally, THE ChannelRow SHALL scroll independently of other ChannelRows and of the page's vertical scroll
6. WHERE a ChannelRow contains more than 20 ChannelCards, THE Renderer SHALL render only the ChannelCards within and adjacent to the visible viewport and SHALL load additional ChannelCards as the user scrolls horizontally
7. THE ChannelRow SHALL provide left and right scroll-affordance controls that become visible when the row is hovered or focused and that scroll the row by one viewport width per activation

### Requirement 4: Channel Card Visual Design

**User Story:** As a user, I want compact channel cards with a properly-sized logo and the channel name, so that logos no longer overflow into the player area and the grid feels tidy.

#### Acceptance Criteria

1. THE ChannelCard SHALL render at a fixed aspect ratio of 16:9 with a width between 160 and 220 pixels at the default window width of 1280 pixels
2. THE ChannelCard SHALL contain a logo region occupying the top portion of the card and a single-line text region displaying the Channel's name beneath the logo region
3. THE logo region SHALL render the Channel's logo with `object-fit: contain` and SHALL constrain the logo to the bounds of the logo region so that the logo never overflows the ChannelCard
4. IF the Channel has no logo URL or the logo fails to load within 5 seconds, THEN THE ChannelCard SHALL display a fallback that shows the first letter of the Channel's name on a neutral background
5. IF the Channel's name exceeds the text region's width, THEN THE ChannelCard SHALL truncate the name with an ellipsis and SHALL expose the full name as a hover tooltip
6. WHEN the user hovers a ChannelCard with a pointer device, THE ChannelCard SHALL apply a visual emphasis treatment (scale increase between 1.04 and 1.08, brighter border, or elevated shadow) within 150 milliseconds
7. WHEN the user clicks a ChannelCard, THE PlayerStore SHALL begin playback of the corresponding Channel via the existing `playChannel` action and THE Renderer SHALL display the MiniPlayer as defined in Requirement 7
8. THE ChannelCard SHALL display a favorite-toggle control that is reachable by keyboard focus and that invokes the existing `toggleFavorite` action on the FavoritesStore without starting playback

### Requirement 5: Compound Category Splitting

**User Story:** As a user, I want compound `group-title` values like "Animation;Classic;Entertainment" to appear under each tag rather than as one combined category, so that the category list is clean and channels are findable under any of their tags.

#### Acceptance Criteria

1. WHEN the CategoryExtractor processes a Channel whose `group` field contains one or more semicolon characters, THE CategoryExtractor SHALL split the field on the semicolon character, trim leading and trailing whitespace from each resulting segment, discard segments that are empty after trimming, and yield one Category tag per remaining segment
2. WHEN the CategoryExtractor processes a Channel whose `group` field contains no semicolon, THE CategoryExtractor SHALL yield exactly one Category tag equal to the trimmed `group` value
3. THE CategoryExtractor SHALL associate every Channel with the set of all Category tags yielded for that Channel, allowing a Channel to belong to multiple Categories
4. WHILE category-based filtering or display is active, THE Renderer SHALL include a Channel in a Category's row if and only if that Category appears in the Channel's associated tag set
5. THE CategoryExtractor SHALL deduplicate Category tags using a case-sensitive comparison so that "Movies" and "movies" are preserved as distinct Categories, matching the source playlist's casing
6. THE CategoryExtractor SHALL be a pure function whose output depends only on the input Channel array and the current `showUncategorized` setting, with no side effects and no dependence on time or random values

### Requirement 6: Uncategorized Channel Visibility

**User Story:** As a user, I want channels with no real category hidden by default with an opt-in toggle, so that the "Undefined" pile of thousands of channels does not pollute the browse view.

#### Acceptance Criteria

1. THE SettingsStore SHALL expose a boolean preference named `showUncategorized` that defaults to `false` for new installations and is persisted via the existing electron-store layer
2. WHEN the CategoryExtractor processes a Channel and the Channel's `group` field is empty, missing, or evaluates to "Undefined" or "Uncategorized" after case-insensitive comparison and whitespace trimming, THE CategoryExtractor SHALL classify that Channel as an UncategorizedChannel; otherwise, THE CategoryExtractor SHALL classify the Channel as a regular Channel associated with its derived Category tags per Requirement 5
3. WHILE `showUncategorized` is `false`, THE Renderer SHALL omit UncategorizedChannels from all ChannelRows on the HomeView and SHALL omit the "Uncategorized" Category from the displayed Category list
4. WHILE `showUncategorized` is `true`, THE Renderer SHALL display a single "Uncategorized" ChannelRow positioned last in the row order containing every UncategorizedChannel from the active playlist
5. THE Renderer SHALL provide a toggle control in the SettingsDialog labeled "Show uncategorized channels" that reads and writes the `showUncategorized` preference
6. WHEN the user changes the `showUncategorized` preference, THE Renderer SHALL re-render the HomeView with the updated Category list within 500 milliseconds without requiring an application restart
7. THE Renderer SHALL display the count of hidden UncategorizedChannels next to the toggle control in the SettingsDialog when `showUncategorized` is `false` and the active playlist contains at least one UncategorizedChannel

### Requirement 7: Mini-Player Continued Playback

**User Story:** As a user, I want a mini-player that keeps the current channel playing in the corner while I browse, so that I do not have to stop watching to look for something else.

#### Acceptance Criteria

1. WHEN the PlayerStore status transitions to `playing` or `paused` while the HomeView is the active view, THE Renderer SHALL display the MiniPlayer anchored to the bottom-right corner of the HomeView with a margin of at least 16 pixels from the window edges
2. THE MiniPlayer SHALL render the embedded MPV video output via the existing `--wid` integration without spawning a second player process
3. THE MiniPlayer SHALL occupy a width between 320 and 480 pixels at a 16:9 aspect ratio
4. WHILE the MiniPlayer is displayed, THE MiniPlayer SHALL display the current Channel's name, a play/pause button, a stop button, a mute toggle, and an "expand" button
5. WHEN the user clicks the MiniPlayer's stop button, THE PlayerStore SHALL invoke the existing `stop` action and THE Renderer SHALL hide the MiniPlayer
6. WHEN the user clicks a different ChannelCard while the MiniPlayer is displayed, THE PlayerStore SHALL switch playback to the new Channel using the existing `playChannel` action and THE MiniPlayer SHALL update its displayed Channel name without changing its position or size
7. WHILE the user scrolls the HomeView, THE MiniPlayer SHALL remain fixed in the bottom-right corner of the HomeView's visible area and SHALL NOT scroll with the content
8. WHEN the PlayerStore status transitions to `idle` or `error`, THE Renderer SHALL hide the MiniPlayer

### Requirement 8: Full Player View

**User Story:** As a user, I want a dedicated full-size player view I can expand to from the mini-player, so that I can watch immersively without the browser layout taking screen space.

#### Acceptance Criteria

1. WHEN the user clicks the MiniPlayer's expand button, THE Renderer SHALL navigate to the FullPlayerView while keeping the active playback session uninterrupted
2. THE FullPlayerView SHALL render the embedded MPV video output occupying the full window content area minus the existing PlayerControlBar
3. THE FullPlayerView SHALL display a "Back to browse" control that returns the user to the HomeView
4. WHEN the user clicks "Back to browse" in the FullPlayerView, THE Renderer SHALL navigate to the HomeView while keeping the active playback session uninterrupted, and THE Renderer SHALL re-display the MiniPlayer per Requirement 7
5. WHILE the FullPlayerView is the active view, THE Renderer SHALL NOT display the MiniPlayer
6. THE FullPlayerView SHALL reuse the existing PlayerControlBar component for play/pause, stop, volume, and mute controls

### Requirement 9: Navigation Between Browser and Player Views

**User Story:** As a user, I want predictable navigation between the browse view and the player view, so that I can switch contexts without losing my place.

#### Acceptance Criteria

1. THE Renderer SHALL maintain exactly one of two top-level views as active at any time: HomeView or FullPlayerView
2. WHEN the user activates a ChannelCard or the HeroBanner's Play button while the HomeView is active, THE Renderer SHALL remain on the HomeView and SHALL display the MiniPlayer per Requirement 7
3. WHEN the user activates a ChannelCard or the HeroBanner's Play button while the FullPlayerView is active, THE Renderer SHALL switch playback to the new Channel and SHALL remain on the FullPlayerView
4. WHILE the user transitions between HomeView and FullPlayerView, THE PlayerStore status and the active MPV process SHALL NOT be modified by the navigation itself
5. THE Renderer SHALL persist the most recently active view across application restarts via the existing electron-store layer, defaulting to HomeView for new installations

### Requirement 10: Keyboard Navigation and Accessibility

**User Story:** As a user, I want to navigate the cinematic browse view with the keyboard and assistive technologies, so that the redesign does not regress accessibility for desktop users.

#### Acceptance Criteria

1. THE HomeView SHALL expose ChannelCards, ChannelRow scroll controls, the HeroBanner Play button, and the MiniPlayer controls as elements that are focusable via the Tab key in document order
2. WHEN a ChannelCard has keyboard focus, THE ChannelCard SHALL display a visible focus outline with a contrast ratio of at least 3:1 against the card background
3. WHEN a ChannelCard has keyboard focus and the user presses Enter or Space, THE PlayerStore SHALL begin playback of the corresponding Channel via the existing `playChannel` action
4. WHEN a ChannelCard has keyboard focus and the user presses ArrowLeft or ArrowRight, THE Renderer SHALL move focus to the previous or next ChannelCard within the same ChannelRow and SHALL scroll the row horizontally to keep the focused card fully visible
5. WHEN a ChannelCard has keyboard focus and the user presses ArrowUp or ArrowDown, THE Renderer SHALL move focus to a ChannelCard in the adjacent ChannelRow at the closest matching horizontal position
6. THE ChannelRow heading SHALL be marked up as a heading element and SHALL be announced by screen readers as the row's accessible label
7. THE ChannelCard SHALL expose the Channel's name as its accessible name and SHALL expose its favorite state as an accessible toggled-state attribute
8. THE MiniPlayer SHALL be reachable via a keyboard shortcut and SHALL announce itself to screen readers as a media player region with the active Channel's name

### Requirement 11: Browse Performance

**User Story:** As a user, I want the cinematic home view to scroll smoothly even with thousands of channels, so that the redesign does not introduce lag.

#### Acceptance Criteria

1. WHILE the user scrolls the HomeView vertically with an active playlist of up to 10,000 Channels, THE Renderer SHALL maintain a frame rate of at least 50 frames per second on a baseline desktop configuration of an x86_64 CPU released since 2018, 8 GB of RAM, and integrated graphics
2. THE Renderer SHALL render only ChannelRows whose vertical position intersects or is within 600 pixels of the visible viewport, deferring construction of off-screen ChannelRows until they approach the viewport
3. THE Renderer SHALL render only ChannelCards within or adjacent to each ChannelRow's horizontal viewport per Requirement 3.6, with an off-screen buffer of at least 2 cards on each side
4. WHEN the active playlist changes and the playlist contains up to 10,000 Channels, THE Renderer SHALL produce the first paint of the new HomeView within 500 milliseconds; WHERE the playlist contains more than 10,000 Channels, THE Renderer SHALL render the HomeView without a guaranteed first-paint deadline
5. WHEN a ChannelCard's logo image fails to load, THE Renderer SHALL fall back to the text initial within 100 milliseconds of the load failure event without retrying the same URL during the current view session

### Requirement 12: Window Resizing

**User Story:** As a user, I want the cinematic browse view to adapt to my window size, so that the layout works on small laptop screens and large external monitors.

#### Acceptance Criteria

1. WHEN the application window width is between 1024 and 1439 pixels, THE ChannelCard SHALL render at a width between 160 and 180 pixels
2. WHEN the application window width is between 1440 and 1919 pixels, THE ChannelCard SHALL render at a width between 180 and 220 pixels
3. WHILE the application window width is 1920 pixels or greater, THE ChannelCard SHALL render at a width between 220 and 260 pixels, and THE Renderer SHALL NOT apply this width range while the window width is below 1920 pixels
4. WHILE the application window width is below 1024 pixels, THE HomeView SHALL render the HeroBanner at a reduced height between 200 and 280 pixels and the ChannelCard at a width between 140 and 160 pixels
5. WHEN the user resizes the application window, THE HomeView SHALL recompute ChannelCard sizing and ChannelRow visibility within 250 milliseconds of the resize completing
6. THE HomeView SHALL maintain a minimum supported window width of 800 pixels at which all required controls (HeroBanner Play, ChannelCards, MiniPlayer controls) remain reachable and operable
