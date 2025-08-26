import React from 'react';
import { DeliberationMessage, DeliberationVisualization } from '@/types/deliberation';
import type { OracleDecisionResponse } from '@/types/api';

interface DebateSummaryProps {
  messages: DeliberationMessage[];
  result: OracleDecisionResponse | null;
  visualization: DeliberationVisualization | null;
}

export const DebateSummary: React.FC<DebateSummaryProps> = ({
  messages,
  result,
  visualization
}) => {
  // Extract key viewpoints from messages
  const getViewpoints = () => {
    const proposals = messages.filter(m => m.messageType === 'proposal');
    const viewpoints: { [key: string]: string[] } = {};
    
    proposals.forEach(proposal => {
      const winner = proposal.content.winner;
      if (!viewpoints[winner]) {
        viewpoints[winner] = [];
      }
      if (proposal.content.rationale && viewpoints[winner].length < 3) {
        const rationale = proposal.content.rationale;
        const shortRationale = rationale.length > 150 
          ? rationale.substring(0, 150) + '...' 
          : rationale;
        viewpoints[winner].push(shortRationale);
      }
    });
    
    return viewpoints;
  };

  const viewpoints = getViewpoints();
  const viewpointKeys = Object.keys(viewpoints);
  
  // Extract consensus metrics
  const consensusData = visualization?.metrics;
  const opinionCount = messages.filter(m => m.messageType === 'proposal').length;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-4">
        Debate TL;DR
      </h2>
      
      <div className="bg-gray-900 rounded-xl p-4">
        <div className="text-sm text-gray-500 mb-4">
          {opinionCount} Opinions
        </div>

        {/* Viewpoints */}
        {viewpointKeys.map((winner, index) => (
          <div key={winner} className="mb-6 last:mb-0">
            <h3 className="text-white font-medium mb-3">
              Viewpoint {index + 1}: {winner}
            </h3>
            
            <div className="space-y-2">
              {viewpoints[winner].map((point, pointIndex) => (
                <div key={pointIndex} className="pl-4 border-l-2 border-gray-700">
                  <p className="text-sm text-gray-400">
                    • {point}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Consensus Metrics if available */}
        {consensusData && (
          <div className="mt-6 pt-4 border-t border-gray-800">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-gray-500 uppercase mb-1">Unanimity</div>
                <div className="text-lg font-bold text-blue-400">
                  {((consensusData.unanimityLevel || 0) * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase mb-1">Evidence</div>
                <div className="text-lg font-bold text-green-400">
                  {((consensusData.evidenceOverlap || 0) * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase mb-1">Confidence</div>
                <div className="text-lg font-bold text-purple-400">
                  {((consensusData.confidenceVariance ? 1 - consensusData.confidenceVariance : 0) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Key Insights */}
        {consensusData?.reasoning && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-400 mb-2">Key Insights</h4>
            <div className="space-y-1">
              {consensusData.reasoning.sharedPoints?.slice(0, 2).map((point, idx) => (
                <div key={idx} className="text-sm text-gray-500">
                  ✓ {point}
                </div>
              ))}
              {consensusData.reasoning.uniqueInsights?.slice(0, 2).map((point, idx) => (
                <div key={idx} className="text-sm text-gray-500">
                  ★ {point}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Express opinion input (placeholder) */}
      <div className="mt-6">
        <input
          type="text"
          placeholder="Express your opinion..."
          className="w-full bg-gray-900 text-white px-4 py-3 rounded-full border border-gray-700 focus:border-blue-500 focus:outline-none"
          disabled
        />
      </div>
    </div>
  );
};