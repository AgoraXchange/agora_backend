import { Party } from '../entities/Party';
import { AgentProposal } from '../entities/AgentProposal';
import { JudgeEvaluation } from '../entities/JudgeEvaluation';
import { ConsensusResult as ConsensusResultEntity } from '../valueObjects/ConsensusResult';

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
  generateRanking(evaluations: JudgeEvaluation[]): Promise<ProposalRanking>;
}

export interface ISynthesizerService {
  /**
   * Synthesizes top-ranked proposals into final consensus
   */
  synthesizeConsensus(
    rankedProposals: AgentProposal[],
    evaluations: JudgeEvaluation[]
  ): Promise<ConsensusResultEntity>;
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

export interface ProposalRanking {
  rankedProposals: string[]; // proposalIds in order
  scores: Record<string, number>;
  confidenceLevel: number;
}
