import React, { useState } from 'react';
import { TestScenarios } from './TestScenarios';
import { ContractInput } from './ContractInput';
import { CommitteeConfig } from './CommitteeConfig';
import type { TestScenario } from '@/services/mockData/testScenarios';
import type { CommitteeConfig as ICommitteeConfig } from '@/types/api';

interface ControlPanelProps {
  isDeliberating: boolean;
  onStartDeliberation: (contractId: string, config?: ICommitteeConfig) => void;
  onStopDeliberation: () => void;
  onClearMessages: () => void;
  className?: string;
}

type TabType = 'scenarios' | 'custom' | 'config';

export function ControlPanel({
  isDeliberating,
  onStartDeliberation,
  onStopDeliberation,
  onClearMessages,
  className = ''
}: ControlPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('scenarios');
  const [selectedScenario, setSelectedScenario] = useState<TestScenario | null>(null);
  const [customContractId, setCustomContractId] = useState('');
  const [committeeConfig, setCommitteeConfig] = useState<ICommitteeConfig>({
    forceCommitteeMode: true,
    committeeConfig: {
      minProposals: 3,
      maxProposalsPerAgent: 2,
      consensusThreshold: 0.7,
      enableEarlyExit: false
    }
  });

  const handleStartDeliberation = () => {
    if (activeTab === 'scenarios' && selectedScenario) {
      onStartDeliberation(selectedScenario.contractId, committeeConfig);
    } else if (activeTab === 'custom' && customContractId) {
      onStartDeliberation(customContractId, committeeConfig);
    }
  };

  const canStartDeliberation = () => {
    if (isDeliberating) return false;
    if (activeTab === 'scenarios') return !!selectedScenario;
    if (activeTab === 'custom') return !!customContractId.trim();
    return false;
  };

  const tabs = [
    { key: 'scenarios' as TabType, label: 'Test Scenarios', icon: '🎯' },
    { key: 'custom' as TabType, label: 'Custom Contract', icon: '⚙️' },
    { key: 'config' as TabType, label: 'Committee Config', icon: '🔧' }
  ];

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Control Panel</h3>
        <div className="flex space-x-2">
          {!isDeliberating && (
            <button
              onClick={onClearMessages}
              className="btn-secondary text-sm"
              title="Clear previous messages"
            >
              Clear
            </button>
          )}
          {isDeliberating ? (
            <button
              onClick={onStopDeliberation}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Stop Deliberation
            </button>
          ) : (
            <button
              onClick={handleStartDeliberation}
              disabled={!canStartDeliberation()}
              className="btn-primary"
            >
              Start Deliberation
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-600 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center space-x-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
            disabled={isDeliberating}
          >
            <span>{tab.icon}</span>
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {activeTab === 'scenarios' && (
          <TestScenarios
            selectedScenario={selectedScenario}
            onScenarioSelect={setSelectedScenario}
            disabled={isDeliberating}
          />
        )}
        
        {activeTab === 'custom' && (
          <ContractInput
            contractId={customContractId}
            onContractIdChange={setCustomContractId}
            disabled={isDeliberating}
          />
        )}
        
        {activeTab === 'config' && (
          <CommitteeConfig
            config={committeeConfig}
            onConfigChange={setCommitteeConfig}
            disabled={isDeliberating}
          />
        )}
      </div>

      {/* Status Display */}
      <div className="mt-4 p-3 bg-gray-700/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              isDeliberating ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
            }`} />
            <span className="text-sm font-medium">
              Status: {isDeliberating ? 'Deliberating' : 'Ready'}
            </span>
          </div>
          
          <div className="text-xs text-gray-400">
            {activeTab === 'scenarios' && selectedScenario && (
              <span>
                Selected: {selectedScenario.name} • 
                Expected: ~{selectedScenario.expectedDuration}s • 
                Difficulty: {selectedScenario.difficulty}
              </span>
            )}
            {activeTab === 'custom' && customContractId && (
              <span>Contract: {customContractId}</span>
            )}
          </div>
        </div>
        
        {/* Committee Config Summary */}
        <div className="mt-2 text-xs text-gray-400">
          Config: {committeeConfig.committeeConfig?.minProposals || 3} proposals • 
          Threshold: {((committeeConfig.committeeConfig?.consensusThreshold || 0.7) * 100).toFixed(0)}% • 
          Early Exit: {committeeConfig.committeeConfig?.enableEarlyExit ? 'On' : 'Off'}
        </div>
      </div>
    </div>
  );
}