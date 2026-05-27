# Requirements Document

## Introduction

This document defines the bare minimum core functionality required to make the IPTV desktop player a fully functional, day-to-day usable application. The focus is on reliable embedded video playback, basic playlist management, channel organization by category, player controls, and persistent state — the essentials a user needs to watch IPTV streams without relying on an external player window.

## Glossary

- **Player**: The embedded video playback component within the Electron renderer process that displays IPTV streams inline
- **Channel**: A single IPTV stream entry containing a name, stream URL, group, and optional metadata (logo, tvg-id)
- **Playlist**: A collection of channels loaded from an M3U/M3U8 URL, stored with a user-assigned name
- **Category**: A group label (derived from the `group-title` M3U attribute) used to organize channels
- **Favorites**: A user-curated list of bookmarked channels for quick access
- **App_State**: The persisted application state including playlists, favorites, selected category, volume, and last-played channel
- **Renderer**: The Electron renderer process running the React UI
- **Main_Process**: The Electron main process handling IPC, network requests, and system-level operations

## Requirements

### Requirement 1: Embedded Video Playback

**User Story:** As a user, I want to watch IPTV streams directly inside the application window, so that I do not need an external player.

#### Acceptance Criteria

1. WHEN a user selects a channel, THE Player SHALL begin streaming the channel URL within the application window within 30 seconds of selection
2. WHEN a stream is playing, THE Player SHALL display the video in the main content area of the application, replacing any placeholder or previously displayed content
3. IF the stream URL fails to load or the stream errors within the 30-second connection timeout, THEN THE Player SHALL display an error message indicating the failure reason and remain in a stopped state allowing the user to select another channel
4. WHEN a stream is playing and the user selects a different channel, THE Player SHALL stop the current stream and begin playing the new channel within 30 seconds
5. WHILE a channel is selected and the stream has not yet started playing, THE Player SHALL display a loading indicator in the main content area
6. IF no channel has been selected, THEN THE Player SHALL display a placeholder message in the main content area indicating that the user should select a channel

### Requirement 2: Player Controls

**User Story:** As a user, I want basic playback controls, so that I can manage volume and stop playback.

#### Acceptance Criteria

1. WHILE a stream is playing, THE Player SHALL display a control bar with play/pause, stop, volume slider (range 0 to 100), and mute toggle
2. WHEN the user adjusts the volume slider, THE Player SHALL set the audio output level to the slider's integer percentage value (0 meaning silent, 100 meaning maximum output)
3. WHEN the user clicks the mute toggle while audio is not muted, THE Player SHALL silence audio output and display a muted indicator
4. WHEN the user clicks the mute toggle while audio is muted, THE Player SHALL restore audio output to the previously set volume level and hide the muted indicator
5. WHEN the user clicks stop, THE Player SHALL stop playback, hide the control bar, and display the idle view showing no active channel
6. WHEN the user clicks play/pause while a stream is paused, THE Player SHALL resume playback; WHEN the user clicks play/pause while a stream is playing, THE Player SHALL pause playback and freeze the video frame
7. THE Player SHALL persist the volume level and mute state across application restarts
8. IF no previously persisted volume level exists, THEN THE Player SHALL default the volume to 50 and mute state to unmuted

### Requirement 3: Multi-Playlist Management

**User Story:** As a user, I want to add, rename, and remove multiple playlists, so that I can organize streams from different providers.

#### Acceptance Criteria

1. WHEN the user adds a new playlist URL with a name of 1 to 100 characters, THE Main_Process SHALL fetch the M3U content within 30 seconds, parse valid channel entries, and store the playlist metadata with its associated channels
2. THE App_State SHALL persist all added playlists (up to a maximum of 50) across application restarts
3. WHEN the user selects a playlist from the list, THE Renderer SHALL display the channels belonging to that playlist
4. WHEN the user removes the currently active playlist, THE App_State SHALL delete the playlist and its associated channel data, and THE Renderer SHALL clear the channel list and display no active playlist
5. WHEN the user renames a playlist, THE App_State SHALL update the stored playlist name if the new name is between 1 and 100 characters and is not empty after trimming whitespace
6. IF the playlist URL fails to fetch or does not respond within 30 seconds, THEN THE Main_Process SHALL return an error message to the Renderer indicating the cause of failure (network unreachable, timeout, or invalid HTTP response)
7. IF the user submits a playlist name that is empty or contains only whitespace, THEN THE Renderer SHALL reject the submission and display an error message indicating that a non-empty name is required
8. WHEN the user removes a playlist that is not currently active, THE App_State SHALL delete the playlist and its associated channel data without affecting the currently displayed channel list

### Requirement 4: Category Filtering

**User Story:** As a user, I want to filter channels by category/group, so that I can quickly find channels of a specific type (Sports, News, Movies, etc.).

#### Acceptance Criteria

1. WHEN a playlist is loaded, THE Renderer SHALL extract all unique category names from the channel list and assign channels with no group to a category labeled "Uncategorized"
2. WHILE a playlist is active, THE Renderer SHALL display a category list containing an "All" entry followed by the extracted category names sorted alphabetically
3. WHEN the user selects a category, THE Renderer SHALL filter the channel list to show only channels belonging to that category and visually indicate the selected category
4. WHEN the user selects the "All" category, THE Renderer SHALL display all channels in the active playlist
5. WHEN a playlist is first loaded, THE Renderer SHALL select the "All" category by default
6. THE Renderer SHALL display the channel count next to each category name, where the "All" entry displays the total number of channels in the playlist

### Requirement 5: Favorites

**User Story:** As a user, I want to bookmark channels as favorites, so that I can quickly access my preferred channels.

#### Acceptance Criteria

1. WHEN the user marks a channel as a favorite, THE App_State SHALL add the channel identifier to the favorites list
2. WHEN the user removes a channel from favorites, THE App_State SHALL remove the channel identifier from the favorites list
3. THE App_State SHALL persist the favorites list across application restarts
4. WHEN the user selects the Favorites category, THE Renderer SHALL display all favorited channels across all playlists
5. THE Renderer SHALL display a filled star icon on channels that are in the favorites list, and an unfilled star icon on channels that are not
6. IF a channel is already in the favorites list and the user marks it as a favorite again, THEN THE App_State SHALL remove the channel from the favorites list (toggle behavior)
7. WHEN a playlist is removed, THE App_State SHALL remove any favorites entries whose channel identifiers belonged exclusively to that playlist

### Requirement 6: Persistent Application State

**User Story:** As a user, I want the application to remember my settings and data between sessions, so that I do not have to reconfigure it each time.

#### Acceptance Criteria

1. THE App_State SHALL persist playlist URLs, playlist names, favorites, volume level (integer 0–100), and last-active playlist identifier to disk
2. WHEN the application starts, THE App_State SHALL restore the previously saved state and apply it before the main window becomes interactive
3. IF the persisted state file is corrupted or missing, THEN THE App_State SHALL initialize with default values (empty playlist list, empty favorites list, volume level 50, no last-active playlist) without crashing
4. WHEN any persisted value changes, THE App_State SHALL save the updated state within 1 second
5. IF a save operation fails due to a disk write error, THEN THE App_State SHALL retain the current in-memory state and reattempt the save on the next state change

### Requirement 7: Settings Configuration

**User Story:** As a user, I want to configure the MPV binary path, so that the application can locate my media player installation.

#### Acceptance Criteria

1. THE Renderer SHALL provide a settings interface containing a text input field (maximum 1024 characters) where the user can specify the MPV binary path
2. WHEN the user updates the MPV binary path, THE Main_Process SHALL validate that the specified path points to an existing, executable file before persisting
3. IF the user-provided MPV binary path fails validation, THEN THE Renderer SHALL display an error message indicating the path is invalid and SHALL NOT persist the invalid path
4. WHEN the MPV binary path passes validation, THE App_State SHALL persist the new path and THE Renderer SHALL display a confirmation that the setting was saved
5. WHEN the application starts, THE Main_Process SHALL use the persisted MPV binary path for player initialization
6. IF no MPV path is configured, THEN THE Main_Process SHALL attempt to use the system default path (/usr/bin/mpv on Linux)
7. IF the configured MPV binary path and the system default path are both unavailable, THEN THE Main_Process SHALL notify the Renderer that no valid MPV binary was found and SHALL not attempt player initialization
