import React from 'react';

interface OptionCardProps {
  option: 'A' | 'B';
  label: string;
  percentage: number;
  odds: number;
  color: 'green' | 'red';
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

export const OptionCard: React.FC<OptionCardProps> = ({
  option,
  label,
  percentage,
  odds,
  color,
  selected,
  onSelect,
  disabled = false
}) => {
  const bgColor = color === 'green' ? 'bg-green-600/20' : 'bg-red-600/20';
  const borderColor = color === 'green' ? 'border-green-500' : 'border-red-500';
  const textColor = color === 'green' ? 'text-green-400' : 'text-red-400';
  const selectedBg = color === 'green' ? 'bg-green-600/30' : 'bg-red-600/30';

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`
        w-full p-4 rounded-xl border transition-all
        ${selected ? selectedBg : bgColor}
        ${selected ? borderColor : 'border-gray-700'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`text-lg font-bold ${textColor}`}>
            Option {option}
          </div>
          <div className="text-white font-medium">
            {label}
          </div>
        </div>
        
        <div className="text-right">
          <div className={`text-2xl font-bold ${textColor}`}>
            {percentage}%
          </div>
          <div className="text-xs text-gray-400">
            Odds : {odds.toFixed(1)}x
          </div>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            color === 'green' ? 'bg-green-500' : 'bg-red-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </button>
  );
};