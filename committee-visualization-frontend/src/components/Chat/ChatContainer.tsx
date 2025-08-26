import React, { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { AgentAvatar } from './AgentAvatar';
import { getActiveAgents } from '@/config/agents.config';
import type { DeliberationMessage, DeliberationPhase } from '@/types/deliberation';
import type { AgentStatus } from '@/types/agent';

interface ChatContainerProps {
  messages: DeliberationMessage[];
  currentPhase: DeliberationPhase;
  agentStatuses: AgentStatus[];
  isDeliberating: boolean;
  className?: string;
}

export function ChatContainer({ 
  messages, 
  currentPhase, 
  agentStatuses, 
  isDeliberating,
  className = '' 
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeAgents, setActiveAgents] = useState(getActiveAgents());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getTypingAgents = (): AgentStatus[] => {
    return agentStatuses.filter(status => status.status === 'thinking');
  };

  const getPhaseDescription = (phase: DeliberationPhase): string => {
    switch (phase) {
      case 'proposing':
        return 'Agents are analyzing the situation and forming proposals...';
      case 'judging':
        return 'Evaluating proposals and conducting pairwise comparisons...';
      case 'consensus':
        return 'Building consensus and finalizing the decision...';
      case 'completed':
        return 'Deliberation complete!';
    }
  };

  const getPhaseEmoji = (phase: DeliberationPhase): string => {
    switch (phase) {
      case 'proposing': return '🤔';
      case 'judging': return '⚖️';
      case 'consensus': return '🎯';
      case 'completed': return '✅';
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Chat Header */}
      <div className="bg-chat-header border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex -space-x-2">
              {activeAgents.slice(0, 5).map((agent) => (
                <AgentAvatar
                  key={agent.id}
                  agentId={agent.id}
                  size="sm"
                  showBadge={false}
                  isActive={isDeliberating}
                />
              ))}
            </div>
            <div>
              <h2 className="font-semibold text-lg">Committee Deliberation</h2>
              <p className="text-sm text-gray-400">
                {activeAgents.length} members
              </p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">{getPhaseEmoji(currentPhase)}</span>
              <div>
                <div className="text-sm font-medium capitalize">
                  {currentPhase} Phase
                </div>
                {isDeliberating && (
                  <div className="text-xs text-green-400">
                    🟢 Active
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Phase description */}
        <div className="mt-3 p-2 bg-gray-700/50 rounded-lg">
          <p className="text-sm text-gray-300 text-center italic">
            {getPhaseDescription(currentPhase)}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto chat-container p-4 space-y-1">
        {messages.length === 0 && !isDeliberating && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <div className="text-6xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold mb-2">Ready to Deliberate</h3>
              <p className="text-sm">
                Start a new deliberation to see the committee in action
              </p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble 
            key={message.id || `${message.messageType}-${index}`} 
            message={message} 
          />
        ))}

        {/* Typing indicators */}
        {getTypingAgents().map((agentStatus) => (
          <div key={agentStatus.agentId} className="flex items-start space-x-3 mb-4">
            <AgentAvatar 
              agentId={agentStatus.agentId}
              size="sm" 
              isActive={true}
            />
            <div className="flex-1">
              <TypingIndicator 
                agentName={getActiveAgents().find(a => a.id === agentStatus.agentId)?.name}
              />
              {agentStatus.currentTask && (
                <div className="text-xs text-gray-500 mt-1">
                  {agentStatus.currentTask}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area (disabled during deliberation) */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex items-center space-x-3">
          <div className="flex-1 bg-gray-700 rounded-lg px-4 py-2 text-gray-400">
            Committee deliberation in progress...
          </div>
          <button 
            className="p-2 text-gray-500 cursor-not-allowed"
            disabled
          >
            ➤
          </button>
        </div>
        
        {/* Agent profiles at bottom */}
        <div className="flex justify-center mt-3 space-x-2">
          {activeAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex flex-col items-center"
              title={agent.description}
            >
              <AgentAvatar
                agentId={agent.id}
                size="sm"
                showBadge={true}
                isActive={agentStatuses.find(s => s.agentId === agent.id)?.status === 'active'}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}