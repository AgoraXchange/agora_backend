import React, { useRef, useEffect } from 'react';
import { DeliberationMessage } from '@/types/deliberation';

interface LiveDebateProps {
  messages: DeliberationMessage[];
  isDeliberating: boolean;
  currentPhase: string | null;
  participantCount: number;
}

export const LiveDebate: React.FC<LiveDebateProps> = ({
  messages,
  isDeliberating,
  currentPhase,
  participantCount
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getAgentEmoji = (agentName: string) => {
    if (agentName.toLowerCase().includes('gpt')) return '🤖';
    if (agentName.toLowerCase().includes('claude')) return '🎭';
    if (agentName.toLowerCase().includes('gemini')) return '✨';
    if (agentName.toLowerCase().includes('judge')) return '⚖️';
    return '🧠';
  };

  const formatMessage = (message: DeliberationMessage) => {
    switch (message.messageType) {
      case 'proposal':
        return (
          <div className="mb-3">
            <div className="font-medium text-white">
              {message.agentName} proposes: <span className="text-green-400">{message.content.winner}</span>
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Confidence: {((message.content.confidence || 0) * 100).toFixed(0)}%
            </div>
            {message.content.rationale && (
              <div className="text-sm text-gray-500 mt-1 line-clamp-2">
                "{message.content.rationale}"
              </div>
            )}
          </div>
        );

      case 'evaluation':
        return (
          <div className="mb-3">
            <div className="font-medium text-blue-400">
              Judge evaluates proposal
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Score: {((message.content.overallScore || 0) * 100).toFixed(0)}%
            </div>
          </div>
        );

      case 'vote':
        return (
          <div className="mb-3">
            <div className="font-medium text-purple-400">
              {message.agentName} votes for {message.content.choice}
            </div>
            <div className="text-sm text-gray-500">
              Weight: {(message.content.voteWeight || 1).toFixed(2)}
            </div>
          </div>
        );

      case 'synthesis':
        return (
          <div className="mb-3 p-3 bg-green-900/20 border border-green-800 rounded-lg">
            <div className="font-medium text-green-400">
              🎯 Consensus Reached: {message.content.winner}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Confidence: {((message.content.confidence || 0) * 100).toFixed(0)}%
            </div>
          </div>
        );

      case 'progress':
        return (
          <div className="mb-3 text-center">
            <div className="text-sm text-gray-500 italic">
              {message.content.text}
            </div>
          </div>
        );

      default:
        return (
          <div className="mb-3 text-gray-400 text-sm">
            {JSON.stringify(message.content)}
          </div>
        );
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center space-x-2">
          <span>Live Debate</span>
          {isDeliberating && (
            <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full animate-pulse">
              LIVE
            </span>
          )}
        </h2>
        <div className="text-sm text-gray-500">
          {participantCount} AI Agents • {messages.length} messages
        </div>
      </div>

      {/* Current quote/highlight */}
      {isDeliberating && messages.length > 0 && (
        <div className="bg-gray-900 border-l-4 border-blue-500 p-4 mb-4 rounded-r-lg">
          <p className="text-gray-300 italic">
            "AI agents are analyzing the situation and forming proposals..."
          </p>
        </div>
      )}

      {/* Messages container */}
      <div 
        ref={scrollRef}
        className="bg-gray-900 rounded-xl p-4 h-96 overflow-y-auto space-y-2"
      >
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {isDeliberating 
              ? 'Waiting for AI agents to start deliberation...'
              : 'No debate messages yet. Start deliberation to see AI discussion.'}
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={message.id || index} className="animate-fadeIn">
              <div className="flex items-start space-x-3">
                <span className="text-xl">
                  {getAgentEmoji(message.agentName || '')}
                </span>
                <div className="flex-1">
                  {formatMessage(message)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Phase indicator */}
      {currentPhase && currentPhase !== 'idle' && (
        <div className="mt-3 text-center">
          <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
            Phase: {currentPhase}
          </span>
        </div>
      )}
    </div>
  );
};