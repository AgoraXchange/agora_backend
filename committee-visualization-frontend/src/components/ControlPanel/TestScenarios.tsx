import React, { useState } from 'react';
import { TEST_SCENARIOS, SCENARIO_CATEGORIES, getScenariosByCategory } from '@/services/mockData/testScenarios';
import type { TestScenario } from '@/services/mockData/testScenarios';

interface TestScenariosProps {
  selectedScenario: TestScenario | null;
  onScenarioSelect: (scenario: TestScenario | null) => void;
  disabled?: boolean;
}

export function TestScenarios({
  selectedScenario,
  onScenarioSelect,
  disabled = false
}: TestScenariosProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);

  const filteredScenarios = selectedCategory === 'all' 
    ? TEST_SCENARIOS 
    : getScenariosByCategory(selectedCategory as any);

  const getDifficultyColor = (difficulty: TestScenario['difficulty']) => {
    switch (difficulty) {
      case 'easy': return 'text-green-400';
      case 'medium': return 'text-yellow-400';
      case 'hard': return 'text-red-400';
    }
  };

  const getDifficultyBadge = (difficulty: TestScenario['difficulty']) => {
    switch (difficulty) {
      case 'easy': return '🟢';
      case 'medium': return '🟡';
      case 'hard': return '🔴';
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          disabled={disabled}
        >
          All
        </button>
        {SCENARIO_CATEGORIES.map((category) => (
          <button
            key={category.key}
            onClick={() => setSelectedCategory(category.key)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors flex items-center space-x-1 ${
              selectedCategory === category.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            disabled={disabled}
          >
            <span>{category.icon}</span>
            <span>{category.label}</span>
          </button>
        ))}
      </div>

      {/* Scenarios List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredScenarios.map((scenario) => (
          <div
            key={scenario.id}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              selectedScenario?.id === scenario.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => {
              if (!disabled) {
                onScenarioSelect(selectedScenario?.id === scenario.id ? null : scenario);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h4 className="font-medium">{scenario.name}</h4>
                  <span className="text-xs px-2 py-0.5 bg-gray-600 rounded-full">
                    {scenario.category}
                  </span>
                  <span className={`text-xs ${getDifficultyColor(scenario.difficulty)}`}>
                    {getDifficultyBadge(scenario.difficulty)} {scenario.difficulty}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{scenario.description}</p>
                
                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                  <span>⏱️ ~{formatDuration(scenario.expectedDuration)}</span>
                  <span>❓ {scenario.options.length} options</span>
                  <span>🆔 {scenario.contractId}</span>
                </div>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedScenario(
                    expandedScenario === scenario.id ? null : scenario.id
                  );
                }}
                className="ml-2 text-gray-400 hover:text-gray-300 transition-colors"
                disabled={disabled}
              >
                {expandedScenario === scenario.id ? '▼' : '▶'}
              </button>
            </div>

            {/* Expanded Details */}
            {expandedScenario === scenario.id && (
              <div className="mt-3 pt-3 border-t border-gray-600 space-y-2">
                <div>
                  <strong className="text-sm text-gray-300">Question:</strong>
                  <p className="text-sm text-gray-400 mt-1">{scenario.question}</p>
                </div>
                
                <div>
                  <strong className="text-sm text-gray-300">Options:</strong>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {scenario.options.map((option, index) => (
                      <span
                        key={index}
                        className="text-xs px-2 py-1 bg-gray-700 rounded-full text-gray-300"
                      >
                        {option}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <strong className="text-sm text-gray-300">Metadata:</strong>
                  <div className="mt-1 text-xs text-gray-400">
                    {Object.entries(scenario.metadata).slice(0, 3).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                        <span>{String(value)}</span>
                      </div>
                    ))}
                    {Object.keys(scenario.metadata).length > 3 && (
                      <div className="text-gray-500 italic">
                        ... and {Object.keys(scenario.metadata).length - 3} more fields
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredScenarios.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">🔍</div>
          <p>No scenarios found for the selected category.</p>
        </div>
      )}

      {/* Selected Scenario Summary */}
      {selectedScenario && (
        <div className="mt-4 p-3 bg-blue-600/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-blue-300">Selected: {selectedScenario.name}</h5>
              <p className="text-sm text-blue-400 mt-1">{selectedScenario.question}</p>
            </div>
            <button
              onClick={() => onScenarioSelect(null)}
              className="text-blue-400 hover:text-blue-300 transition-colors"
              disabled={disabled}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}