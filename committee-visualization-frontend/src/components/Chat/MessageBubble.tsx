import React from 'react';
import { format } from 'date-fns';
import { AgentAvatar } from './AgentAvatar';
import { getAgentProfile } from '@/config/agents.config';
import type { DeliberationMessage } from '@/types/deliberation';

interface MessageBubbleProps {
  message: DeliberationMessage;
  className?: string;
}

export function MessageBubble({ message, className = '' }: MessageBubbleProps) {
  const agent = message.agentId ? getAgentProfile(message.agentId) : null;
  const isSystemMessage = !message.agentId;
  
  const formatMessageContent = (): React.ReactNode => {
    const { content, messageType } = message;

    switch (messageType) {
      case 'proposal':
        return (
          <div>
            <div className="font-medium mb-1">
              Proposal: <span className="text-blue-300">{content.winner}</span>
            </div>
            {content.confidence && (
              <div className="text-sm opacity-75 mb-2">
                Confidence: {Math.round(content.confidence * 100)}%
              </div>
            )}
            {content.text && (
              <div className="text-sm">
                {content.text}
              </div>
            )}
            {content.evidence && content.evidence.length > 0 && (
              <div className="mt-2 text-xs opacity-75">
                <strong>Evidence:</strong> {content.evidence.slice(0, 2).join(', ')}
                {content.evidence.length > 2 && '...'}
              </div>
            )}
          </div>
        );

      case 'evaluation':
        return (
          <div>
            <div className="font-medium mb-1">Evaluation Complete</div>
            {content.scores && (
              <div className="text-sm">
                {Object.entries(content.scores).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span>{key}:</span>
                    <span className="font-medium">{typeof value === 'number' ? value.toFixed(2) : JSON.stringify(value)}</span>
                  </div>
                ))}
              </div>
            )}
            {content.text && (
              <div className="mt-2 text-sm">{content.text}</div>
            )}
          </div>
        );

      case 'comparison':
        return (
          <div>
            <div className="font-medium mb-1">Pairwise Comparison</div>
            <div className="text-sm">
              <div className="flex justify-between items-center mb-1">
                <span>A vs B:</span>
                <span className="font-medium text-yellow-300">{content.winner} wins</span>
              </div>
              {content.scores && (
                <div className="flex justify-between text-xs opacity-75">
                  <span>Score A: {content.scores.A}</span>
                  <span>Score B: {content.scores.B}</span>
                </div>
              )}
            </div>
            {content.reasoning && Array.isArray(content.reasoning) && (
              <div className="mt-2 text-xs opacity-75">
                {content.reasoning[0]}
              </div>
            )}
          </div>
        );

      case 'vote':
        return (
          <div className="flex items-center space-x-2">
            <span className="text-2xl">
              {getVoteEmoji(content.choice || content.winner)}
            </span>
            <div>
              <div className="font-medium">
                Voted: <span className="text-green-300">{content.choice || content.winner}</span>
              </div>
              {content.confidence && (
                <div className="text-xs opacity-75">
                  Confidence: {Math.round(content.confidence * 100)}%
                </div>
              )}
            </div>
          </div>
        );

      case 'synthesis':
        return (
          <div>
            <div className="font-medium mb-1 text-yellow-300">
              🎯 Final Decision: {content.winner}
            </div>
            {content.confidence && (
              <div className="text-sm mb-2">
                Overall Confidence: {Math.round(content.confidence * 100)}%
              </div>
            )}
            {content.text && (
              <div className="text-sm">{content.text}</div>
            )}
          </div>
        );

      case 'phase_start':
      case 'phase_complete':
      case 'progress':
        return (
          <div className="text-center text-sm italic opacity-75">
            {content.text}
          </div>
        );

      default:
        return <div>{content.text || 'Unknown message type'}</div>;
    }
  };

  const getVoteEmoji = (choice?: string): string => {
    if (!choice) return '🗳️';
    
    const emojis = ['😊', '🔥', '✨', '🎯', '💫', '⭐'];
    const hash = choice.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return emojis[hash % emojis.length];
  };

  if (isSystemMessage) {
    return (
      <div className={`flex justify-center mb-4 ${className}`}>
        <div className="bg-gray-700 px-4 py-2 rounded-full text-sm text-gray-300">
          {formatMessageContent()}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start space-x-3 mb-4 animate-fade-in ${className}`}>
      <AgentAvatar 
        agentId={message.agentId!} 
        size="sm"
        isActive={true}
      />
      
      <div className="flex-1">
        <div className="flex items-center space-x-2 mb-1">
          <span className="font-medium text-sm" style={{ color: agent?.color }}>
            {agent?.name || message.agentName || 'Unknown Agent'}
          </span>
          <span className="text-xs text-gray-400">
            {format(new Date(message.metadata.timestamp), 'HH:mm')}
          </span>
        </div>
        
        <div 
          className="chat-message chat-message-left max-w-md"
          style={{ 
            backgroundColor: agent?.color ? `${agent.color}20` : undefined,
            borderLeft: agent?.color ? `3px solid ${agent.color}` : undefined
          }}
        >
          {formatMessageContent()}
          
          {message.metadata.processingTimeMs && (
            <div className="mt-2 text-xs text-gray-400 flex items-center space-x-2">
              <span>⚡ {message.metadata.processingTimeMs}ms</span>
              {message.metadata.tokenUsage && (
                <span>🪙 {message.metadata.tokenUsage.totalTokens} tokens</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}