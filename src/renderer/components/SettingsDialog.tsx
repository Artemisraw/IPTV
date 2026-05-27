import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '../stores/settingsStore';

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
    const { mpvBinaryPath, isValidating, validationError, setMpvPath } = useSettingsStore();
    const [inputValue, setInputValue] = useState(mpvBinaryPath);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setInputValue(mpvBinaryPath);
            setSaved(false);
        }
    }, [isOpen, mpvBinaryPath]);

    // Show success when validation passes and path matches input
    useEffect(() => {
        if (!isValidating && validationError === null && mpvBinaryPath === inputValue && inputValue !== '') {
            setSaved(true);
        }
    }, [isValidating, validationError, mpvBinaryPath, inputValue]);

    if (!isOpen) return null;

    const handleValidateAndSave = async () => {
        setSaved(false);
        await setMpvPath(inputValue);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl">
                <CardHeader>
                    <CardTitle>Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="mpv-path" className="text-sm font-medium leading-none">
                            MPV Binary Path
                        </label>
                        <Input
                            id="mpv-path"
                            placeholder="/usr/bin/mpv"
                            value={inputValue}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                setSaved(false);
                            }}
                            maxLength={1024}
                            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-blue-500"
                            disabled={isValidating}
                        />
                    </div>
                    {validationError && (
                        <p className="text-sm text-red-400">{validationError}</p>
                    )}
                    {saved && !validationError && (
                        <p className="text-sm text-green-400">Settings saved successfully.</p>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        className="hover:bg-zinc-800 hover:text-zinc-100"
                        disabled={isValidating}
                    >
                        Close
                    </Button>
                    <Button
                        type="button"
                        onClick={handleValidateAndSave}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={isValidating}
                    >
                        {isValidating ? 'Validating...' : 'Validate & Save'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};
