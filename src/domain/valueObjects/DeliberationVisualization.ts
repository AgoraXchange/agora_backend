import { DeliberationMessage } from './DeliberationMessage';

export interface ProgressData {
  currentPhase: 'proposing' | 'discussion' | 'consensus' | 'completed';
  completedSteps: string[];
  totalSteps: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
}

export interface VotingData {
  method: 'majority' | 'borda' | 'weighted_voting' | 'approval';
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

export interface PairwiseComparisonData {
  proposals: Array<{
    id: string;
    agentName: string;
    winner: string;
    confidence: number;
  }>;
  comparisons: Array<{
    proposalAId: string;
    proposalBId: string;
    proposalAName: string;
    proposalBName: string;
    winner: 'A' | 'B' | 'tie';
    scoreA: number;
    scoreB: number;
    reasoning: string;
    round: number;
  }>;
  matrix: number[][]; // Win/loss matrix for visualization
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

export interface TimelineData {
  events: Array<{
    timestamp: Date;
    phase: string;
    event: string;
    description: string;
    duration?: number;
    agentName?: string;
  }>;
  totalDuration: number;
  phaseBreakdown: Record<string, number>;
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

export class DeliberationVisualization {
  constructor(
    public readonly messages: DeliberationMessage[],
    public readonly progress: ProgressData,
    public readonly voting: VotingData,
    public readonly pairwiseMatrix: PairwiseComparisonData,
    public readonly evaluationRadar: EvaluationRadarData,
    public readonly timeline: TimelineData,
    public readonly costBreakdown: CostBreakdownData,
    public readonly metadata: {
      contractId: string;
      committeeDecisionId: string;
      createdAt: Date;
      finalWinner: string;
      finalConfidence: number;
    }
  ) {}

  /**
   * Gets messages filtered by phase
   */
  getMessagesByPhase(phase: string): DeliberationMessage[] {
    return this.messages.filter(m => m.phase === phase);
  }

  /**
   * Gets messages filtered by agent
   */
  getMessagesByAgent(agentId: string): DeliberationMessage[] {
    return this.messages.filter(m => m.agentId === agentId);
  }

  /**
   * Gets critical messages only
   */
  getCriticalMessages(): DeliberationMessage[] {
    return this.messages.filter(m => m.isCritical());
  }

  /**
   * Gets timeline of key events
   */
  getKeyTimeline(): Array<{
    timestamp: Date;
    event: string;
    description: string;
  }> {
    return this.messages
      .filter(m => m.isCritical())
      .map(m => ({
        timestamp: m.metadata.timestamp,
        event: m.messageType,
        description: m.getSummary()
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Gets voting visualization data for charts
   */
  getVotingChartData() {
    const choices = Object.keys(this.voting.distribution);
    return {
      labels: choices,
      datasets: [{
        label: 'Weighted Votes',
        data: choices.map(choice => this.voting.distribution[choice]),
        backgroundColor: choices.map((_, index) => 
          `hsl(${(index * 137.508) % 360}, 70%, 60%)`
        )
      }]
    };
  }

  /**
   * Gets radar chart data for evaluation scores
   */
  getRadarChartData() {
    return {
      labels: this.evaluationRadar.criteria,
      datasets: this.evaluationRadar.proposals.map((proposal, index) => ({
        label: `${proposal.agentName} (${proposal.winner})`,
        data: proposal.scores,
        borderColor: `hsl(${(index * 137.508) % 360}, 70%, 50%)`,
        backgroundColor: `hsla(${(index * 137.508) % 360}, 70%, 50%, 0.2)`,
        pointBackgroundColor: `hsl(${(index * 137.508) % 360}, 70%, 50%)`
      }))
    };
  }

  /**
   * Gets pairwise comparison matrix for heatmap
   */
  getPairwiseHeatmapData() {
    const agents = this.pairwiseMatrix.proposals.map(p => p.agentName);
    const matrix = this.pairwiseMatrix.matrix;
    
    return {
      xLabels: agents,
      yLabels: agents,
      data: matrix.map((row, i) => 
        row.map((value, j) => ({
          x: j,
          y: i,
          v: value,
          label: `${agents[i]} vs ${agents[j]}: ${value > 0.5 ? 'Win' : value < 0.5 ? 'Loss' : 'Tie'}`
        }))
      ).flat()
    };
  }

  /**
   * Gets performance metrics summary
   */
  getPerformanceMetrics() {
    const totalMessages = this.messages.length;
    const avgProcessingTime = this.messages
      .filter(m => m.metadata.processingTimeMs)
      .reduce((sum, m) => sum + (m.metadata.processingTimeMs || 0), 0) / totalMessages;

    return {
      totalMessages,
      totalDuration: this.timeline.totalDuration,
      avgProcessingTime: Math.round(avgProcessingTime),
      totalTokens: this.costBreakdown.proposerCosts.reduce((sum, p) => sum + p.tokenUsage, 0) +
                   this.costBreakdown.judgeCosts.totalTokens +
                   this.costBreakdown.synthesisCosts.tokenUsage,
      totalCost: this.costBreakdown.totalCost,
      efficiency: this.metadata.finalConfidence / (this.costBreakdown.totalCost || 1),
      consensusStrength: this.voting.margin
    };
  }

  /**
   * Exports the visualization data to a summary format
   */
  toSummary() {
    return {
      contract: {
        id: this.metadata.contractId,
        finalWinner: this.metadata.finalWinner,
        confidence: this.metadata.finalConfidence,
        createdAt: this.metadata.createdAt
      },
      process: {
        totalDuration: this.timeline.totalDuration,
        phases: this.timeline.phaseBreakdown,
        method: this.voting.method,
        consensusLevel: this.voting.margin
      },
      participants: this.voting.votes.map(v => ({
        agent: v.agentName,
        choice: v.choice,
        confidence: v.confidence,
        contribution: v.contribution
      })),
      costs: {
        totalCost: this.costBreakdown.totalCost,
        tokenUsage: this.getPerformanceMetrics().totalTokens,
        efficiency: this.getPerformanceMetrics().efficiency
      },
      keyEvents: this.getKeyTimeline()
    };
  }
}
