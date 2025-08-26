import React from 'react';
import { DeliberationMessage } from '@/types/deliberation';

interface MessageLogProps {
  messages: DeliberationMessage[];
  showDetails?: boolean;
}

export const MessageLog: React.FC<MessageLogProps> = ({ messages, showDetails = true }) => {
  const getMessageColor = (messageType: string) => {
    switch (messageType) {
      case 'proposal':
        return 'bg-blue-50 border-blue-200 text-blue-900';
      case 'evaluation':
        return 'bg-purple-50 border-purple-200 text-purple-900';
      case 'comparison':
        return 'bg-indigo-50 border-indigo-200 text-indigo-900';
      case 'synthesis':
        return 'bg-green-50 border-green-200 text-green-900';
      case 'progress':
        return 'bg-gray-50 border-gray-200 text-gray-900';
      default:
        return 'bg-white border-gray-200 text-gray-900';
    }
  };

  const getPhaseIcon = (phase?: string) => {
    switch (phase) {
      case 'proposing':
        return '💡';
      case 'judging':
        return '⚖️';
      case 'consensus':
        return '🤝';
      default:
        return '📝';
    }
  };

  const formatContent = (content: any) => {
    if (typeof content === 'string') {
      return content;
    }
    if (content?.winner) {
      return `Winner: ${content.winner}`;
    }
    if (content?.confidence !== undefined) {
      return `Confidence: ${(content.confidence * 100).toFixed(1)}%`;
    }
    if (content?.step) {
      return content.step;
    }
    return JSON.stringify(content, null, 2);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">
        AI Agent Messages ({messages.length})
      </h3>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Waiting for AI agents to start deliberation...
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={message.id || index}
              className={`p-3 rounded-lg border ${getMessageColor(message.messageType)} animate-fadeIn`}
            >
              <div className="flex items-start gap-2">
                <span className="text-xl">{getPhaseIcon(message.phase)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">
                        {message.messageType}
                      </span>
                      {message.agentName && (
                        <span className="text-sm opacity-75">
                          by {message.agentName}
                        </span>
                      )}
                    </div>
                    {message.phase && (
                      <span className="text-xs px-2 py-1 bg-white bg-opacity-50 rounded-full">
                        {message.phase}
                      </span>
                    )}
                  </div>
                  
                  {showDetails && (
                    <div className="text-sm mt-2">
                      {message.summary ? (
                        <p className="italic">{message.summary}</p>
                      ) : (
                        <p className="font-mono text-xs">
                          {formatContent(message.content)}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {message.timestamp && (
                    <div className="text-xs opacity-50 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {messages.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Total Messages: {messages.length}</span>
            <span>
              Phases: {Array.from(new Set(messages.map(m => m.phase).filter(Boolean))).join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};