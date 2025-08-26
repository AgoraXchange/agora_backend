import React from 'react';
import { VoteCard } from './VoteCard';
import { ConsensusIndicator } from './ConsensusIndicator';
import type { VotingData } from '@/types/deliberation';

interface VotingDisplayProps {
  votingData: VotingData | null;
  isVoting: boolean;
  className?: string;
}

export function VotingDisplay({ votingData, isVoting, className = '' }: VotingDisplayProps) {
  if (!votingData && !isVoting) {
    return (
      <div className={`card ${className}`}>
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">🗳️</div>
          <h3 className="text-lg font-semibold mb-2">Voting Results</h3>
          <p className="text-sm">Voting results will appear here during deliberation</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Committee Votes</h3>
        <div className="flex items-center space-x-2">
          {isVoting && (
            <div className="flex items-center space-x-1 text-sm text-yellow-400">
              <div className="animate-pulse w-2 h-2 bg-yellow-400 rounded-full"></div>
              <span>Voting in progress...</span>
            </div>
          )}
          {votingData && (
            <div className="text-sm text-gray-400">
              Method: {votingData.method.replace('_', ' ').toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {votingData && (
        <>
          {/* Individual Votes */}
          <div className="space-y-3 mb-6">
            {votingData.votes.map((vote, index) => (
              <VoteCard
                key={`${vote.agentId}-${index}`}
                vote={vote}
                totalWeight={votingData.totalWeight}
              />
            ))}
          </div>

          {/* Consensus Indicator */}
          <ConsensusIndicator
            distribution={votingData.distribution}
            winner={votingData.winner}
            margin={votingData.margin}
            method={votingData.method}
          />

          {/* Voting Statistics */}
          <div className="mt-4 pt-4 border-t border-gray-600">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{votingData.votes.length}</div>
                <div className="text-gray-400">Total Votes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  {(votingData.margin * 100).toFixed(1)}%
                </div>
                <div className="text-gray-400">Margin</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {votingData.totalWeight.toFixed(1)}
                </div>
                <div className="text-gray-400">Total Weight</div>
              </div>
            </div>
          </div>

          {/* Winner Announcement */}
          {votingData.winner && (
            <div className="mt-4 p-4 bg-gradient-to-r from-green-600/20 to-blue-600/20 border border-green-500/30 rounded-lg">
              <div className="text-center">
                <div className="text-2xl mb-2">🏆</div>
                <div className="text-lg font-semibold text-green-300">Winner</div>
                <div className="text-xl font-bold text-white mt-1">{votingData.winner}</div>
                <div className="text-sm text-gray-400 mt-2">
                  With {(Object.entries(votingData.distribution)
                    .find(([choice]) => choice === votingData.winner)?.[1] || 0 * 100).toFixed(1)}% of weighted votes
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Placeholder for voting in progress */}
      {isVoting && !votingData && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center space-x-3 p-3 bg-gray-700/30 rounded-lg animate-pulse">
              <div className="w-8 h-8 bg-gray-600 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-600 rounded mb-1"></div>
                <div className="h-3 bg-gray-600 rounded w-2/3"></div>
              </div>
              <div className="w-16 h-6 bg-gray-600 rounded"></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}