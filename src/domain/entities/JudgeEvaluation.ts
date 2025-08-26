export interface EvaluationCriteria {
  completeness: number;      // 0-1: How complete is the analysis
  consistency: number;       // 0-1: Internal logical consistency
  evidenceQuality: number;   // 0-1: Quality of supporting evidence
  clarity: number;           // 0-1: Clarity of reasoning
  relevance: number;         // 0-1: Relevance to the specific case
}

export interface PairwiseResult {
  opponentProposalId: string;
  result: 'win' | 'lose' | 'tie';
  score: number;
  reasoning: string;
}

export class JudgeEvaluation {
  constructor(
    public readonly id: string,
    public readonly proposalId: string,
    public readonly judgeId: string,
    public readonly judgeName: string,
    public readonly ruleBasedScore: number,
    public readonly criteria: EvaluationCriteria,
    public readonly pairwiseResults: PairwiseResult[],
    public readonly overallScore: number,
    public readonly reasoning: string[],
    public readonly confidence: number,
    public readonly metadata: {
      evaluationTimeMs: number;
      tokenUsage?: number;
      evaluationMethod: string;
    },
    public readonly createdAt: Date = new Date()
  ) {
    if (ruleBasedScore < 0 || ruleBasedScore > 1) {
      throw new Error('Rule-based score must be between 0 and 1');
    }
    
    if (confidence < 0 || confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }
    
    if (overallScore < 0 || overallScore > 1) {
      throw new Error('Overall score must be between 0 and 1');
    }
  }

  /**
   * Calculates pairwise win rate
   */
  getPairwiseWinRate(): number {
    if (this.pairwiseResults.length === 0) return 0;
    
    const wins = this.pairwiseResults.filter(r => r.result === 'win').length;
    const ties = this.pairwiseResults.filter(r => r.result === 'tie').length;
    
    return (wins + ties * 0.5) / this.pairwiseResults.length;
  }

  /**
   * Gets average pairwise score
   */
  getAveragePairwiseScore(): number {
    if (this.pairwiseResults.length === 0) return 0;
    
    const totalScore = this.pairwiseResults.reduce((sum, result) => sum + result.score, 0);
    return totalScore / this.pairwiseResults.length;
  }

  /**
   * Calculates weighted final score combining rule-based and pairwise scores
   */
  getWeightedScore(ruleWeight = 0.4, pairwiseWeight = 0.6): number {
    const pairwiseScore = this.getAveragePairwiseScore();
    return (this.ruleBasedScore * ruleWeight) + (pairwiseScore * pairwiseWeight);
  }

  /**
   * Gets criteria average score
   */
  getCriteriaAverage(): number {
    const { completeness, consistency, evidenceQuality, clarity, relevance } = this.criteria;
    return (completeness + consistency + evidenceQuality + clarity + relevance) / 5;
  }

  /**
   * Checks if this is a high-quality evaluation
   */
  isHighQuality(): boolean {
    return this.overallScore >= 0.7 && 
           this.confidence >= 0.8 && 
           this.reasoning.length >= 2;
  }

  /**
   * Gets detailed summary for reporting
   */
  getDetailedSummary(): {
    proposalId: string;
    judgeId: string;
    scores: {
      ruleBasedScore: number;
      pairwiseWinRate: number;
      averagePairwiseScore: number;
      overallScore: number;
      weightedScore: number;
    };
    qualityIndicators: {
      isHighQuality: boolean;
      confidence: number;
      reasoningCount: number;
    };
  } {
    return {
      proposalId: this.proposalId,
      judgeId: this.judgeId,
      scores: {
        ruleBasedScore: this.ruleBasedScore,
        pairwiseWinRate: this.getPairwiseWinRate(),
        averagePairwiseScore: this.getAveragePairwiseScore(),
        overallScore: this.overallScore,
        weightedScore: this.getWeightedScore()
      },
      qualityIndicators: {
        isHighQuality: this.isHighQuality(),
        confidence: this.confidence,
        reasoningCount: this.reasoning.length
      }
    };
  }
}