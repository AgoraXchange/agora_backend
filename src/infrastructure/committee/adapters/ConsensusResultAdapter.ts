import { IConsensusResult } from '../../../domain/services/IAgentService';
import { ConsensusResult, EvidenceSource, ConsensusMetrics } from '../../../domain/valueObjects/ConsensusResult';

/**
 * Adapter utility to convert between IConsensusResult interface and ConsensusResult class
 * This maintains compatibility while allowing the system to use interfaces
 */
export class ConsensusResultAdapter {
  /**
   * Converts IConsensusResult interface to ConsensusResult class instance
   * Used when class methods are needed (like meetsQualityThreshold, getConsensusStrength)
   */
  static toClass(result: IConsensusResult): ConsensusResult {
    return new ConsensusResult(
      result.finalWinner,
      result.confidenceLevel,
      result.residualUncertainty,
      result.mergedEvidence,
      result.synthesizedReasoning,
      result.methodology,
      result.metrics,
      result.alternativeChoices,
      result.qualityFlags
    );
  }

  /**
   * Converts ConsensusResult class to IConsensusResult interface
   * Used when only the data structure is needed
   */
  static toInterface(result: ConsensusResult): IConsensusResult {
    return {
      finalWinner: result.finalWinner,
      confidenceLevel: result.confidenceLevel,
      residualUncertainty: result.residualUncertainty,
      mergedEvidence: result.mergedEvidence,
      synthesizedReasoning: result.synthesizedReasoning,
      methodology: result.methodology,
      metrics: result.metrics,
      alternativeChoices: result.alternativeChoices,
      qualityFlags: result.qualityFlags
    };
  }

  /**
   * Creates a class-like object with methods from interface data
   * This is useful when you need methods but don't want to create a full class instance
   */
  static createWithMethods(result: IConsensusResult): IConsensusResult & {
    meetsQualityThreshold: (minConfidence?: number, maxUncertainty?: number) => boolean;
    getConsensusStrength: () => 'strong' | 'moderate' | 'weak';
    getHighQualityEvidence: () => EvidenceSource[];
    getEvidenceDiversityScore: () => number;
    recommendsHumanReview: () => boolean;
    getRiskFactors: () => string[];
  } {
    return {
      ...result,
      meetsQualityThreshold: (minConfidence = 0.7, maxUncertainty = 0.3) => {
        return result.confidenceLevel >= minConfidence && 
               result.residualUncertainty <= maxUncertainty &&
               result.mergedEvidence.length >= 2;
      },
      getConsensusStrength: () => {
        if (result.confidenceLevel >= 0.8 && result.metrics.unanimityLevel >= 0.8) {
          return 'strong';
        } else if (result.confidenceLevel >= 0.6 && result.metrics.unanimityLevel >= 0.6) {
          return 'moderate';
        } else {
          return 'weak';
        }
      },
      getHighQualityEvidence: () => {
        return result.mergedEvidence.filter(evidence => 
          evidence.relevance >= 0.7 && evidence.credibility >= 0.7
        );
      },
      getEvidenceDiversityScore: () => {
        const uniqueSources = new Set(result.mergedEvidence.map(e => e.source));
        const maxDiversity = Math.min(result.mergedEvidence.length, 5);
        return uniqueSources.size / Math.max(maxDiversity, 1);
      },
      recommendsHumanReview: () => {
        return result.qualityFlags.requiresHumanReview ||
               result.confidenceLevel < 0.6 ||
               result.qualityFlags.hasConflictingEvidence ||
               (result.qualityFlags.hasMinorityDissent && result.metrics.unanimityLevel < 0.7);
      },
      getRiskFactors: () => {
        const risks: string[] = [];
        
        if (result.confidenceLevel < 0.7) {
          risks.push('Low confidence level');
        }
        
        if (result.residualUncertainty > 0.4) {
          risks.push('High residual uncertainty');
        }
        
        if (result.qualityFlags.hasMinorityDissent) {
          risks.push('Minority dissent present');
        }
        
        if (result.qualityFlags.hasConflictingEvidence) {
          risks.push('Conflicting evidence detected');
        }
        
        if (result.mergedEvidence.length < 3) {
          risks.push('Insufficient evidence base');
        }
        
        if (result.metrics.confidenceVariance > 0.25) {
          risks.push('High variance in agent confidence');
        }
        
        return risks;
      }
    };
  }
}