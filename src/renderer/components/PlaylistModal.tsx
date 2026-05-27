import React, { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (url: string) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [url, setUrl] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url.trim()) {
            onSubmit(url.trim());
            setUrl('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl">
                <CardHeader>
                    <CardTitle>Add Playlist</CardTitle>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="url" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                M3U Playlist URL
                            </label>
                            <Input
                                id="url"
                                placeholder="https://example.com/playlist.m3u"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-blue-500"
                                autoFocus
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={onClose} className="hover:bg-zinc-800 hover:text-zinc-100">
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                            Add Playlist
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
};
