import { injectable } from 'inversify';
import { 
  IJudgeService, 
  RuleBasedEvaluation, 
  PairwiseComparison, 
  JudgeEvaluation, 
  ProposalRanking 
} from '../../../domain/services/IAgentService';
import { AgentProposal } from '../../../domain/entities/AgentProposal';
import { RuleBasedJudge } from './RuleBasedJudge';
import { LLMJudge } from './LLMJudge';
import { logger } from '../../logging/Logger';

@injectable()
export class CommitteeJudgeService implements IJudgeService {
  private ruleBasedJudge: RuleBasedJudge;
  private llmJudge: LLMJudge;

  constructor() {
    this.ruleBasedJudge = new RuleBasedJudge();
    this.llmJudge = new LLMJudge();
  }

  async evaluateWithRules(proposals: AgentProposal[]): Promise<RuleBasedEvaluation> {
    logger.info('Starting rule-based evaluation of proposals', { count: proposals.length });
    return await this.ruleBasedJudge.evaluateProposals(proposals);
  }

  async performPairwiseComparison(
    proposalA: AgentProposal,
    proposalB: AgentProposal,
    rounds: number = 3
  ): Promise<PairwiseComparison> {
    logger.info('Starting pairwise LLM comparison', {
      proposalA: proposalA.agentName,
      proposalB: proposalB.agentName,
      rounds
    });
    
    return await this.llmJudge.performPairwiseComparison(proposalA, proposalB, rounds);
  }

  async generateRanking(evaluations: JudgeEvaluation[]): Promise<ProposalRanking> {
    if (evaluations.length === 0) {
      return {
        rankedProposals: [],
        scores: {},
        confidenceLevel: 0
      };
    }

    logger.info('Generating proposal ranking', { evaluationCount: evaluations.length });

    // Calculate combined scores for each proposal
    const scores: Record<string, number> = {};
    const confidences: number[] = [];

    evaluations.forEach(evaluation => {
      // Get the weighted score combining rule-based and pairwise evaluations
      const ruleWeight = parseFloat(process.env.JUDGE_RULE_BASED_WEIGHT || '0.4');
      const llmWeight = parseFloat(process.env.JUDGE_LLM_WEIGHT || '0.6');
      
      scores[evaluation.proposalId] = evaluation.getWeightedScore(ruleWeight, llmWeight);
      confidences.push(evaluation.confidence);
    });

    // Sort proposals by score (highest first)
    const rankedProposals = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);

    // Calculate overall confidence level
    const averageConfidence = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
    
    // Adjust confidence based on score distribution (more confidence if there's a clear winner)
    const topScore = scores[rankedProposals[0]] || 0;
    const secondScore = scores[rankedProposals[1]] || 0;
    const scoreGap = Math.abs(topScore - secondScore);
    
    // Higher gap = higher confidence in ranking
    const gapBonus = Math.min(0.2, scoreGap * 0.5);
    const confidenceLevel = Math.min(1.0, averageConfidence + gapBonus);

    logger.info('Ranking generated', {
      topProposal: rankedProposals[0],
      topScore: topScore.toFixed(3),
      scoreGap: scoreGap.toFixed(3),
      confidenceLevel: confidenceLevel.toFixed(3)
    });

    return {
      rankedProposals,
      scores,
      confidenceLevel
    };
  }

  // Comprehensive evaluation combining all judgment methods
  async comprehensiveEvaluation(proposals: AgentProposal[]): Promise<{
    evaluations: JudgeEvaluation[];
    ranking: ProposalRanking;
    metadata: {
      ruleBasedEvaluation: RuleBasedEvaluation;
      pairwiseComparisons: PairwiseComparison[];
      evaluationTimeMs: number;
    };
  }> {
    const startTime = Date.now();
    logger.info('Starting comprehensive proposal evaluation', { proposalCount: proposals.length });

    try {
      // Step 1: Rule-based evaluation
      const ruleBasedEvaluation = await this.evaluateWithRules(proposals);
      
      // Step 2: Pairwise comparisons
      const pairwiseComparisons: PairwiseComparison[] = [];
      const pairwisePromises: Promise<{ comparison: PairwiseComparison; proposalAId: string; proposalBId: string }>[] = [];

      for (let i = 0; i < proposals.length; i++) {
        for (let j = i + 1; j < proposals.length; j++) {
          const rounds = parseInt(process.env.JUDGE_PAIRWISE_ROUNDS || '3');
          pairwisePromises.push(
            this.performPairwiseComparison(proposals[i], proposals[j], rounds)
              .then(comparison => ({
                comparison,
                proposalAId: proposals[i].id,
                proposalBId: proposals[j].id
              }))
          );
        }
      }

      const pairwiseResults = await Promise.all(pairwisePromises);
      pairwiseResults.forEach(result => pairwiseComparisons.push(result.comparison));

      // Step 3: Create comprehensive evaluations
      const evaluations: JudgeEvaluation[] = proposals.map(proposal => {
        return this.createComprehensiveEvaluation(
          proposal, 
          ruleBasedEvaluation, 
          pairwiseResults
        );
      });

      // Step 4: Generate final ranking
      const ranking = await this.generateRanking(evaluations);

      const evaluationTimeMs = Date.now() - startTime;

      logger.info('Comprehensive evaluation completed', {
        proposalCount: proposals.length,
        pairwiseComparisons: pairwiseComparisons.length,
        evaluationTimeMs,
        topRankedProposal: ranking.rankedProposals[0]
      });

      return {
        evaluations,
        ranking,
        metadata: {
          ruleBasedEvaluation,
          pairwiseComparisons,
          evaluationTimeMs
        }
      };

    } catch (error) {
      logger.error('Comprehensive evaluation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private createComprehensiveEvaluation(
    proposal: AgentProposal,
    ruleBasedEvaluation: RuleBasedEvaluation,
    pairwiseResults: { comparison: PairwiseComparison; proposalAId: string; proposalBId: string }[]
  ): JudgeEvaluation {
    // Extract rule-based scores
    const ruleBasedScore = ruleBasedEvaluation.scores[proposal.id] || 0;
    const criteria = {
      completeness: ruleBasedEvaluation.criteria.completeness[proposal.id] || 0,
      consistency: ruleBasedEvaluation.criteria.consistency[proposal.id] || 0,
      evidenceQuality: ruleBasedEvaluation.criteria.evidenceQuality[proposal.id] || 0,
      clarity: proposal.getQualityScore(), // Use proposal's own quality assessment
      relevance: proposal.hasSufficientEvidence() ? 0.8 : 0.5
    };

    // Extract pairwise results for this proposal
    const proposalPairwiseResults = this.extractPairwiseResults(proposal.id, pairwiseResults);

    // Calculate overall score
    const pairwiseScore = this.calculatePairwiseScore(proposalPairwiseResults);
    const ruleWeight = parseFloat(process.env.JUDGE_RULE_BASED_WEIGHT || '0.4');
    const llmWeight = parseFloat(process.env.JUDGE_LLM_WEIGHT || '0.6');
    const overallScore = (ruleBasedScore * ruleWeight) + (pairwiseScore * llmWeight);

    // Generate reasoning
    const reasoning = this.generateEvaluationReasoning(proposal, ruleBasedScore, proposalPairwiseResults, criteria);

    // Calculate confidence based on consistency of evaluations
    const confidence = this.calculateEvaluationConfidence(ruleBasedScore, pairwiseScore, proposalPairwiseResults.length);

    return new JudgeEvaluation(
      `eval_${proposal.id}_${Date.now()}`,
      proposal.id,
      'committee_comprehensive_judge',
      'Committee Comprehensive Judge',
      ruleBasedScore,
      criteria,
      pairwiseResults,
      overallScore,
      reasoning,
      confidence,
      {
        evaluationTimeMs: 2000, // Placeholder
        evaluationMethod: 'rule_based_and_pairwise_comprehensive'
      }
    );
  }

  private extractPairwiseResults(
    proposalId: string, 
    pairwiseResults: { comparison: PairwiseComparison; proposalAId: string; proposalBId: string }[]
  ) {
    return pairwiseResults
      .filter(result => result.proposalAId === proposalId || result.proposalBId === proposalId)
      .map(result => {
        const isProposalA = result.proposalAId === proposalId;
        const opponentId = isProposalA ? result.proposalBId : result.proposalAId;
        
        let resultType: 'win' | 'lose' | 'tie';
        let score: number;

        if (result.comparison.winner === 'tie') {
          resultType = 'tie';
          score = 0.5;
        } else if ((result.comparison.winner === 'A' && isProposalA) || 
                   (result.comparison.winner === 'B' && !isProposalA)) {
          resultType = 'win';
          score = isProposalA ? result.comparison.scores.A : result.comparison.scores.B;
        } else {
          resultType = 'lose';
          score = isProposalA ? result.comparison.scores.A : result.comparison.scores.B;
        }

        return {
          opponentProposalId: opponentId,
          result: resultType,
          score,
          reasoning: result.comparison.reasoning.join('; ')
        };
      });
  }

  private calculatePairwiseScore(pairwiseResults: any[]): number {
    if (pairwiseResults.length === 0) return 0.5;

    const wins = pairwiseResults.filter(r => r.result === 'win').length;
    const ties = pairwiseResults.filter(r => r.result === 'tie').length;
    
    return (wins + ties * 0.5) / pairwiseResults.length;
  }

  private generateEvaluationReasoning(
    proposal: AgentProposal,
    ruleBasedScore: number,
    pairwiseResults: any[],
    criteria: any
  ): string[] {
    const reasoning = [];

    // Rule-based reasoning
    if (ruleBasedScore >= 0.8) {
      reasoning.push(`Strong rule-based performance (${ruleBasedScore.toFixed(2)}) with excellent structural quality`);
    } else if (ruleBasedScore >= 0.6) {
      reasoning.push(`Good rule-based performance (${ruleBasedScore.toFixed(2)}) with solid foundations`);
    } else {
      reasoning.push(`Moderate rule-based performance (${ruleBasedScore.toFixed(2)}) with room for improvement`);
    }

    // Pairwise reasoning
    const winRate = this.calculatePairwiseScore(pairwiseResults);
    if (winRate >= 0.7) {
      reasoning.push(`Dominant pairwise performance with ${winRate.toFixed(2)} win rate`);
    } else if (winRate >= 0.5) {
      reasoning.push(`Competitive pairwise performance with ${winRate.toFixed(2)} win rate`);
    } else {
      reasoning.push(`Challenging pairwise performance with ${winRate.toFixed(2)} win rate`);
    }

    // Criteria-specific reasoning
    const topCriteria = Object.entries(criteria)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 2);
    
    reasoning.push(`Strongest in: ${topCriteria.map(([key, value]) => `${key} (${(value as number).toFixed(2)})`).join(', ')}`);

    return reasoning;
  }

  private calculateEvaluationConfidence(
    ruleBasedScore: number, 
    pairwiseScore: number, 
    pairwiseCount: number
  ): number {
    // Base confidence from score consistency
    const scoreDifference = Math.abs(ruleBasedScore - pairwiseScore);
    const consistencyBonus = Math.max(0, 0.3 - scoreDifference);

    // Confidence boost from more pairwise comparisons
    const pairwiseBonus = Math.min(0.2, pairwiseCount * 0.05);

    // Base confidence
    const baseConfidence = (ruleBasedScore + pairwiseScore) / 2;

    return Math.min(1.0, baseConfidence + consistencyBonus + pairwiseBonus);
  }
}