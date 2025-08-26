import React from 'react';
import type { CommitteeConfig as ICommitteeConfig } from '@/types/api';

interface CommitteeConfigProps {
  config: ICommitteeConfig;
  onConfigChange: (config: ICommitteeConfig) => void;
  disabled?: boolean;
}

export function CommitteeConfig({
  config,
  onConfigChange,
  disabled = false
}: CommitteeConfigProps) {
  const updateConfig = (updates: Partial<ICommitteeConfig>) => {
    onConfigChange({
      ...config,
      ...updates,
      committeeConfig: {
        ...config.committeeConfig,
        ...updates.committeeConfig
      }
    });
  };

  const presetConfigs = [
    {
      name: 'Quick Decision',
      description: 'Fast deliberation with early exit enabled',
      config: {
        forceCommitteeMode: true,
        committeeConfig: {
          minProposals: 2,
          maxProposalsPerAgent: 1,
          consensusThreshold: 0.6,
          enableEarlyExit: true
        }
      }
    },
    {
      name: 'Balanced',
      description: 'Standard deliberation settings',
      config: {
        forceCommitteeMode: true,
        committeeConfig: {
          minProposals: 3,
          maxProposalsPerAgent: 2,
          consensusThreshold: 0.7,
          enableEarlyExit: false
        }
      }
    },
    {
      name: 'Thorough Analysis',
      description: 'Comprehensive deliberation with high consensus requirement',
      config: {
        forceCommitteeMode: true,
        committeeConfig: {
          minProposals: 5,
          maxProposalsPerAgent: 3,
          consensusThreshold: 0.85,
          enableEarlyExit: false
        }
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Preset Configurations */}
      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-3">Quick Presets</h4>
        <div className="grid grid-cols-1 gap-2">
          {presetConfigs.map((preset) => (
            <button
              key={preset.name}
              onClick={() => onConfigChange(preset.config)}
              className="text-left p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg border border-gray-600 hover:border-gray-500 transition-colors group"
              disabled={disabled}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-200 group-hover:text-white">
                    {preset.name}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {preset.description}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {preset.config.committeeConfig?.minProposals} proposals • 
                    {(preset.config.committeeConfig?.consensusThreshold || 0) * 100}% consensus • 
                    {preset.config.committeeConfig?.enableEarlyExit ? 'Early exit' : 'No early exit'}
                  </div>
                </div>
                <div className="text-gray-500 group-hover:text-gray-400">
                  Apply
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Manual Configuration */}
      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-3">Custom Settings</h4>
        <div className="space-y-4">
          {/* Force Committee Mode */}
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={config.forceCommitteeMode}
                onChange={(e) => updateConfig({ forceCommitteeMode: e.target.checked })}
                className="rounded bg-gray-600 border-gray-500 text-blue-600 focus:ring-blue-500/50"
                disabled={disabled}
              />
              <span className="text-sm text-gray-300">Force Committee Mode</span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Ensure multiple agents participate instead of using single AI mode
            </p>
          </div>

          {/* Min Proposals */}
          <div>
            <label htmlFor="minProposals" className="block text-sm font-medium text-gray-300 mb-2">
              Minimum Proposals: {config.committeeConfig?.minProposals || 3}
            </label>
            <input
              id="minProposals"
              type="range"
              min="1"
              max="10"
              step="1"
              value={config.committeeConfig?.minProposals || 3}
              onChange={(e) => updateConfig({
                committeeConfig: { minProposals: parseInt(e.target.value) }
              })}
              className="w-full bg-gray-600 rounded-lg appearance-none cursor-pointer"
              disabled={disabled}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 (Minimal)</span>
              <span>10 (Maximum)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Minimum number of proposals required from the committee
            </p>
          </div>

          {/* Max Proposals Per Agent */}
          <div>
            <label htmlFor="maxProposalsPerAgent" className="block text-sm font-medium text-gray-300 mb-2">
              Max Proposals Per Agent: {config.committeeConfig?.maxProposalsPerAgent || 2}
            </label>
            <input
              id="maxProposalsPerAgent"
              type="range"
              min="1"
              max="5"
              step="1"
              value={config.committeeConfig?.maxProposalsPerAgent || 2}
              onChange={(e) => updateConfig({
                committeeConfig: { maxProposalsPerAgent: parseInt(e.target.value) }
              })}
              className="w-full bg-gray-600 rounded-lg appearance-none cursor-pointer"
              disabled={disabled}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 (Focused)</span>
              <span>5 (Diverse)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Maximum number of proposals each agent can submit
            </p>
          </div>

          {/* Consensus Threshold */}
          <div>
            <label htmlFor="consensusThreshold" className="block text-sm font-medium text-gray-300 mb-2">
              Consensus Threshold: {((config.committeeConfig?.consensusThreshold || 0.7) * 100).toFixed(0)}%
            </label>
            <input
              id="consensusThreshold"
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={config.committeeConfig?.consensusThreshold || 0.7}
              onChange={(e) => updateConfig({
                committeeConfig: { consensusThreshold: parseFloat(e.target.value) }
              })}
              className="w-full bg-gray-600 rounded-lg appearance-none cursor-pointer"
              disabled={disabled}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>50% (Lenient)</span>
              <span>100% (Strict)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Minimum agreement level required for consensus
            </p>
          </div>

          {/* Early Exit */}
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={config.committeeConfig?.enableEarlyExit || false}
                onChange={(e) => updateConfig({
                  committeeConfig: { enableEarlyExit: e.target.checked }
                })}
                className="rounded bg-gray-600 border-gray-500 text-blue-600 focus:ring-blue-500/50"
                disabled={disabled}
              />
              <span className="text-sm text-gray-300">Enable Early Exit</span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Allow deliberation to end early if strong consensus is reached
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Summary */}
      <div className="p-3 bg-blue-600/10 border border-blue-500/30 rounded-lg">
        <h5 className="text-sm font-medium text-blue-300 mb-2">Current Configuration</h5>
        <div className="grid grid-cols-2 gap-2 text-xs text-blue-200">
          <div className="flex justify-between">
            <span>Committee Mode:</span>
            <span className={config.forceCommitteeMode ? 'text-green-400' : 'text-red-400'}>
              {config.forceCommitteeMode ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Min Proposals:</span>
            <span>{config.committeeConfig?.minProposals || 3}</span>
          </div>
          <div className="flex justify-between">
            <span>Max Per Agent:</span>
            <span>{config.committeeConfig?.maxProposalsPerAgent || 2}</span>
          </div>
          <div className="flex justify-between">
            <span>Consensus:</span>
            <span>{((config.committeeConfig?.consensusThreshold || 0.7) * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Early Exit:</span>
            <span className={config.committeeConfig?.enableEarlyExit ? 'text-green-400' : 'text-gray-400'}>
              {config.committeeConfig?.enableEarlyExit ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
        
        {/* Estimated Duration */}
        <div className="mt-2 pt-2 border-t border-blue-500/30 text-xs text-blue-400">
          <div className="flex justify-between">
            <span>Estimated Duration:</span>
            <span>
              {config.committeeConfig?.enableEarlyExit ? '20-60s' : '45-120s'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}