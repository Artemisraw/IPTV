import React, { useState, useRef, useEffect } from 'react';
import { usePlaylistStore } from '../stores/playlistStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const PlaylistSelector: React.FC = () => {
  const {
    playlists,
    activePlaylistId,
    isLoading,
    selectPlaylist,
    addPlaylist,
    removePlaylist,
    renamePlaylist,
  } = usePlaylistStore();

  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleAddPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const trimmedName = newName.trim();
    const trimmedUrl = newUrl.trim();

    if (!trimmedName) {
      setAddError('Name cannot be empty');
      return;
    }
    if (trimmedName.length > 100) {
      setAddError('Name too long (max 100)');
      return;
    }
    if (!trimmedUrl) {
      setAddError('URL cannot be empty');
      return;
    }

    try {
      await addPlaylist(trimmedUrl, trimmedName);
      setNewName('');
      setNewUrl('');
      setIsAddFormOpen(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add playlist');
    }
  };

  const handleRemove = (id: string, name: string) => {
    const confirmed = window.confirm(
      `Remove playlist "${name}"? This will delete all its channels.`
    );
    if (confirmed) {
      removePlaylist(id);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleFinishRename = async (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed.length <= 100) {
      try {
        await renamePlaylist(id, trimmed);
      } catch {
        // Revert silently on error
      }
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleFinishRename(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Playlists
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          onClick={() => setIsAddFormOpen(!isAddFormOpen)}
          disabled={isLoading}
        >
          + Add
        </Button>
      </div>

      {/* Add Playlist Form */}
      {isAddFormOpen && (
        <form onSubmit={handleAddPlaylist} className="flex flex-col gap-2 p-2 rounded bg-zinc-900 border border-zinc-800">
          <Input
            placeholder="Playlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            maxLength={100}
            autoFocus
          />
          <Input
            placeholder="M3U URL"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
          {addError && (
            <span className="text-xs text-red-400">{addError}</span>
          )}
          <div className="flex gap-1 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              onClick={() => {
                setIsAddFormOpen(false);
                setAddError(null);
                setNewName('');
                setNewUrl('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-6 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isLoading}
            >
              {isLoading ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </form>
      )}

      {/* Playlist List */}
      {playlists.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">No playlists added yet</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {playlists.map((playlist) => (
            <li
              key={playlist.id}
              className={`group flex items-center gap-1 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                playlist.id === activePlaylistId
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30'
                  : 'text-zinc-300 hover:bg-zinc-800 border border-transparent'
              }`}
              onClick={() => {
                if (editingId !== playlist.id) {
                  selectPlaylist(playlist.id);
                }
              }}
            >
              {editingId === playlist.id ? (
                <Input
                  ref={editInputRef}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleFinishRename(playlist.id)}
                  onKeyDown={(e) => handleRenameKeyDown(e, playlist.id)}
                  className="h-6 text-xs bg-zinc-800 border-zinc-600 text-zinc-100 flex-1"
                  maxLength={100}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="flex-1 truncate text-xs" onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleStartRename(playlist.id, playlist.name);
                  }}>
                    {playlist.name}
                  </span>
                  <span className="text-[10px] text-zinc-500 shrink-0">
                    {playlist.channelCount}
                  </span>
                  {/* Action buttons - visible on hover */}
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button
                      className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(playlist.id, playlist.name);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      className="p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700"
                      title="Remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(playlist.id, playlist.name);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
