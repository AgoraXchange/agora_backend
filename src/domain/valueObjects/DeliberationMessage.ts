export type DeliberationPhase = 'proposing' | 'discussion' | 'consensus' | 'completed';
export type MessageType = 'proposal' | 'evaluation' | 'comparison' | 'vote' | 'synthesis' | 'progress';

export interface DeliberationMessageContent {
  text?: string;
  winner?: string;
  confidence?: number;
  scores?: Record<string, number>;
  evidence?: string[];
  reasoning?: string[];
  progress?: {
    step: string;
    percentComplete: number;
  };
}

export interface DeliberationMessageMetadata {
  timestamp: Date;
  tokenUsage?: number;
  processingTimeMs?: number;
  round?: number;
  comparisonPair?: string;
}

export class DeliberationMessage {
  constructor(
    public readonly id: string,
    public readonly phase: DeliberationPhase,
    public readonly messageType: MessageType,
    public readonly content: DeliberationMessageContent,
    public readonly metadata: DeliberationMessageMetadata,
    public readonly agentId?: string,
    public readonly agentName?: string
  ) {}

  /**
   * Creates a proposal message
   */
  static createProposal(
    agentId: string,
    agentName: string,
    winner: string,
    confidence: number,
    rationale: string,
    evidence: string[],
    tokenUsage: number,
    processingTimeMs: number
  ): DeliberationMessage {
    return new DeliberationMessage(
      `proposal_${agentId}_${Date.now()}`,
      'proposing',
      'proposal',
      {
        text: rationale,
        winner,
        confidence,
        evidence
      },
      {
        timestamp: new Date(),
        tokenUsage,
        processingTimeMs
      },
      agentId,
      agentName
    );
  }

  /**
   * Creates an evaluation message
   */
  static createEvaluation(
    proposalId: string,
    scores: Record<string, number>,
    reasoning: string[]
  ): DeliberationMessage {
    return new DeliberationMessage(
      `evaluation_${proposalId}_${Date.now()}`,
      'discussion',
      'evaluation',
      {
        text: `규칙 기반 평가 완료: ${reasoning.join(', ')}`,
        scores,
        reasoning
      },
      {
        timestamp: new Date()
      }
    );
  }

  /**
   * Creates a pairwise comparison message
   */
  static createComparison(
    proposalAId: string,
    proposalBId: string,
    winner: string,
    scoreA: number,
    scoreB: number,
    reasoning: string[],
    round: number
  ): DeliberationMessage {
    return new DeliberationMessage(
      `comparison_${proposalAId}_${proposalBId}_${round}_${Date.now()}`,
      'discussion',
      'comparison',
      {
        text: `쌍대 비교 Round ${round}: ${winner} 승리`,
        winner,
        scores: { A: scoreA, B: scoreB },
        reasoning
      },
      {
        timestamp: new Date(),
        round,
        comparisonPair: `${proposalAId} vs ${proposalBId}`
      }
    );
  }

  /**
   * Creates a vote message
   */
  static createVote(
    agentId: string,
    agentName: string,
    choice: string,
    confidence: number,
    weight: number,
    contribution: number
  ): DeliberationMessage {
    return new DeliberationMessage(
      `vote_${agentId}_${Date.now()}`,
      'consensus',
      'vote',
      {
        text: `${agentName}의 투표: ${choice}`,
        winner: choice,
        confidence,
        scores: { weight, contribution }
      },
      {
        timestamp: new Date()
      },
      agentId,
      agentName
    );
  }

  /**
   * Creates a synthesis message
   */
  static createSynthesis(
    finalWinner: string,
    confidence: number,
    reasoning: string,
    method: string
  ): DeliberationMessage {
    return new DeliberationMessage(
      `synthesis_${Date.now()}`,
      'consensus',
      'synthesis',
      {
        text: reasoning,
        winner: finalWinner,
        confidence
      },
      {
        timestamp: new Date()
      }
    );
  }

  /**
   * Creates a progress update message
   */
  static createProgress(
    phase: DeliberationPhase,
    step: string,
    percentComplete: number
  ): DeliberationMessage {
    return new DeliberationMessage(
      `progress_${phase}_${Date.now()}`,
      phase,
      'progress',
      {
        text: `진행 상황: ${step}`,
        progress: { step, percentComplete }
      },
      {
        timestamp: new Date()
      }
    );
  }

  /**
   * Gets a human-readable summary of the message
   */
  getSummary(): string {
    const agent = this.agentName ? `[${this.agentName}] ` : '';
    const timeStr = this.metadata.timestamp.toISOString().substr(11, 8);
    
    switch (this.messageType) {
      case 'proposal':
        return `${timeStr} ${agent}제안: ${this.content.winner} (신뢰도: ${(this.content.confidence || 0) * 100}%)`;
      case 'evaluation':
        return `${timeStr} 평가: ${this.content.text}`;
      case 'comparison':
        return `${timeStr} 비교: ${this.content.text}`;
      case 'vote':
        return `${timeStr} ${agent}투표: ${this.content.winner}`;
      case 'synthesis':
        return `${timeStr} 최종 합의: ${this.content.winner} (신뢰도: ${(this.content.confidence || 0) * 100}%)`;
      case 'progress':
        return `${timeStr} ${this.content.progress?.step}`;
      default:
        return `${timeStr} ${this.content.text}`;
    }
  }

  /**
   * Checks if this is a critical message (high impact)
   */
  isCritical(): boolean {
    return this.messageType === 'synthesis' || 
           (this.messageType === 'proposal' && (this.content.confidence || 0) > 0.9) ||
           (this.messageType === 'vote');
  }
}
