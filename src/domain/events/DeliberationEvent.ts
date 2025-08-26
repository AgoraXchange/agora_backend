import { DeliberationMessage } from '../valueObjects/DeliberationMessage';

export abstract class DeliberationEvent {
  constructor(
    public readonly contractId: string,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class DeliberationStartedEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly agentCount: number,
    public readonly expectedDuration: number
  ) {
    super(contractId);
  }
}

export class ProposalGeneratedEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly agentId: string,
    public readonly agentName: string,
    public readonly proposalId: string,
    public readonly winner: string,
    public readonly confidence: number
  ) {
    super(contractId);
  }
}

export class ProposalPhaseCompletedEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly totalProposals: number,
    public readonly winnerDistribution: Record<string, number>
  ) {
    super(contractId);
  }
}

export class EvaluationStartedEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly evaluationType: 'rule_based' | 'pairwise'
  ) {
    super(contractId);
  }
}

export class PairwiseComparisonEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly proposalAId: string,
    public readonly proposalBId: string,
    public readonly winner: string,
    public readonly round: number
  ) {
    super(contractId);
  }
}

export class JudgmentPhaseCompletedEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly rankings: Array<{
      proposalId: string;
      score: number;
      rank: number;
    }>
  ) {
    super(contractId);
  }
}

export class VotingStartedEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly method: string,
    public readonly participantCount: number
  ) {
    super(contractId);
  }
}

export class VoteCastEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly agentId: string,
    public readonly choice: string,
    public readonly weight: number
  ) {
    super(contractId);
  }
}

export class ConsensusReachedEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly finalWinner: string,
    public readonly confidence: number,
    public readonly margin: number,
    public readonly method: string
  ) {
    super(contractId);
  }
}

export class DeliberationCompletedEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly finalWinner: string,
    public readonly totalDuration: number,
    public readonly decisionId: string,
    public readonly metrics: {
      totalProposals: number;
      totalComparisons: number;
      consensusLevel: number;
      totalCost: number;
    }
  ) {
    super(contractId);
  }
}

export class DeliberationErrorEvent extends DeliberationEvent {
  constructor(
    contractId: string,
    public readonly error: string,
    public readonly phase: string,
    public readonly recoverable: boolean
  ) {
    super(contractId);
  }
}

// Event types union for type safety
export type DeliberationEventType = 
  | DeliberationStartedEvent
  | ProposalGeneratedEvent
  | ProposalPhaseCompletedEvent
  | EvaluationStartedEvent
  | PairwiseComparisonEvent
  | JudgmentPhaseCompletedEvent
  | VotingStartedEvent
  | VoteCastEvent
  | ConsensusReachedEvent
  | DeliberationCompletedEvent
  | DeliberationErrorEvent;

// Event listener interface
export interface IDeliberationEventListener {
  onDeliberationStarted?(event: DeliberationStartedEvent): void;
  onProposalGenerated?(event: ProposalGeneratedEvent): void;
  onProposalPhaseCompleted?(event: ProposalPhaseCompletedEvent): void;
  onEvaluationStarted?(event: EvaluationStartedEvent): void;
  onPairwiseComparison?(event: PairwiseComparisonEvent): void;
  onJudgmentPhaseCompleted?(event: JudgmentPhaseCompletedEvent): void;
  onVotingStarted?(event: VotingStartedEvent): void;
  onVoteCast?(event: VoteCastEvent): void;
  onConsensusReached?(event: ConsensusReachedEvent): void;
  onDeliberationCompleted?(event: DeliberationCompletedEvent): void;
  onDeliberationError?(event: DeliberationErrorEvent): void;
}