import React from 'react';
import type { DeliberationPhase } from '@/types/deliberation';

interface PhaseData {
  key: DeliberationPhase;
  label: string;
  icon: string;
  description: string;
  estimatedDuration: number;
}

interface PhaseIndicatorProps {
  phase: PhaseData;
  isActive: boolean;
  isCompleted: boolean;
  isDeliberating: boolean;
}

export function PhaseIndicator({ phase, isActive, isCompleted, isDeliberating }: PhaseIndicatorProps) {
  const getStatusIcon = () => {
    if (isCompleted) return '✅';
    if (isActive && isDeliberating) return '🔄';
    if (isActive) return phase.icon;
    return '⭕';
  };

  const getStatusColor = () => {
    if (isCompleted) return 'text-green-400';
    if (isActive) return isDeliberating ? 'text-blue-400' : 'text-yellow-400';
    return 'text-gray-500';
  };

  const getBackgroundColor = () => {
    if (isCompleted) return 'bg-green-600/10 border-green-500/30';
    if (isActive) return isDeliberating ? 'bg-blue-600/10 border-blue-500/30' : 'bg-yellow-600/10 border-yellow-500/30';
    return 'bg-gray-700/30 border-gray-600';
  };

  return (
    <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-all ${
      getBackgroundColor()
    } ${isActive && isDeliberating ? 'animate-pulse' : ''}`}>
      {/* Phase Icon */}
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
        isCompleted 
          ? 'bg-green-600' 
          : isActive 
          ? isDeliberating 
            ? 'bg-blue-600' 
            : 'bg-yellow-600' 
          : 'bg-gray-600'
      }`}>
        <span className="text-sm">
          {getStatusIcon()}
        </span>
      </div>

      {/* Phase Info */}
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div className={`font-medium ${getStatusColor()}`}>
            {phase.label}
          </div>
          <div className="text-xs text-gray-500">
            ~{phase.estimatedDuration}%
          </div>
        </div>
        <div className="text-sm text-gray-400 mt-1">
          {phase.description}
        </div>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center space-x-2">
        {isActive && isDeliberating && (
          <div className="flex space-x-1">
            <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
            <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        )}
        
        {isCompleted && (
          <span className="text-green-400 text-xs">Done</span>
        )}
        
        {isActive && !isDeliberating && (
          <span className="text-yellow-400 text-xs">Ready</span>
        )}
        
        {!isActive && !isCompleted && (
          <span className="text-gray-500 text-xs">Pending</span>
        )}
      </div>
    </div>
  );
}