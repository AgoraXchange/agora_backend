import { Party } from '../entities/Party';
import { AgentProposal } from '../entities/AgentProposal';

export interface AgentAnalysisInput {
  contractId: string;
  partyA: Party;
  partyB: Party;
  context?: Record<string, any>;
  temperature?: number;
  maxTokens?: number;
}

export interface IAgentService {
  /**
   * Unique identifier for this agent
   */
  readonly agentId: string;
  
  /**
   * Human-readable name for this agent
   */
  readonly agentName: string;
  
  /**
   * Agent type (e.g., 'gpt4', 'claude', 'gemini')
   */
  readonly agentType: string;
  
  /**
   * Generates proposals for the given input
   */
  generateProposals(input: AgentAnalysisInput, count: number): Promise<AgentProposal[]>;
  
  /**
   * Gets the current performance weight of this agent
   */
  getPerformanceWeight(): number;
  
  /**
   * Updates the performance weight based on historical accuracy
   */
  updatePerformanceWeight(newWeight: number): void;
}

export interface IJudgeService {
  /**
   * Evaluates proposals using rule-based criteria
   */
  evaluateWithRules(proposals: AgentProposal[]): Promise<RuleBasedEvaluation>;
  
  /**
   * Performs pairwise comparison using LLM
   */
  performPairwiseComparison(
    proposalA: AgentProposal, 
    proposalB: AgentProposal,
    rounds?: number
  ): Promise<PairwiseComparison>;
  
  /**
   * Generates ranking from multiple evaluations
   */
  generateRanking(evaluations: IJudgeEvaluation[]): Promise<ProposalRanking>;
}

export interface ISynthesizerService {
  /**
   * Synthesizes top-ranked proposals into final consensus
   */
  synthesizeConsensus(
    rankedProposals: AgentProposal[],
    evaluations: IJudgeEvaluation[]
  ): Promise<IConsensusResult>;
}

export interface RuleBasedEvaluation {
  scores: Record<string, number>; // proposalId -> score
  criteria: {
    completeness: Record<string, number>;
    consistency: Record<string, number>;
    evidenceQuality: Record<string, number>;
  };
}

export interface PairwiseComparison {
  winner: 'A' | 'B' | 'tie';
  scores: { A: number; B: number };
  reasoning: string[];
  confidence: number;
}

export interface IJudgeEvaluation {
  id: string;
  proposalId: string;
  judgeId: string;
  judgeName: string;
  ruleBasedScore: number;
  criteria: {
    completeness: number;
    consistency: number;
    evidenceQuality: number;
    clarity: number;
    relevance: number;
  };
  pairwiseResults: {
    opponentProposalId: string;
    result: 'win' | 'lose' | 'tie';
    score: number;
    reasoning: string;
  }[];
  overallScore: number;
  reasoning: string[];
  confidence: number;
  metadata: {
    evaluationTimeMs: number;
    tokenUsage?: number;
    evaluationMethod: string;
  };
  createdAt: Date;
  
  // Methods
  getPairwiseWinRate(): number;
  getAveragePairwiseScore(): number;
  getWeightedScore(ruleWeight?: number, llmWeight?: number): number;
  getCriteriaAverage(): number;
  isHighQuality(): boolean;
}

export interface ProposalRanking {
  rankedProposals: string[]; // proposalIds in order
  scores: Record<string, number>;
  confidenceLevel: number;
}

export interface IConsensusResult {
  finalWinner: string;
  confidenceLevel: number;
  residualUncertainty: number;
  mergedEvidence: {
    source: string;
    relevance: number;
    credibility: number;
    snippet?: string;
  }[];
  synthesizedReasoning: string;
  methodology: string;
  metrics: {
    unanimityLevel: number;
    confidenceVariance: number;
    evidenceOverlap: number;
    reasoning: {
      sharedPoints: string[];
      conflictingPoints: string[];
      uniqueInsights: string[];
    };
  };
  alternativeChoices: {
    choice: string;
    probability: number;
    reasoning: string;
  }[];
  qualityFlags: {
    hasMinorityDissent: boolean;
    hasInsufficientEvidence: boolean;
    hasConflictingEvidence: boolean;
    requiresHumanReview: boolean;
  };
}