import { IConsensusResult } from '../services/IAgentService';

export interface EvidenceSource {
  source: string;
  relevance: number;
  credibility: number;
  snippet?: string;
}

export interface ConsensusMetrics {
  unanimityLevel: number;        // 0-1: How unified were the agents
  confidenceVariance: number;    // Variance in confidence scores
  evidenceOverlap: number;       // How much evidence was shared across proposals
  reasoning: {
    sharedPoints: string[];      // Common reasoning points
    conflictingPoints: string[]; // Areas of disagreement
    uniqueInsights: string[];    // Novel insights from any agent
  };
}

export class ConsensusResult implements IConsensusResult {
  constructor(
    public readonly finalWinner: string,
    public readonly confidenceLevel: number,
    public readonly residualUncertainty: number,
    public readonly mergedEvidence: EvidenceSource[],
    public readonly synthesizedReasoning: string,
    public readonly methodology: string,
    public readonly metrics: ConsensusMetrics,
    public readonly alternativeChoices: {
      choice: string;
      probability: number;
      reasoning: string;
    }[] = [],
    public readonly qualityFlags: {
      hasMinorityDissent: boolean;
      hasInsufficientEvidence: boolean;
      hasConflictingEvidence: boolean;
      requiresHumanReview: boolean;
    } = {
      hasMinorityDissent: false,
      hasInsufficientEvidence: false,
      hasConflictingEvidence: false,
      requiresHumanReview: false
    }
  ) {
    if (confidenceLevel < 0 || confidenceLevel > 1) {
      throw new Error('Confidence level must be between 0 and 1');
    }
    
    if (residualUncertainty < 0 || residualUncertainty > 1) {
      throw new Error('Residual uncertainty must be between 0 and 1');
    }
    
    if (Math.abs((confidenceLevel + residualUncertainty) - 1) > 0.01) {
      throw new Error('Confidence level and residual uncertainty should approximately sum to 1');
    }
    
    if (!finalWinner || finalWinner.trim() === '') {
      throw new Error('Final winner cannot be empty');
    }
  }

  /**
   * Checks if consensus meets minimum quality threshold
   */
  meetsQualityThreshold(minConfidence = 0.7, maxUncertainty = 0.3): boolean {
    return this.confidenceLevel >= minConfidence && 
           this.residualUncertainty <= maxUncertainty &&
           this.mergedEvidence.length >= 2;
  }

  /**
   * Gets the strength of the consensus
   */
  getConsensusStrength(): 'strong' | 'moderate' | 'weak' {
    if (this.confidenceLevel >= 0.8 && this.metrics.unanimityLevel >= 0.8) {
      return 'strong';
    } else if (this.confidenceLevel >= 0.6 && this.metrics.unanimityLevel >= 0.6) {
      return 'moderate';
    } else {
      return 'weak';
    }
  }

  /**
   * Gets high-quality evidence sources
   */
  getHighQualityEvidence(): EvidenceSource[] {
    return this.mergedEvidence.filter(evidence => 
      evidence.relevance >= 0.7 && evidence.credibility >= 0.7
    );
  }

  /**
   * Calculates evidence diversity score
   */
  getEvidenceDiversityScore(): number {
    const uniqueSources = new Set(this.mergedEvidence.map(e => e.source));
    const maxDiversity = Math.min(this.mergedEvidence.length, 5); // Cap at 5 for normalization
    
    return uniqueSources.size / Math.max(maxDiversity, 1);
  }

  /**
   * Checks if human review is recommended
   */
  recommendsHumanReview(): boolean {
    return this.qualityFlags.requiresHumanReview ||
           this.confidenceLevel < 0.6 ||
           this.qualityFlags.hasConflictingEvidence ||
           (this.qualityFlags.hasMinorityDissent && this.metrics.unanimityLevel < 0.7);
  }

  /**
   * Gets risk factors for this decision
   */
  getRiskFactors(): string[] {
    const risks: string[] = [];
    
    if (this.confidenceLevel < 0.7) {
      risks.push('Low confidence level');
    }
    
    if (this.residualUncertainty > 0.4) {
      risks.push('High residual uncertainty');
    }
    
    if (this.qualityFlags.hasMinorityDissent) {
      risks.push('Minority dissent present');
    }
    
    if (this.qualityFlags.hasConflictingEvidence) {
      risks.push('Conflicting evidence detected');
    }
    
    if (this.mergedEvidence.length < 3) {
      risks.push('Insufficient evidence base');
    }
    
    if (this.metrics.confidenceVariance > 0.25) {
      risks.push('High variance in agent confidence');
    }
    
    return risks;
  }

  /**
   * Gets a detailed summary for audit/reporting purposes
   */
  getAuditSummary(): {
    decision: {
      winner: string;
      confidence: number;
      uncertainty: number;
      methodology: string;
    };
    consensus: {
      strength: string;
      unanimityLevel: number;
      evidenceCount: number;
      highQualityEvidenceCount: number;
    };
    quality: {
      meetsThreshold: boolean;
      recommendsHumanReview: boolean;
      riskFactors: string[];
    };
    reasoning: {
      synthesizedReasoning: string;
      sharedPoints: number;
      conflictingPoints: number;
      uniqueInsights: number;
    };
  } {
    return {
      decision: {
        winner: this.finalWinner,
        confidence: this.confidenceLevel,
        uncertainty: this.residualUncertainty,
        methodology: this.methodology
      },
      consensus: {
        strength: this.getConsensusStrength(),
        unanimityLevel: this.metrics.unanimityLevel,
        evidenceCount: this.mergedEvidence.length,
        highQualityEvidenceCount: this.getHighQualityEvidence().length
      },
      quality: {
        meetsThreshold: this.meetsQualityThreshold(),
        recommendsHumanReview: this.recommendsHumanReview(),
        riskFactors: this.getRiskFactors()
      },
      reasoning: {
        synthesizedReasoning: this.synthesizedReasoning,
        sharedPoints: this.metrics.reasoning.sharedPoints.length,
        conflictingPoints: this.metrics.reasoning.conflictingPoints.length,
        uniqueInsights: this.metrics.reasoning.uniqueInsights.length
      }
    };
  }
}