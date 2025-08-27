import { AgentProposal } from './AgentProposal';
import { JudgeEvaluation } from './JudgeEvaluation';
import { ConsensusResult } from '../valueObjects/ConsensusResult';

export type ConsensusMethod = 'majority' | 'borda' | 'weighted_voting' | 'approval';

export interface DeliberationMetrics {
  totalProposals: number;
  totalEvaluations: number;
  deliberationStartTime: Date;
  deliberationEndTime: Date;
  deliberationTimeMs: number;
  consensusReachedAt: Date;
  earlyExitTriggered: boolean;
  costBreakdown: {
    proposerTokens: number;
    judgeTokens: number;
    synthesizerTokens: number;
    totalCostUSD: number;
  };
  qualityMetrics: {
    averageProposalConfidence: number;
    averageEvaluationConfidence: number;
    consensusLevel: number;
    diversityScore: number;
  };
}

export class CommitteeDecision {
  constructor(
    public readonly id: string,
    public readonly contractId: string,
    public readonly finalWinnerId: string,
    public readonly proposals: AgentProposal[],
    public readonly evaluations: JudgeEvaluation[],
    public readonly consensus: ConsensusResult,
    public readonly method: ConsensusMethod,
    public readonly metrics: DeliberationMetrics,
    public readonly createdAt: Date = new Date()
  ) {
    if (proposals.length === 0) {
      throw new Error('Committee decision must have at least one proposal');
    }
    
    if (!finalWinnerId || finalWinnerId.trim() === '') {
      throw new Error('Final winner ID cannot be empty');
    }
    
    // Validate that final winner is among the proposed winners
    const proposedWinners = proposals.map(p => p.winnerId);
    if (!proposedWinners.includes(finalWinnerId)) {
      throw new Error('Final winner must be one of the proposed winners');
    }
  }

  /**
   * Gets the winning proposal(s) that match the final decision
   */
  getWinningProposals(): AgentProposal[] {
    return this.proposals.filter(p => p.winnerId === this.finalWinnerId);
  }

  /**
   * Gets proposals grouped by winner choice
   */
  getProposalsByWinner(): Record<string, AgentProposal[]> {
    return this.proposals.reduce((acc, proposal) => {
      const winnerId = proposal.winnerId;
      if (!acc[winnerId]) {
        acc[winnerId] = [];
      }
      acc[winnerId].push(proposal);
      return acc;
    }, {} as Record<string, AgentProposal[]>);
  }

  /**
   * Calculates the consensus strength (how unified the committee was)
   */
  getConsensusStrength(): number {
    const winningProposals = this.getWinningProposals();
    return winningProposals.length / this.proposals.length;
  }

  /**
   * Gets the average confidence of winning proposals
   */
  getWinningConfidence(): number {
    const winningProposals = this.getWinningProposals();
    if (winningProposals.length === 0) return 0;
    
    const totalConfidence = winningProposals.reduce((sum, p) => sum + p.confidence, 0);
    return totalConfidence / winningProposals.length;
  }

  /**
   * Gets diversity score (how diverse the initial proposals were)
   */
  getDiversityScore(): number {
    const uniqueWinners = new Set(this.proposals.map(p => p.winnerId));
    const maxDiversity = Math.min(this.proposals.length, 2); // Max 2 different winners possible
    return uniqueWinners.size / maxDiversity;
  }

  /**
   * Checks if the decision meets high quality thresholds
   */
  isHighQualityDecision(): boolean {
    return this.consensus.confidenceLevel >= 0.8 &&
           this.getConsensusStrength() >= 0.6 &&
           this.metrics.qualityMetrics.averageEvaluationConfidence >= 0.7;
  }

  /**
   * Gets efficiency score (quality per cost)
   */
  getEfficiencyScore(): number {
    const qualityScore = this.consensus.confidenceLevel * this.getConsensusStrength();
    const costScore = Math.min(1000 / this.metrics.costBreakdown.totalCostUSD, 1); // Normalized cost efficiency
    
    return qualityScore * costScore;
  }

  /**
   * Gets a comprehensive summary for reporting
   */
  getComprehensiveSummary(): {
    decision: {
      contractId: string;
      finalWinner: string;
      method: ConsensusMethod;
      confidence: number;
    };
    deliberation: {
      totalProposals: number;
      winningProposals: number;
      consensusStrength: number;
      diversityScore: number;
      deliberationTimeMs: number;
    };
    quality: {
      isHighQuality: boolean;
      averageConfidence: number;
      residualUncertainty: number;
      efficiencyScore: number;
    };
    cost: {
      totalCostUSD: number;
      costPerProposal: number;
    };
  } {
    const winningProposals = this.getWinningProposals();
    
    return {
      decision: {
        contractId: this.contractId,
        finalWinner: this.finalWinnerId,
        method: this.method,
        confidence: this.consensus.confidenceLevel
      },
      deliberation: {
        totalProposals: this.proposals.length,
        winningProposals: winningProposals.length,
        consensusStrength: this.getConsensusStrength(),
        diversityScore: this.getDiversityScore(),
        deliberationTimeMs: this.metrics.deliberationTimeMs
      },
      quality: {
        isHighQuality: this.isHighQualityDecision(),
        averageConfidence: this.getWinningConfidence(),
        residualUncertainty: this.consensus.residualUncertainty,
        efficiencyScore: this.getEfficiencyScore()
      },
      cost: {
        totalCostUSD: this.metrics.costBreakdown.totalCostUSD,
        costPerProposal: this.metrics.costBreakdown.totalCostUSD / this.proposals.length
      }
    };
  }
}