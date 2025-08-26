import React, { useState } from 'react';

interface ContractInputProps {
  contractId: string;
  onContractIdChange: (contractId: string) => void;
  disabled?: boolean;
}

export function ContractInput({
  contractId,
  onContractIdChange,
  disabled = false
}: ContractInputProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const validateContractId = (id: string) => {
    if (!id.trim()) {
      return 'Contract ID is required';
    }
    
    if (id.length < 3) {
      return 'Contract ID must be at least 3 characters';
    }
    
    if (id.length > 100) {
      return 'Contract ID cannot exceed 100 characters';
    }
    
    // Basic format validation (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return 'Contract ID can only contain letters, numbers, hyphens, and underscores';
    }
    
    return null;
  };

  const handleContractIdChange = (value: string) => {
    onContractIdChange(value);
    
    // Real-time validation
    const error = validateContractId(value);
    setValidationMessage(error);
  };

  const handlePasteExample = (exampleId: string) => {
    handleContractIdChange(exampleId);
  };

  const exampleContracts = [
    { id: 'contract_001', description: 'Simple test contract' },
    { id: 'sports_match_2024', description: 'Sports event contract' },
    { id: 'market_prediction_btc', description: 'Crypto market prediction' },
    { id: 'election_result_2024', description: 'Election outcome contract' }
  ];

  const isValid = !validationMessage && contractId.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="contractId" className="block text-sm font-medium text-gray-300 mb-2">
          Contract ID
        </label>
        <div className="relative">
          <input
            id="contractId"
            type="text"
            value={contractId}
            onChange={(e) => handleContractIdChange(e.target.value)}
            placeholder="Enter a contract ID (e.g., contract_001)"
            className={`w-full px-3 py-2 bg-gray-700 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors ${
              validationMessage
                ? 'border-red-500 focus:ring-red-500/50'
                : isValid
                ? 'border-green-500 focus:ring-green-500/50'
                : 'border-gray-600 focus:ring-blue-500/50'
            }`}
            disabled={disabled}
          />
          
          {/* Validation Icon */}
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            {isValidating && (
              <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />
            )}
            {!isValidating && isValid && (
              <span className="text-green-400">✓</span>
            )}
            {!isValidating && validationMessage && (
              <span className="text-red-400">✗</span>
            )}
          </div>
        </div>
        
        {/* Validation Message */}
        {validationMessage && (
          <p className="mt-1 text-sm text-red-400 flex items-center space-x-1">
            <span>⚠️</span>
            <span>{validationMessage}</span>
          </p>
        )}
        
        {/* Help Text */}
        <p className="mt-1 text-xs text-gray-500">
          Enter an existing contract ID from your Oracle system, or use one of the examples below.
        </p>
      </div>

      {/* Example Contracts */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Quick Examples
        </label>
        <div className="grid grid-cols-1 gap-2">
          {exampleContracts.map((example) => (
            <button
              key={example.id}
              onClick={() => handlePasteExample(example.id)}
              className="text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg border border-gray-600 hover:border-gray-500 transition-colors group"
              disabled={disabled}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-mono text-blue-300 group-hover:text-blue-200">
                    {example.id}
                  </div>
                  <div className="text-xs text-gray-400">
                    {example.description}
                  </div>
                </div>
                <div className="text-gray-500 group-hover:text-gray-400 text-sm">
                  Click to use
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Contract Info Preview */}
      {isValid && (
        <div className="p-3 bg-gray-700/30 border border-gray-600 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Contract Preview</h4>
          <div className="space-y-1 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Contract ID:</span>
              <span className="font-mono text-blue-300">{contractId}</span>
            </div>
            <div className="flex justify-between">
              <span>Length:</span>
              <span>{contractId.length} characters</span>
            </div>
            <div className="flex justify-between">
              <span>Format:</span>
              <span className="text-green-400">✓ Valid</span>
            </div>
          </div>
          
          <div className="mt-2 p-2 bg-blue-600/10 border border-blue-500/30 rounded text-xs">
            <strong className="text-blue-300">Note:</strong>
            <span className="text-blue-400 ml-1">
              This will trigger a real deliberation on your Oracle backend. Make sure the contract exists or is accessible.
            </span>
          </div>
        </div>
      )}

      {/* Advanced Options Toggle */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white transition-colors flex items-center space-x-2">
          <span className="group-open:rotate-90 transition-transform">▶</span>
          <span>Advanced Options</span>
        </summary>
        
        <div className="mt-2 p-3 bg-gray-700/30 border border-gray-600 rounded-lg space-y-3">
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                className="rounded bg-gray-600 border-gray-500 text-blue-600 focus:ring-blue-500/50"
                disabled={disabled}
              />
              <span className="text-sm text-gray-300">Validate contract exists before starting</span>
            </label>
          </div>
          
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                className="rounded bg-gray-600 border-gray-500 text-blue-600 focus:ring-blue-500/50"
                disabled={disabled}
              />
              <span className="text-sm text-gray-300">Use mock data if contract not found</span>
            </label>
          </div>
        </div>
      </details>
    </div>
  );
}