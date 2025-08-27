import { injectable } from 'inversify';
import { AgentProposal } from '../../../domain/entities/AgentProposal';
import { RuleBasedEvaluation } from '../../../domain/services/IAgentService';
import { logger } from '../../logging/Logger';

export interface RuleBasedCriteria {
  minConfidence: number;
  minEvidenceCount: number;
  minRationaleLength: number;
  requiresStructuredEvidence: boolean;
  penalizeInconsistency: boolean;
}

@injectable()
export class RuleBasedJudge {
  private criteria: RuleBasedCriteria;

  constructor() {
    this.criteria = this.getDefaultCriteria();
  }

  async evaluateProposals(proposals: AgentProposal[]): Promise<RuleBasedEvaluation> {
    logger.info('Starting rule-based evaluation', { proposalCount: proposals.length });

    const scores: Record<string, number> = {};
    const completeness: Record<string, number> = {};
    const consistency: Record<string, number> = {};
    const evidenceQuality: Record<string, number> = {};

    for (const proposal of proposals) {
      const evaluation = this.evaluateSingleProposal(proposal);
      
      scores[proposal.id] = evaluation.overallScore;
      completeness[proposal.id] = evaluation.completenessScore;
      consistency[proposal.id] = evaluation.consistencyScore;
      evidenceQuality[proposal.id] = evaluation.evidenceQualityScore;

      logger.debug(`Rule-based evaluation for proposal ${proposal.id}`, {
        agentName: proposal.agentName,
        overallScore: evaluation.overallScore,
        completeness: evaluation.completenessScore,
        consistency: evaluation.consistencyScore,
        evidenceQuality: evaluation.evidenceQualityScore
      });
    }

    return {
      scores,
      criteria: {
        completeness,
        consistency,
        evidenceQuality
      }
    };
  }

  private evaluateSingleProposal(proposal: AgentProposal): {
    overallScore: number;
    completenessScore: number;
    consistencyScore: number;
    evidenceQualityScore: number;
  } {
    const completenessScore = this.evaluateCompleteness(proposal);
    const consistencyScore = this.evaluateConsistency(proposal);
    const evidenceQualityScore = this.evaluateEvidenceQuality(proposal);

    // Weighted combination of scores
    const overallScore = (
      completenessScore * 0.35 + 
      consistencyScore * 0.35 + 
      evidenceQualityScore * 0.3
    );

    return {
      overallScore,
      completenessScore,
      consistencyScore,
      evidenceQualityScore
    };
  }

  private evaluateCompleteness(proposal: AgentProposal): number {
    let score = 0;

    // Check confidence level
    if (proposal.confidence >= this.criteria.minConfidence) {
      score += 0.3;
    } else if (proposal.confidence >= this.criteria.minConfidence * 0.8) {
      score += 0.2; // Partial credit
    } else if (proposal.confidence >= this.criteria.minConfidence * 0.6) {
      score += 0.1; // Minimal credit
    }

    // Check evidence count
    if (proposal.evidence.length >= this.criteria.minEvidenceCount) {
      score += 0.3;
    } else if (proposal.evidence.length >= this.criteria.minEvidenceCount * 0.5) {
      score += 0.15; // Partial credit
    }

    // Check rationale length
    if (proposal.rationale.length >= this.criteria.minRationaleLength) {
      score += 0.25;
    } else if (proposal.rationale.length >= this.criteria.minRationaleLength * 0.7) {
      score += 0.15; // Partial credit
    } else if (proposal.rationale.length >= this.criteria.minRationaleLength * 0.4) {
      score += 0.05; // Minimal credit
    }

    // Check if all required fields are present
    const hasWinner = proposal.winnerId && proposal.winnerId.trim() !== '';
    const hasRationale = proposal.rationale && proposal.rationale.trim() !== '';
    if (hasWinner && hasRationale) {
      score += 0.15;
    }

    return Math.min(1.0, score);
  }

  private evaluateConsistency(proposal: AgentProposal): number {
    let score = 1.0; // Start with perfect score, deduct for inconsistencies
    
    // Check confidence-evidence consistency
    const highConfidence = proposal.confidence >= 0.8;
    const hasStrongEvidence = proposal.evidence.length >= 3;
    
    if (highConfidence && !hasStrongEvidence) {
      score -= 0.2; // High confidence should be backed by evidence
    }
    
    if (!highConfidence && hasStrongEvidence) {
      score -= 0.1; // Having evidence should increase confidence
    }

    // Check confidence-rationale consistency
    const longRationale = proposal.rationale.length >= 300;
    if (highConfidence && !longRationale) {
      score -= 0.15; // High confidence should come with detailed reasoning
    }

    // Check for contradictory statements in rationale
    if (this.criteria.penalizeInconsistency) {
      const inconsistencyPenalty = this.detectRationaleInconsistency(proposal.rationale);
      score -= inconsistencyPenalty;
    }

    // Check metadata consistency
    const processingTime = proposal.metadata.processingTimeMs;
    const tokenCount = proposal.metadata.tokenUsage.totalTokens;
    
    // Reasonable processing time expectations
    if (processingTime < 100 && tokenCount > 500) {
      score -= 0.1; // Suspiciously fast for large response
    }
    if (processingTime > 30000 && tokenCount < 200) {
      score -= 0.1; // Suspiciously slow for small response
    }

    return Math.max(0.0, score);
  }

  private evaluateEvidenceQuality(proposal: AgentProposal): number {
    if (proposal.evidence.length === 0) {
      return 0.1; // Minimal score for no evidence
    }

    let score = 0;
    let qualityFactors = 0;

    // Check evidence diversity
    const uniqueEvidenceTypes = new Set();
    proposal.evidence.forEach(evidence => {
      if (evidence.includes('http')) uniqueEvidenceTypes.add('url');
      if (evidence.includes('contract')) uniqueEvidenceTypes.add('contract');
      if (evidence.includes('history') || evidence.includes('historical')) uniqueEvidenceTypes.add('historical');
      if (evidence.includes('technical') || evidence.includes('specification')) uniqueEvidenceTypes.add('technical');
      if (evidence.includes('performance') || evidence.includes('metrics')) uniqueEvidenceTypes.add('performance');
    });

    if (uniqueEvidenceTypes.size >= 3) {
      score += 0.3;
      qualityFactors++;
    } else if (uniqueEvidenceTypes.size >= 2) {
      score += 0.2;
      qualityFactors++;
    }

    // Check evidence specificity
    const specificEvidence = proposal.evidence.filter(evidence => 
      evidence.length > 20 && // Not too short
      (evidence.includes('data') || evidence.includes('record') || evidence.includes('document'))
    );

    if (specificEvidence.length >= proposal.evidence.length * 0.7) {
      score += 0.25;
      qualityFactors++;
    } else if (specificEvidence.length >= proposal.evidence.length * 0.4) {
      score += 0.15;
      qualityFactors++;
    }

    // Check for structured evidence if required
    if (this.criteria.requiresStructuredEvidence) {
      const structuredEvidence = proposal.evidence.filter(evidence =>
        evidence.includes(':') || evidence.includes('=') || evidence.includes('{')
      );

      if (structuredEvidence.length >= 1) {
        score += 0.2;
        qualityFactors++;
      }
    }

    // Check evidence completeness
    const avgEvidenceLength = proposal.evidence.reduce((sum, e) => sum + e.length, 0) / proposal.evidence.length;
    if (avgEvidenceLength >= 50) {
      score += 0.15;
      qualityFactors++;
    } else if (avgEvidenceLength >= 25) {
      score += 0.1;
      qualityFactors++;
    }

    // Bonus for having many quality factors
    if (qualityFactors >= 3) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  private detectRationaleInconsistency(rationale: string): number {
    let inconsistencyPenalty = 0;
    const lowerRationale = rationale.toLowerCase();

    // Check for contradictory phrases
    const contradictions = [
      ['definitely', 'uncertain'],
      ['clear', 'unclear'],
      ['strong', 'weak'],
      ['certain', 'possibly'],
      ['always', 'sometimes'],
      ['never', 'occasionally']
    ];

    for (const [positive, negative] of contradictions) {
      if (lowerRationale.includes(positive) && lowerRationale.includes(negative)) {
        inconsistencyPenalty += 0.05;
      }
    }

    // Check for hedging after strong statements
    if (lowerRationale.includes('definitely') && lowerRationale.includes('however')) {
      inconsistencyPenalty += 0.05;
    }

    // Check for repeated contradictory winner statements
    const partyAMentions = (lowerRationale.match(/party\s*a/g) || []).length;
    const partyBMentions = (lowerRationale.match(/party\s*b/g) || []).length;
    
    if (Math.abs(partyAMentions - partyBMentions) > 3 && Math.min(partyAMentions, partyBMentions) > 0) {
      inconsistencyPenalty += 0.1; // Suspiciously unbalanced discussion
    }

    return Math.min(0.3, inconsistencyPenalty); // Cap at 30% penalty
  }

  private getDefaultCriteria(): RuleBasedCriteria {
    return {
      minConfidence: parseFloat(process.env.RULE_JUDGE_MIN_CONFIDENCE || '0.6'),
      minEvidenceCount: parseInt(process.env.RULE_JUDGE_MIN_EVIDENCE_COUNT || '2'),
      minRationaleLength: parseInt(process.env.RULE_JUDGE_MIN_RATIONALE_LENGTH || '100'),
      requiresStructuredEvidence: process.env.RULE_JUDGE_REQUIRE_STRUCTURED_EVIDENCE === 'true',
      penalizeInconsistency: process.env.RULE_JUDGE_PENALIZE_INCONSISTENCY !== 'false'
    };
  }

  // Public method to update criteria
  updateCriteria(newCriteria: Partial<RuleBasedCriteria>): void {
    this.criteria = { ...this.criteria, ...newCriteria };
    logger.info('Updated rule-based judge criteria', { criteria: this.criteria });
  }

  // Get current criteria for transparency
  getCriteria(): RuleBasedCriteria {
    return { ...this.criteria };
  }
}