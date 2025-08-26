import React from 'react';
import { PhaseIndicator } from './PhaseIndicator';
import type { DeliberationPhase } from '@/types/deliberation';

interface DeliberationProgressProps {
  currentPhase: DeliberationPhase;
  isDeliberating: boolean;
  startTime?: Date;
  estimatedDuration?: number; // in seconds
  className?: string;
}

export function DeliberationProgress({
  currentPhase,
  isDeliberating,
  startTime,
  estimatedDuration = 60,
  className = ''
}: DeliberationProgressProps) {
  const [elapsedTime, setElapsedTime] = React.useState(0);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isDeliberating && startTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const start = startTime.getTime();
        const elapsed = Math.floor((now - start) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isDeliberating, startTime]);

  const phases: { 
    key: DeliberationPhase; 
    label: string; 
    icon: string; 
    description: string;
    estimatedDuration: number; // percentage of total time
  }[] = [
    { 
      key: 'proposing', 
      label: 'Proposing', 
      icon: '🤔', 
      description: 'Agents analyzing and forming proposals',
      estimatedDuration: 40
    },
    { 
      key: 'judging', 
      label: 'Judging', 
      icon: '⚖️', 
      description: 'Evaluating proposals and comparisons',
      estimatedDuration: 35
    },
    { 
      key: 'consensus', 
      label: 'Consensus', 
      icon: '🎯', 
      description: 'Building agreement and final decision',
      estimatedDuration: 20
    },
    { 
      key: 'completed', 
      label: 'Complete', 
      icon: '✅', 
      description: 'Deliberation finished successfully',
      estimatedDuration: 5
    }
  ];

  const getCurrentPhaseIndex = () => {
    return phases.findIndex(phase => phase.key === currentPhase);
  };

  const getOverallProgress = () => {
    const currentIndex = getCurrentPhaseIndex();
    if (currentIndex === -1) return 0;

    let progress = 0;
    for (let i = 0; i < currentIndex; i++) {
      progress += phases[i].estimatedDuration;
    }

    // Add partial progress for current phase based on elapsed time
    if (isDeliberating && startTime) {
      const currentPhaseEstimated = (estimatedDuration * phases[currentIndex].estimatedDuration) / 100;
      const phaseProgress = Math.min(elapsedTime / currentPhaseEstimated, 1);
      progress += phases[currentIndex].estimatedDuration * phaseProgress;
    } else if (currentPhase === 'completed') {
      progress = 100;
    }

    return Math.min(progress, 100);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getEstimatedTimeRemaining = () => {
    if (!isDeliberating || currentPhase === 'completed') return 0;
    return Math.max(0, estimatedDuration - elapsedTime);
  };

  const overallProgress = getOverallProgress();
  const timeRemaining = getEstimatedTimeRemaining();

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Deliberation Progress</h3>
        <div className="text-sm text-gray-400">
          {isDeliberating ? (
            <div className="flex items-center space-x-4">
              <span>⏱️ {formatTime(elapsedTime)}</span>
              {timeRemaining > 0 && (
                <span className="text-yellow-400">~{formatTime(timeRemaining)} left</span>
              )}
            </div>
          ) : currentPhase === 'completed' ? (
            <span className="text-green-400">✅ Completed</span>
          ) : (
            <span>⏸️ Ready</span>
          )}
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">Overall Progress</span>
          <span className="text-sm text-gray-400">{Math.round(overallProgress)}%</span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill ${isDeliberating ? 'animate-pulse' : ''}`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Phase Indicators */}
      <div className="space-y-3">
        {phases.map((phase, index) => (
          <PhaseIndicator
            key={phase.key}
            phase={phase}
            isActive={currentPhase === phase.key}
            isCompleted={getCurrentPhaseIndex() > index}
            isDeliberating={isDeliberating}
          />
        ))}
      </div>

      {/* Status Summary */}
      <div className="mt-6 p-3 bg-gray-700/30 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-300">Current Status</div>
            <div className="text-xs text-gray-500 mt-1">
              {phases.find(p => p.key === currentPhase)?.description || 'Ready to start'}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-medium ${
              isDeliberating 
                ? 'text-green-400' 
                : currentPhase === 'completed' 
                ? 'text-blue-400' 
                : 'text-gray-400'
            }`}>
              {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}
            </div>
            {isDeliberating && (
              <div className="text-xs text-gray-500">
                Phase {getCurrentPhaseIndex() + 1} of {phases.length}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      {currentPhase === 'completed' && (
        <div className="mt-4 grid grid-cols-2 gap-4 p-3 bg-green-600/10 border border-green-500/30 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">{formatTime(elapsedTime)}</div>
            <div className="text-xs text-gray-400">Total Time</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">
              {elapsedTime <= estimatedDuration ? '⚡' : '🐌'}
            </div>
            <div className="text-xs text-gray-400">
              {elapsedTime <= estimatedDuration ? 'Fast' : 'Thorough'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}