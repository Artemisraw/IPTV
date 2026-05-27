import React from 'react';

interface SidebarProps {
  playlistSelector?: React.ReactNode;
  categoryList?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  playlistSelector,
  categoryList,
}) => {
  return (
    <div className="flex flex-col flex-1 w-full h-full bg-zinc-950">
      {/* Playlist Selector - compact, fixed at top */}
      <div className="shrink-0 border-b border-zinc-800 p-3">
        {playlistSelector ?? (
          <div className="text-xs text-zinc-500">Playlist Selector</div>
        )}
      </div>

      {/* Category List - takes remaining space, scrollable */}
      <div className="flex-1 overflow-y-auto">
        {categoryList ?? (
          <div className="p-3 text-xs text-zinc-500">Categories</div>
        )}
      </div>
    </div>
  );
};
