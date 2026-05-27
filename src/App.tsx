import { useEffect, useState } from 'react';
import { AppLayout } from '@/renderer/components/AppLayout';
import { Sidebar } from '@/renderer/components/Sidebar';
import { PlaylistSelector } from '@/renderer/components/PlaylistSelector';
import { CategoryList } from '@/renderer/components/CategoryList';
import { ChannelList } from '@/renderer/components/ChannelList';
import { PlayerView } from '@/renderer/components/PlayerView';
import { IdleView } from '@/renderer/components/IdleView';
import { LoadingView } from '@/renderer/components/LoadingView';
import { ErrorView } from '@/renderer/components/ErrorView';
import { PlayerControlBar } from '@/renderer/components/PlayerControlBar';
import { SettingsDialog } from '@/renderer/components/SettingsDialog';
import { usePlayerStore, subscribeToPlayerEvents } from '@/renderer/stores/playerStore';
import { usePlaylistStore } from '@/renderer/stores/playlistStore';
import { useFavoritesStore } from '@/renderer/stores/favoritesStore';
import { useSettingsStore } from '@/renderer/stores/settingsStore';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const status = usePlayerStore((s) => s.status);
  const error = usePlayerStore((s) => s.error);
  const currentChannel = usePlayerStore((s) => s.currentChannel);
  const playChannel = usePlayerStore((s) => s.playChannel);

  const searchTerm = usePlaylistStore((s) => s.searchTerm);
  const setSearchTerm = usePlaylistStore((s) => s.setSearchTerm);

  // Initialize stores and subscribe to player events on mount
  useEffect(() => {
    const init = async () => {
      // Load persisted state for all stores
      await usePlaylistStore.getState().loadFromPersisted();
      await useFavoritesStore.getState().loadFromPersisted();
      await useSettingsStore.getState().loadFromPersisted();

      // Restore volume/mute from persisted data
      const persistedState = await window.electronAPI.store.getAll();
      const playerStore = usePlayerStore.getState();

      if (persistedState.volume !== undefined) {
        await playerStore.setVolume(persistedState.volume);
      }
      if (persistedState.muted) {
        await playerStore.toggleMute();
      }
    };

    init();

    // Subscribe to player status events from main process
    const unsubscribe = subscribeToPlayerEvents();

    return () => {
      unsubscribe();
    };
  }, []);

  // Retry handler for ErrorView
  const handleRetry = () => {
    if (currentChannel) {
      playChannel(currentChannel);
    }
  };

  // Render main content based on player status
  const renderMainContent = () => {
    switch (status) {
      case 'loading':
        return <LoadingView />;
      case 'playing':
      case 'paused':
        return <PlayerView />;
      case 'error':
        return <ErrorView error={error || 'An unknown error occurred'} onRetry={handleRetry} />;
      case 'idle':
      default:
        return <IdleView />;
    }
  };

  // Sidebar content with search, playlist selector, categories, and channel list
  const sidebarContent = (
    <Sidebar
      playlistSelector={
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-200">IPTV Player</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <PlaylistSelector />
        </div>
      }
      categoryList={<CategoryList />}
    />
  );

  const secondSidebarContent = (
    <div className="flex flex-col w-full h-full bg-zinc-950">
      <div className="shrink-0 p-2 border-b border-zinc-800">
        <Input
          type="text"
          placeholder="Search channels..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-blue-500"
        />
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <ChannelList />
      </div>
    </div>
  );

  return (
    <>
      <AppLayout
        sidebar={sidebarContent}
        secondSidebar={secondSidebarContent}
        controlBar={<PlayerControlBar />}
      >
        {renderMainContent()}
      </AppLayout>

      <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default App;
