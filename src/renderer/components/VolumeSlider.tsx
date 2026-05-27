import React from 'react';

interface VolumeSliderProps {
  value: number;
  onChange: (value: number) => void;
  muted?: boolean;
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({ value, onChange, muted = false }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className={`flex items-center gap-2 ${muted ? 'opacity-50' : ''}`}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={handleChange}
        aria-label="Volume"
        className="w-20 h-1.5 appearance-none bg-zinc-700 rounded-full cursor-pointer accent-white
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
          [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
      />
      <span className="text-xs text-zinc-400 w-8 text-right tabular-nums">
        {value}%
      </span>
    </div>
  );
};
