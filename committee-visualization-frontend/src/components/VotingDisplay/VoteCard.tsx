import React from 'react';
import { AgentAvatar } from '@/components/Chat/AgentAvatar';
import { getAgentProfile } from '@/config/agents.config';
import type { VotingData } from '@/types/deliberation';

interface VoteCardProps {
  vote: VotingData['votes'][0];
  totalWeight: number;
  showAnimation?: boolean;
}

export function VoteCard({ vote, totalWeight, showAnimation = true }: VoteCardProps) {
  const agent = getAgentProfile(vote.agentId);
  const weightPercentage = totalWeight > 0 ? (vote.weight / totalWeight) * 100 : 0;
  const contributionPercentage = totalWeight > 0 ? (vote.contribution / totalWeight) * 100 : 0;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceEmoji = (confidence: number) => {
    if (confidence >= 0.9) return '🔥';
    if (confidence >= 0.8) return '✨';
    if (confidence >= 0.7) return '👍';
    if (confidence >= 0.6) return '🤔';
    return '😐';
  };

  const getVoteEmoji = (choice: string) => {
    // Generate consistent emoji based on choice
    const emojis = ['🎯', '⭐', '💎', '🏆', '🚀', '⚡', '🎨', '🔮'];
    const hash = choice.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return emojis[hash % emojis.length];
  };

  return (
    <div className={`p-3 bg-gray-700/30 rounded-lg border border-gray-600 hover:border-gray-500 transition-all ${
      showAnimation ? 'animate-slide-up' : ''
    }`}>
      <div className="flex items-center space-x-3">
        <AgentAvatar
          agentId={vote.agentId}
          size="sm"
          isActive={true}
        />
        
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium text-sm" style={{ color: agent?.color }}>
                {vote.agentName}
              </span>
              <span className="text-2xl">{getVoteEmoji(vote.choice)}</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              <span>Weight: {vote.weight.toFixed(1)}</span>
              <span>•</span>
              <span>Impact: {contributionPercentage.toFixed(1)}%</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-white">
                {vote.choice}
              </span>
              <span className={`text-sm ${getConfidenceColor(vote.confidence)}`}>
                {getConfidenceEmoji(vote.confidence)} {Math.round(vote.confidence * 100)}%
              </span>
            </div>
            
            <div className="text-xs text-gray-500">
              Contribution: {vote.contribution.toFixed(2)}
            </div>
          </div>

          {/* Progress bar showing vote contribution */}
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Vote Strength</span>
              <span>{contributionPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-600 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(contributionPercentage, 100)}%`,
                  backgroundColor: agent?.color || '#6B7280'
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}