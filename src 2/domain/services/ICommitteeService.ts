import { AIAnalysisInput, AIAnalysisResult } from './IAIService';
import { CommitteeDecision } from '../entities/CommitteeDecision';
import { DeliberationVisualization } from '../valueObjects/DeliberationVisualization';
import { DeliberationMessage } from '../valueObjects/DeliberationMessage';

export interface CommitteeDeliberationInput extends AIAnalysisInput {
  deliberationId?: string; // Pre-generated deliberation ID for SSE streaming
  minProposals?: number;
  maxProposalsPerAgent?: number;
  consensusThreshold?: number;
  enableEarlyExit?: boolean;
}

export interface CommitteeDeliberationResult extends AIAnalysisResult {
  committeeDecision: CommitteeDecision;
  deliberationMetrics: {
    totalProposals: number;
    deliberationTimeMs: number;
    consensusLevel: number;
    costBreakdown: {
      proposerTokens: number;
      judgeTokens: number;
      synthesizerTokens: number;
    };
  };
  // Visualization data for frontend
  visualization?: DeliberationVisualization;
  messages?: DeliberationMessage[];
}

export interface ICommitteeService {
  /**
   * Orchestrates the full committee deliberation process
   */
  deliberateAndDecide(input: CommitteeDeliberationInput): Promise<CommitteeDeliberationResult>;
  
  /**
   * Gets the current committee configuration
   */
  getCommitteeConfig(): CommitteeConfiguration;
  
  /**
   * Updates agent weights based on performance
   */
  updateAgentWeights(agentId: string, performance: number): void;
}

export interface CommitteeConfiguration {
  enabledProposers: string[];
  judgeConfiguration: {
    ruleBasedWeight: number;
    llmWeight: number;
    pairwiseRounds: number;
  };
  consensusMethod: 'majority' | 'borda' | 'weighted_voting';
  earlyExitThreshold: number;
  agentWeights: Record<string, number>;
}