export type DeliberationPhase = 'proposing' | 'judging' | 'consensus' | 'completed';
export type MessageType = 'proposal' | 'evaluation' | 'comparison' | 'vote' | 'synthesis' | 'progress' | 'phase_start' | 'phase_complete';

export interface DeliberationMessageContent {
  text?: string;
  winner?: string;
  confidence?: number;
  scores?: Record<string, number | Record<string, number>>;
  evidence?: string[];
  reasoning?: string | string[];
  dataPoints?: Record<string, any>;
  alternativeChoices?: Array<{ choice: string; probability: number }>;
  // For pairwise comparisons
  proposalAId?: string;
  proposalBId?: string;
  scoreA?: number;
  scoreB?: number;
  // For voting
  choice?: string;
  weight?: number;
  contribution?: number;
  progress?: {
    step: string;
    percentComplete: number;
  };
}

export interface DeliberationMessageMetadata {
  timestamp: Date;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUSD: number;
  };
  processingTimeMs?: number;
  round?: number;
  error?: string;
}

export interface DeliberationMessage {
  id?: string;
  phase: DeliberationPhase;
  messageType: MessageType;
  content: DeliberationMessageContent;
  metadata: DeliberationMessageMetadata;
  agentId?: string;
  agentName?: string;
}

export interface VotingData {
  method: string;
  votes: Array<{
    agentId: string;
    agentName: string;
    choice: string;
    confidence: number;
    weight: number;
    contribution: number;
  }>;
  distribution: Record<string, number>;
  winner: string;
  margin: number;
  totalWeight: number;
}

export interface PairwiseComparisonEntry {
  proposalAId: string;
  proposalBId: string;
  winner: string;
  scoreA: number;
  scoreB: number;
  reasoning: string;
  round: number;
}

export interface ProgressData {
  currentPhase: DeliberationPhase;
  currentStep: string;
  completedSteps: string[];
  totalSteps: number;
  percentComplete: number;
  estimatedCompletionTime?: Date;
}

export interface EvaluationRadarData {
  criteria: string[];
  proposals: Array<{
    id: string;
    agentName: string;
    winner: string;
    scores: number[];
    overallScore: number;
  }>;
  maxScore: number;
}

export interface CostBreakdownData {
  proposerCosts: Array<{
    agentId: string;
    agentName: string;
    tokenUsage: number;
    estimatedCost: number;
  }>;
  judgeCosts: {
    ruleBasedTokens: number;
    pairwiseTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  synthesisCosts: {
    tokenUsage: number;
    estimatedCost: number;
  };
  totalCost: number;
}

export interface DeliberationVisualization {
  id: string;
  contractId: string;
  finalWinner: string;
  confidenceLevel: number;
  residualUncertainty: number;
  deliberationTimeMs: number;
  timestamp: Date;

  messages: DeliberationMessage[];

  progress: ProgressData;

  voting: VotingData;

  pairwiseMatrix: PairwiseComparisonEntry[];

  evaluationRadar: EvaluationRadarData;

  costBreakdown: CostBreakdownData;
}

export interface DeliberationEventPayload {
  contractId: string;
  deliberationId: string;
  timestamp: Date;
  type: 'deliberationStarted' | 'phaseStart' | 'proposalGenerated' | 'judgmentCompleted' | 'pairwiseComparisonCompleted' | 'consensusReached' | 'deliberationComplete' | 'error';
  data?: DeliberationMessage | DeliberationVisualization | any;
}