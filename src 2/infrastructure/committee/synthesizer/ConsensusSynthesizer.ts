import { injectable } from 'inversify';
import { ISynthesizerService, ConsensusResult } from '../../../domain/services/IAgentService';
import { AgentProposal } from '../../../domain/entities/AgentProposal';
import { JudgeEvaluation } from '../../../domain/entities/JudgeEvaluation';
import { ConsensusResult as ConsensusResultEntity } from '../../../domain/valueObjects/ConsensusResult';
import { EvidenceSource, ConsensusMetrics } from '../../../domain/valueObjects/ConsensusResult';
import { OpenAIService } from '../../ai/OpenAIService';
import { logger } from '../../logging/Logger';

export type ConsensusMethod = 'majority' | 'borda' | 'weighted_voting' | 'approval';

export interface SynthesizerConfig {
  consensusMethod: ConsensusMethod;
  minimumAgreement: number;
  evidenceWeightThreshold: number;
  uncertaintyThreshold: number;
  enableAISynthesis: boolean;
  agentWeights: Record<string, number>;
}

@injectable()
export class ConsensusSynthesizer implements ISynthesizerService {
  private config: SynthesizerConfig;
  private aiService: OpenAIService;

  constructor() {
    this.config = this.getDefaultConfig();
    this.aiService = new OpenAIService();
  }

  async synthesizeConsensus(
    rankedProposals: AgentProposal[],
    evaluations: JudgeEvaluation[]
  ): Promise<ConsensusResult> {
    logger.info('Starting consensus synthesis', {
      proposalCount: rankedProposals.length,
      evaluationCount: evaluations.length,
      method: this.config.consensusMethod
    });

    try {
      // Step 1: Determine final winner using consensus method
      const winnerResult = this.determineWinner(rankedProposals, evaluations);
      
      // Step 2: Merge evidence from proposals
      const mergedEvidence = this.mergeEvidence(rankedProposals, winnerResult.winner);
      
      // Step 3: Calculate consensus metrics
      const metrics = this.calculateConsensusMetrics(rankedProposals, evaluations, winnerResult.winner);
      
      // Step 4: Synthesize reasoning (AI-powered if enabled)
      const synthesizedReasoning = await this.synthesizeReasoning(
        rankedProposals, 
        evaluations, 
        winnerResult.winner,
        mergedEvidence
      );
      
      // Step 5: Calculate adjusted confidence and uncertainty that sum to 1
      const { adjustedConfidence, residualUncertainty } = this.calculateFinalMetrics(metrics, winnerResult.confidence);
      const qualityFlags = this.assessQualityFlags(rankedProposals, metrics, residualUncertainty);
      
      // Step 6: Generate alternative scenarios
      const alternativeChoices = this.generateAlternativeChoices(rankedProposals, evaluations, winnerResult.winner);

      const consensusResult = new ConsensusResultEntity(
        winnerResult.winner,
        adjustedConfidence,
        residualUncertainty,
        mergedEvidence,
        synthesizedReasoning,
        `${this.config.consensusMethod}_consensus`,
        metrics,
        alternativeChoices,
        qualityFlags
      );

      logger.info('Consensus synthesis completed', {
        finalWinner: winnerResult.winner,
        confidence: adjustedConfidence,
        uncertainty: residualUncertainty,
        consensusStrength: consensusResult.getConsensusStrength()
      });

      return consensusResult;

    } catch (error) {
      logger.error('Consensus synthesis failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private determineWinner(
    proposals: AgentProposal[], 
    evaluations: JudgeEvaluation[]
  ): { winner: string; confidence: number } {
    const evaluationMap = new Map(evaluations.map(e => [e.proposalId, e]));
    
    switch (this.config.consensusMethod) {
      case 'majority':
        return this.majorityVoting(proposals);
      
      case 'borda':
        return this.bordaCount(proposals, evaluations);
      
      case 'weighted_voting':
        return this.weightedVoting(proposals, evaluationMap);
      
      case 'approval':
        return this.approvalVoting(proposals, evaluationMap);
      
      default:
        logger.warn(`Unknown consensus method ${this.config.consensusMethod}, falling back to majority`);
        return this.majorityVoting(proposals);
    }
  }

  private majorityVoting(proposals: AgentProposal[]): { winner: string; confidence: number } {
    const voteCounts: Record<string, number> = {};
    
    proposals.forEach(proposal => {
      voteCounts[proposal.winnerId] = (voteCounts[proposal.winnerId] || 0) + 1;
    });

    const sortedCandidates = Object.entries(voteCounts)
      .sort(([,a], [,b]) => b - a);
    
    const winner = sortedCandidates[0][0];
    const winnerVotes = sortedCandidates[0][1];
    const totalVotes = proposals.length;
    
    // Confidence based on margin of victory
    const confidence = winnerVotes / totalVotes;
    
    logger.debug('Majority voting result', {
      winner,
      votes: winnerVotes,
      totalVotes,
      confidence,
      distribution: voteCounts
    });

    return { winner, confidence };
  }

  private bordaCount(
    proposals: AgentProposal[], 
    evaluations: JudgeEvaluation[]
  ): { winner: string; confidence: number } {
    const bordaScores: Record<string, number> = {};
    const evaluationMap = new Map(evaluations.map(e => [e.proposalId, e]));

    // Sort proposals by their evaluation scores
    const sortedProposals = [...proposals].sort((a, b) => {
      const scoreA = evaluationMap.get(a.id)?.overallScore || 0;
      const scoreB = evaluationMap.get(b.id)?.overallScore || 0;
      return scoreB - scoreA;
    });

    // Assign Borda points (highest ranked gets most points)
    sortedProposals.forEach((proposal, index) => {
      const points = proposals.length - index - 1;
      bordaScores[proposal.winnerId] = (bordaScores[proposal.winnerId] || 0) + points;
    });

    const sortedCandidates = Object.entries(bordaScores)
      .sort(([,a], [,b]) => b - a);
    
    const winner = sortedCandidates[0][0];
    const winnerScore = sortedCandidates[0][1];
    const maxPossibleScore = proposals.length * (proposals.length - 1) / 2;
    
    const confidence = winnerScore / maxPossibleScore;

    logger.debug('Borda count result', {
      winner,
      score: winnerScore,
      maxPossible: maxPossibleScore,
      confidence,
      distribution: bordaScores
    });

    return { winner, confidence };
  }

  private weightedVoting(
    proposals: AgentProposal[],
    evaluationMap: Map<string, JudgeEvaluation>
  ): { winner: string; confidence: number } {
    const weightedScores: Record<string, number> = {};
    let totalWeight = 0;

    proposals.forEach(proposal => {
      const agentWeight = this.config.agentWeights[proposal.agentId] || 1.0;
      const evaluationScore = evaluationMap.get(proposal.id)?.overallScore || 0.5;
      const confidenceWeight = proposal.confidence;
      
      // Combined weight: agent performance * evaluation score * proposal confidence
      const combinedWeight = agentWeight * evaluationScore * confidenceWeight;
      
      weightedScores[proposal.winnerId] = (weightedScores[proposal.winnerId] || 0) + combinedWeight;
      totalWeight += combinedWeight;
    });

    const sortedCandidates = Object.entries(weightedScores)
      .sort(([,a], [,b]) => b - a);
    
    const winner = sortedCandidates[0][0];
    const winnerScore = sortedCandidates[0][1];
    
    const confidence = totalWeight > 0 ? winnerScore / totalWeight : 0.5;

    logger.debug('Weighted voting result', {
      winner,
      score: winnerScore,
      totalWeight,
      confidence,
      distribution: weightedScores
    });

    return { winner, confidence };
  }

  private approvalVoting(
    proposals: AgentProposal[],
    evaluationMap: Map<string, JudgeEvaluation>
  ): { winner: string; confidence: number } {
    const approvalThreshold = 0.7; // Proposals above this score get approval
    const approvalCounts: Record<string, number> = {};

    proposals.forEach(proposal => {
      const evaluation = evaluationMap.get(proposal.id);
      const overallScore = evaluation?.overallScore || 0;
      
      if (overallScore >= approvalThreshold || proposal.confidence >= approvalThreshold) {
        approvalCounts[proposal.winnerId] = (approvalCounts[proposal.winnerId] || 0) + 1;
      }
    });

    if (Object.keys(approvalCounts).length === 0) {
      // Fallback to majority if no proposals meet approval threshold
      logger.warn('No proposals met approval threshold, falling back to majority voting');
      return this.majorityVoting(proposals);
    }

    const sortedCandidates = Object.entries(approvalCounts)
      .sort(([,a], [,b]) => b - a);
    
    const winner = sortedCandidates[0][0];
    const approvals = sortedCandidates[0][1];
    
    // Confidence based on approval ratio and threshold quality
    const approvalRatio = approvals / proposals.length;
    const qualityBonus = approvals >= 2 ? 0.2 : 0; // Bonus for multiple approvals
    const confidence = Math.min(1.0, approvalRatio + qualityBonus);

    logger.debug('Approval voting result', {
      winner,
      approvals,
      totalProposals: proposals.length,
      threshold: approvalThreshold,
      confidence
    });

    return { winner, confidence };
  }

  private mergeEvidence(proposals: AgentProposal[], winner: string): EvidenceSource[] {
    const evidenceMap = new Map<string, EvidenceSource>();
    const winningProposals = proposals.filter(p => p.winnerId === winner);
    
    // Collect evidence from winning proposals
    winningProposals.forEach(proposal => {
      proposal.evidence.forEach((evidence, index) => {
        if (!evidenceMap.has(evidence)) {
          evidenceMap.set(evidence, {
            source: evidence,
            relevance: 0,
            credibility: 0,
            snippet: evidence.length > 100 ? evidence.substring(0, 97) + '...' : evidence
          });
        }
        
        // Increase relevance and credibility based on proposal quality
        const evidenceSource = evidenceMap.get(evidence)!;
        evidenceSource.relevance += proposal.confidence * 0.3;
        evidenceSource.credibility += proposal.getQualityScore() * 0.3;
      });
    });

    // Sort by relevance and credibility, take top sources
    return Array.from(evidenceMap.values())
      .map(source => ({
        ...source,
        relevance: Math.min(1.0, source.relevance),
        credibility: Math.min(1.0, source.credibility)
      }))
      .sort((a, b) => (b.relevance + b.credibility) - (a.relevance + a.credibility))
      .slice(0, 10); // Limit to top 10 evidence sources
  }

  private calculateConsensusMetrics(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[],
    winner: string
  ): ConsensusMetrics {
    const winningProposals = proposals.filter(p => p.winnerId === winner);
    const unanimityLevel = winningProposals.length / proposals.length;
    
    // Calculate confidence variance
    const confidences = proposals.map(p => p.confidence);
    const avgConfidence = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
    const confidenceVariance = confidences.reduce((sum, conf) => sum + Math.pow(conf - avgConfidence, 2), 0) / confidences.length;
    
    // Calculate evidence overlap
    const allEvidence = new Set();
    const sharedEvidence = new Set();
    
    proposals.forEach(proposal => {
      proposal.evidence.forEach(evidence => {
        if (allEvidence.has(evidence)) {
          sharedEvidence.add(evidence);
        } else {
          allEvidence.add(evidence);
        }
      });
    });
    
    const evidenceOverlap = allEvidence.size > 0 ? sharedEvidence.size / allEvidence.size : 0;
    
    // Analyze reasoning patterns
    const allReasoningPoints = proposals.flatMap(p => p.rationale.split('.').map(s => s.trim().toLowerCase()));
    const reasoningCounts = new Map<string, number>();
    
    allReasoningPoints.forEach(point => {
      if (point.length > 10) { // Filter out very short fragments
        reasoningCounts.set(point, (reasoningCounts.get(point) || 0) + 1);
      }
    });
    
    const sharedPoints = Array.from(reasoningCounts.entries())
      .filter(([_, count]) => count >= 2)
      .map(([point, _]) => point)
      .slice(0, 5);
    
    const conflictingPoints = this.identifyConflictingPoints(proposals);
    const uniqueInsights = this.identifyUniqueInsights(proposals);

    return {
      unanimityLevel,
      confidenceVariance,
      evidenceOverlap,
      reasoning: {
        sharedPoints,
        conflictingPoints,
        uniqueInsights
      }
    };
  }

  private async synthesizeReasoning(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[],
    winner: string,
    evidence: EvidenceSource[]
  ): Promise<string> {
    if (!this.config.enableAISynthesis) {
      return this.createBasicSynthesis(proposals, winner, evidence);
    }

    try {
      const prompt = this.createSynthesisPrompt(proposals, evaluations, winner, evidence);
      
      const aiResponse = await this.aiService.analyzeAndDecideWinner({
        partyA: { id: 'synthesis', address: 'ai_synthesis', name: 'Synthesis A', description: 'Synthesis task' },
        partyB: { id: 'synthesis', address: 'ai_synthesis', name: 'Synthesis B', description: 'Synthesis task' },
        contractId: 'consensus_synthesis',
        context: { synthesisPrompt: prompt }
      });

      return aiResponse.metadata.reasoning || this.createBasicSynthesis(proposals, winner, evidence);

    } catch (error) {
      logger.warn('AI synthesis failed, using basic synthesis', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return this.createBasicSynthesis(proposals, winner, evidence);
    }
  }

  private createBasicSynthesis(proposals: AgentProposal[], winner: string, evidence: EvidenceSource[]): string {
    const winningProposals = proposals.filter(p => p.winnerId === winner);
    const avgConfidence = winningProposals.reduce((sum, p) => sum + p.confidence, 0) / winningProposals.length;
    
    return `Committee consensus analysis determined ${winner} as the winner based on ${this.config.consensusMethod} consensus method. ` +
           `${winningProposals.length} out of ${proposals.length} agents supported this decision with average confidence of ${avgConfidence.toFixed(2)}. ` +
           `The decision is supported by ${evidence.length} pieces of evidence with high relevance and credibility scores. ` +
           `Key factors included systematic evaluation of proposal quality, evidence strength, and reasoning coherence.`;
  }

  private createSynthesisPrompt(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[],
    winner: string,
    evidence: EvidenceSource[]
  ): string {
    const proposalSummaries = proposals.map(p => ({
      agent: p.agentName,
      winner: p.winnerId,
      confidence: p.confidence,
      rationale: p.rationale.substring(0, 200) + '...'
    }));

    return `Synthesize a comprehensive consensus reasoning from the following committee deliberation:

FINAL DECISION: ${winner}
CONSENSUS METHOD: ${this.config.consensusMethod}

PROPOSALS ANALYZED:
${proposalSummaries.map((p, i) => 
  `${i + 1}. ${p.agent}: chose ${p.winner} (confidence: ${p.confidence})
     Rationale excerpt: ${p.rationale}`
).join('\n')}

EVIDENCE COLLECTED (top 5):
${evidence.slice(0, 5).map((e, i) => 
  `${i + 1}. ${e.source} (relevance: ${e.relevance.toFixed(2)}, credibility: ${e.credibility.toFixed(2)})`
).join('\n')}

Please provide a clear, comprehensive synthesis explaining why ${winner} was chosen, incorporating the key arguments and evidence while acknowledging any uncertainties or dissenting views.`;
  }

  private calculateFinalMetrics(metrics: ConsensusMetrics, baseConfidence: number): { adjustedConfidence: number; residualUncertainty: number } {
    // Calculate quality adjustment factors based on committee metrics
    let qualityAdjustment = 0;
    
    // Increase uncertainty based on lack of unanimity
    qualityAdjustment += (1 - metrics.unanimityLevel) * 0.1;
    
    // Increase uncertainty based on confidence variance (disagreement)
    qualityAdjustment += metrics.confidenceVariance * 0.1;
    
    // Decrease uncertainty based on evidence overlap (shared foundation)
    qualityAdjustment -= metrics.evidenceOverlap * 0.05;
    
    // Increase uncertainty for conflicting points
    qualityAdjustment += Math.min(metrics.reasoning.conflictingPoints.length * 0.02, 0.1);

    // Ensure quality adjustment stays within reasonable bounds
    qualityAdjustment = Math.max(-0.2, Math.min(0.2, qualityAdjustment));
    
    // Calculate adjusted confidence with bounds checking
    // Ensure confidence is between 0.1 and 0.9 to avoid extreme values
    let adjustedConfidence = baseConfidence - qualityAdjustment;
    adjustedConfidence = Math.max(0.1, Math.min(0.9, adjustedConfidence));
    
    // Round to avoid floating point precision issues
    adjustedConfidence = Math.round(adjustedConfidence * 10000) / 10000;
    
    // Calculate residual uncertainty to ensure exact sum of 1
    // Direct calculation to guarantee the sum
    const residualUncertainty = Math.round((1 - adjustedConfidence) * 10000) / 10000;
    
    // Log for debugging
    logger.debug('Final metrics calculation', {
      baseConfidence,
      qualityAdjustment,
      adjustedConfidence,
      residualUncertainty,
      sum: adjustedConfidence + residualUncertainty
    });
    
    return { 
      adjustedConfidence, 
      residualUncertainty
    };
  }

  private assessQualityFlags(
    proposals: AgentProposal[],
    metrics: ConsensusMetrics,
    uncertainty: number
  ) {
    return {
      hasMinorityDissent: metrics.unanimityLevel < 0.8,
      hasInsufficientEvidence: proposals.some(p => p.evidence.length < 2),
      hasConflictingEvidence: metrics.reasoning.conflictingPoints.length > 2,
      requiresHumanReview: uncertainty > this.config.uncertaintyThreshold || metrics.unanimityLevel < 0.6
    };
  }

  private generateAlternativeChoices(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[],
    winner: string
  ) {
    const alternatives = proposals
      .filter(p => p.winnerId !== winner)
      .map(p => p.winnerId)
      .filter((value, index, self) => self.indexOf(value) === index);
    
    return alternatives.map(choice => {
      const supportingProposals = proposals.filter(p => p.winnerId === choice);
      const avgConfidence = supportingProposals.reduce((sum, p) => sum + p.confidence, 0) / supportingProposals.length;
      const probability = supportingProposals.length / proposals.length;
      
      return {
        choice,
        probability,
        reasoning: `${supportingProposals.length} agents supported this choice with average confidence ${avgConfidence.toFixed(2)}`
      };
    });
  }

  private identifyConflictingPoints(proposals: AgentProposal[]): string[] {
    // Simplified conflict detection - in practice, you'd use more sophisticated NLP
    const conflictIndicators = ['however', 'but', 'although', 'despite', 'contrary'];
    const conflicts: string[] = [];
    
    proposals.forEach(proposal => {
      const rationale = proposal.rationale.toLowerCase();
      conflictIndicators.forEach(indicator => {
        if (rationale.includes(indicator)) {
          const sentences = proposal.rationale.split('.');
          const conflictSentence = sentences.find(s => s.toLowerCase().includes(indicator));
          if (conflictSentence) {
            conflicts.push(conflictSentence.trim());
          }
        }
      });
    });
    
    return conflicts.slice(0, 3); // Limit to top 3 conflicts
  }

  private identifyUniqueInsights(proposals: AgentProposal[]): string[] {
    // Identify unique insights by finding reasoning points mentioned by only one agent
    const reasoningPoints = new Map<string, number>();
    const pointToProposal = new Map<string, string>();
    
    proposals.forEach(proposal => {
      const sentences = proposal.rationale.split('.').map(s => s.trim().toLowerCase());
      sentences.forEach(sentence => {
        if (sentence.length > 20) { // Filter short fragments
          reasoningPoints.set(sentence, (reasoningPoints.get(sentence) || 0) + 1);
          if (!pointToProposal.has(sentence)) {
            pointToProposal.set(sentence, proposal.agentName);
          }
        }
      });
    });
    
    // Find points mentioned only once (unique insights)
    return Array.from(reasoningPoints.entries())
      .filter(([_, count]) => count === 1)
      .map(([point, _]) => point)
      .slice(0, 3); // Limit to top 3 unique insights
  }

  private getDefaultConfig(): SynthesizerConfig {
    return {
      consensusMethod: (process.env.COMMITTEE_CONSENSUS_METHOD as ConsensusMethod) || 'weighted_voting',
      minimumAgreement: parseFloat(process.env.SYNTHESIZER_MIN_AGREEMENT || '0.6'),
      evidenceWeightThreshold: parseFloat(process.env.SYNTHESIZER_EVIDENCE_WEIGHT_THRESHOLD || '0.7'),
      uncertaintyThreshold: parseFloat(process.env.SYNTHESIZER_UNCERTAINTY_THRESHOLD || '0.3'),
      enableAISynthesis: process.env.SYNTHESIZER_ENABLE_AI !== 'false',
      agentWeights: {} // Will be populated from agent performance data
    };
  }

  // Public method to update configuration
  updateConfig(newConfig: Partial<SynthesizerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Updated synthesizer configuration', { config: this.config });
  }

  // Update agent weights
  updateAgentWeights(weights: Record<string, number>): void {
    this.config.agentWeights = { ...this.config.agentWeights, ...weights };
    logger.info('Updated agent weights', { weights: this.config.agentWeights });
  }
}