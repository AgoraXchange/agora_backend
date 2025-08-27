import { Party } from '../entities/Party';
import { DecisionMetadata } from '../entities/OracleDecision';

export interface AIAnalysisInput {
  partyA: Party;
  partyB: Party;
  contractId: string;
  additionalContext?: Record<string, any>;
}

export interface AIAnalysisResult {
  winnerId: string;
  metadata: DecisionMetadata;
}

export interface IAIService {
  analyzeAndDecideWinner(input: AIAnalysisInput): Promise<AIAnalysisResult>;
}