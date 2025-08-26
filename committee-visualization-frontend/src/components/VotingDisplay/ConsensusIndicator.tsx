import React from 'react';

interface ConsensusIndicatorProps {
  distribution: Record<string, number>;
  winner: string;
  margin: number;
  method: string;
}

export function ConsensusIndicator({ distribution, winner, margin, method }: ConsensusIndicatorProps) {
  const sortedChoices = Object.entries(distribution).sort(([,a], [,b]) => b - a);
  const maxValue = sortedChoices.length > 0 ? sortedChoices[0][1] : 0;

  const getConsensusLevel = (margin: number) => {
    if (margin >= 0.6) return { level: 'Strong', color: 'text-green-400', bgColor: 'bg-green-400' };
    if (margin >= 0.4) return { level: 'Moderate', color: 'text-yellow-400', bgColor: 'bg-yellow-400' };
    if (margin >= 0.2) return { level: 'Weak', color: 'text-orange-400', bgColor: 'bg-orange-400' };
    return { level: 'Contested', color: 'text-red-400', bgColor: 'bg-red-400' };
  };

  const consensus = getConsensusLevel(margin);

  const getChoiceColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-indigo-500'
    ];
    return colors[index % colors.length];
  };

  const getMethodDescription = (method: string) => {
    switch (method.toLowerCase()) {
      case 'majority':
        return 'Simple majority voting';
      case 'weighted_voting':
        return 'Agent weights and confidence considered';
      case 'borda':
        return 'Ranked choice scoring system';
      case 'approval':
        return 'Multiple choice approval system';
      default:
        return 'Custom voting method';
    }
  };

  return (
    <div className="space-y-4">
      {/* Consensus Strength */}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
        <div>
          <div className="text-sm font-medium text-gray-300">Consensus Strength</div>
          <div className="text-xs text-gray-500">{getMethodDescription(method)}</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${consensus.color}`}>
            {consensus.level}
          </div>
          <div className="text-xs text-gray-500">
            {(margin * 100).toFixed(1)}% margin
          </div>
        </div>
      </div>

      {/* Vote Distribution Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-300">Vote Distribution</span>
          <span className="text-gray-500">
            {sortedChoices.length} option{sortedChoices.length !== 1 ? 's' : ''}
          </span>
        </div>

        {sortedChoices.map(([choice, percentage], index) => (
          <div key={choice} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${getChoiceColor(index)}`} />
                <span className={`font-medium ${choice === winner ? 'text-green-300' : 'text-gray-300'}`}>
                  {choice}
                </span>
                {choice === winner && (
                  <span className="text-green-400 text-xs">👑 Winner</span>
                )}
              </div>
              <span className="font-mono text-gray-400">
                {(percentage * 100).toFixed(1)}%
              </span>
            </div>
            
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-700 ease-out ${getChoiceColor(index)}`}
                style={{ 
                  width: `${percentage * 100}%`,
                  opacity: choice === winner ? 1 : 0.7
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Statistics */}
      <div className="grid grid-cols-2 gap-4 p-3 bg-gray-800/30 rounded-lg">
        <div className="space-y-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Leading Choice</div>
          <div className="text-sm">
            <div className="font-semibold text-green-300">{winner}</div>
            <div className="text-xs text-gray-400">
              {((distribution[winner] || 0) * 100).toFixed(1)}% of votes
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Victory Margin</div>
          <div className="text-sm">
            <div className={`font-semibold ${consensus.color}`}>
              +{(margin * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">
              vs runner-up
            </div>
          </div>
        </div>
      </div>

      {/* Consensus Quality Indicator */}
      <div className="flex items-center space-x-3 p-3 bg-gradient-to-r from-gray-800/30 to-gray-700/30 rounded-lg border border-gray-600">
        <div className={`w-3 h-3 rounded-full ${consensus.bgColor} ${
          consensus.level === 'Strong' ? 'animate-pulse' : ''
        }`} />
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-300">
            Decision Quality: <span className={consensus.color}>{consensus.level}</span>
          </div>
          <div className="text-xs text-gray-500">
            {consensus.level === 'Strong' && 'Clear majority with high confidence'}
            {consensus.level === 'Moderate' && 'Reasonable consensus achieved'}
            {consensus.level === 'Weak' && 'Slight preference, but close result'}
            {consensus.level === 'Contested' && 'Very close result, low consensus'}
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Method: {method.replace('_', ' ').toUpperCase()}
        </div>
      </div>
    </div>
  );
}