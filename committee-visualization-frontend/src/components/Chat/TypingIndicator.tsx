import React from 'react';

interface TypingIndicatorProps {
  agentName?: string;
  className?: string;
}

export function TypingIndicator({ agentName, className = '' }: TypingIndicatorProps) {
  return (
    <div className={`flex items-center space-x-2 text-gray-400 text-sm ${className}`}>
      <div className="flex space-x-1">
        <div className="typing-indicator"></div>
        <div className="typing-indicator"></div>
        <div className="typing-indicator"></div>
      </div>
      <span>
        {agentName ? `${agentName} is thinking...` : 'Thinking...'}
      </span>
    </div>
  );
}