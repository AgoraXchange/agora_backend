import React from 'react';
import { getAgentProfile } from '@/config/agents.config';
import type { AgentProfile } from '@/types/agent';

interface AgentAvatarProps {
  agentId: string;
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
  isActive?: boolean;
  className?: string;
}

export function AgentAvatar({ 
  agentId, 
  size = 'md', 
  showBadge = true, 
  isActive = true,
  className = '' 
}: AgentAvatarProps) {
  const agent = getAgentProfile(agentId);

  if (!agent) {
    return (
      <div className={`agent-avatar bg-gray-500 ${getSizeClasses(size)} ${className}`}>
        ?
      </div>
    );
  }

  const sizeClasses = getSizeClasses(size);
  const badgeClasses = getBadgeClasses(size);

  return (
    <div className={`relative ${className}`}>
      <div
        className={`agent-avatar ${sizeClasses} transition-all duration-200 ${
          isActive ? 'ring-2 ring-opacity-50' : 'opacity-75'
        }`}
        style={{ 
          backgroundColor: agent.color,
          ringColor: isActive ? agent.color : undefined
        }}
        title={`${agent.name} (${agent.role})`}
      >
        <span className="text-white font-bold">
          {agent.avatar}
        </span>
      </div>
      
      {showBadge && (
        <div className={`absolute -bottom-1 -right-1 ${badgeClasses} bg-gray-800 border-2 border-chat-bg`}>
          <span 
            className="text-xs font-medium px-1 py-0.5 rounded-full"
            style={{ color: agent.color }}
          >
            {agent.badge}
          </span>
        </div>
      )}
      
      {isActive && (
        <div 
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-chat-bg animate-pulse"
          style={{ backgroundColor: '#10B981' }}
        />
      )}
    </div>
  );
}

function getSizeClasses(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'w-8 h-8 text-sm';
    case 'md':
      return 'w-10 h-10 text-base';
    case 'lg':
      return 'w-12 h-12 text-lg';
  }
}

function getBadgeClasses(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'text-xs';
    case 'md':
      return 'text-xs';
    case 'lg':
      return 'text-sm';
  }
}