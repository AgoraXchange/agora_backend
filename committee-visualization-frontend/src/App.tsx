import React, { useState, useEffect } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { useDeliberation } from '@/hooks/useDeliberation';
import { useAuth } from '@/context/AuthContext';
import type { CommitteeConfig } from '@/types/api';

// Components
import { OptionCard } from '@/components/OptionCard/OptionCard';
import { CountdownTimer } from '@/components/CountdownTimer/CountdownTimer';
import { LiveDebate } from '@/components/LiveDebate/LiveDebate';
import { DebateSummary } from '@/components/DebateSummary/DebateSummary';
import { VoteButton } from '@/components/VoteButton/VoteButton';
import { MessageLog } from '@/components/MessageLog/MessageLog';

function MainApp() {
  const { isAuthenticated, loginDemo } = useAuth();
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  
  const {
    isDeliberating,
    currentPhase,
    messages,
    agentStatuses,
    deliberationId,
    error,
    result,
    visualization,
    startDeliberation,
    stopDeliberation,
    clearMessages,
    isConnected,
    reconnect
  } = useDeliberation({
    onComplete: (result, visualization) => {
      console.log('Deliberation completed:', result);
      if (visualization) {
        console.log('Visualization data:', visualization);
      }
    },
    onError: (error) => {
      console.error('Deliberation error:', error);
    },
    onPhaseChange: (phase) => {
      console.log('Phase changed to:', phase);
    }
  });

  // Calculate support percentages from messages
  const [supportA, setSupportA] = useState(50);
  const [supportB, setSupportB] = useState(50);

  useEffect(() => {
    if (messages.length > 0 && visualization?.voting) {
      const totalVotes = visualization.voting.votes.length;
      if (totalVotes > 0) {
        const votesA = visualization.voting.votes.filter(v => v.choice === 'Lakers').length;
        const votesB = visualization.voting.votes.filter(v => v.choice === 'Celtics').length;
        setSupportA(Math.round((votesA / totalVotes) * 100));
        setSupportB(Math.round((votesB / totalVotes) * 100));
      }
    }
  }, [messages, visualization]);

  const handleVote = () => {
    if (selectedOption && !hasVoted) {
      setHasVoted(true);
      // In real app, this would submit the vote
      console.log('Voted for:', selectedOption);
    }
  };

  const handleStartDeliberation = () => {
    const config: CommitteeConfig = {
      forceCommitteeMode: true,
      committeeConfig: {
        minProposals: 3,
        maxProposalsPerAgent: 2,
        consensusThreshold: 0.7,
        enableEarlyExit: false
      }
    };
    startDeliberation('test_contract_nba_001', config);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-gray-900 rounded-2xl p-8 text-center">
            <div className="text-6xl mb-4">⚡</div>
            <h1 className="text-2xl font-bold text-white mb-4">Agora AI Committee</h1>
            <p className="text-gray-400 mb-6">
              Watch AI agents deliberate and decide outcomes
            </p>
            <button
              onClick={loginDemo}
              className="w-full bg-green-500 text-black font-bold py-3 px-6 rounded-full hover:bg-green-400 transition-colors"
            >
              Enter Demo Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button className="text-2xl">←</button>
          <div className="flex items-center space-x-2">
            <span className="text-green-400 text-lg">⚡</span>
            <span className="font-semibold">agora</span>
          </div>
          <button className="text-2xl">👤</button>
        </div>
      </header>

      {/* Question/Topic */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center space-x-2 text-sm text-gray-400 mb-2">
          <span>🏀</span>
          <span>James</span>
          <span>•</span>
          <span>2025.08.12</span>
        </div>
        <h1 className="text-xl font-bold mb-6">
          Who won the NBA Finals Game 7 - Lakers or Celtics?
        </h1>

        {/* Option Cards */}
        <div className="space-y-3 mb-6">
          <OptionCard
            option="A"
            label="Lakers Win"
            percentage={supportA}
            odds={1.7}
            color="green"
            selected={selectedOption === 'A'}
            onSelect={() => setSelectedOption('A')}
            disabled={hasVoted}
          />
          <OptionCard
            option="B"
            label="Celtics Win"
            percentage={supportB}
            odds={1.9}
            color="red"
            selected={selectedOption === 'B'}
            onSelect={() => setSelectedOption('B')}
            disabled={hasVoted}
          />
        </div>

        {/* Countdown Timer */}
        <CountdownTimer
          endTime={new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)} // 3 days from now
        />

        {/* Vote Button or Start Deliberation */}
        {!isDeliberating && !result ? (
          <button
            onClick={handleStartDeliberation}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-full hover:bg-blue-500 transition-colors mb-6"
          >
            Start AI Committee Deliberation
          </button>
        ) : (
          <VoteButton
            onVote={handleVote}
            disabled={!selectedOption || hasVoted || isDeliberating}
            hasVoted={hasVoted}
          />
        )}

        {/* Live Debate Section */}
        <LiveDebate
          messages={messages}
          isDeliberating={isDeliberating}
          currentPhase={currentPhase}
          participantCount={agentStatuses.length}
        />
        
        {/* AI Agent Messages Log */}
        <MessageLog 
          messages={messages}
          showDetails={true}
        />

        {/* Debate Summary / TL;DR */}
        {messages.length > 0 && (
          <DebateSummary
            messages={messages}
            result={result}
            visualization={visualization}
          />
        )}

        {/* Connection Status */}
        {deliberationId && (
          <div className="fixed bottom-4 right-4 flex items-center space-x-2 bg-gray-900 px-3 py-2 rounded-full text-sm">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <span className="text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            {!isConnected && (
              <button
                onClick={reconnect}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Reconnect
              </button>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-red-600/20 border border-red-500/50 rounded-lg p-4 backdrop-blur-lg">
            <div className="flex items-center space-x-2">
              <span className="text-red-400">⚠️</span>
              <span className="text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* Results */}
        {result && currentPhase === 'completed' && (
          <div className="mt-8 bg-gradient-to-r from-green-600/10 to-blue-600/10 border border-green-500/30 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-green-300 mb-4">
              🏆 Committee Decision Complete
            </h3>
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                {result.winnerId} Win!
              </div>
              <div className="text-sm text-gray-400">
                Confidence: {(result.metadata.confidence * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;