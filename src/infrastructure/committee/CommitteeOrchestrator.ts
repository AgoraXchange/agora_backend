import { injectable, inject } from 'inversify';
import { 
  ICommitteeService, 
  CommitteeDeliberationInput, 
  CommitteeDeliberationResult,
  CommitteeConfiguration 
} from '../../domain/services/ICommitteeService';
import { IAgentService } from '../../domain/services/IAgentService';
import { IJudgeService, ISynthesizerService } from '../../domain/services/IAgentService';
import { CommitteeDecision } from '../../domain/entities/CommitteeDecision';
import { AgentProposal } from '../../domain/entities/AgentProposal';
import { JudgeEvaluation } from '../../domain/entities/JudgeEvaluation';
import { MessageCollector } from './MessageCollector';
import { VotingData } from '../../domain/valueObjects/DeliberationVisualization';
import { logger } from '../logging/Logger';

@injectable()
export class CommitteeOrchestrator implements ICommitteeService {
  private agentWeights: Record<string, number> = {};
  private config: CommitteeConfiguration;
  private currentDeliberationId?: string;

  constructor(
    @inject('ProposerAgents') private proposerAgents: IAgentService[],
    @inject('JudgeService') private judgeService: IJudgeService,
    @inject('SynthesizerService') private synthesizerService: ISynthesizerService,
    @inject('MessageCollector') private messageCollector: MessageCollector
  ) {
    this.initializeConfiguration();
    this.initializeAgentWeights();
  }

  async deliberateAndDecide(input: CommitteeDeliberationInput): Promise<CommitteeDeliberationResult> {
    const startTime = Date.now();
    
    // Store the deliberation ID if provided (for async SSE streaming)
    this.currentDeliberationId = input.deliberationId;
    
    // Initialize message collector for this deliberation
    this.messageCollector.initialize(input.contractId, this.proposerAgents.length);
    
    logger.info('Committee deliberation started', { 
      contractId: input.contractId,
      deliberationId: this.currentDeliberationId,
      enabledAgents: this.config.enabledProposers.length 
    });

    try {
      // Phase 1: Generate proposals from multiple agents
      this.messageCollector.startPhase('proposing');
      const proposals = await this.generateProposals(input);
      this.messageCollector.completeProposalPhase(proposals);
      logger.info(`Generated ${proposals.length} proposals from ${this.proposerAgents.length} agents`);

      // Phase 2: Judge and evaluate proposals
      this.messageCollector.startPhase('judging');
      const evaluations = await this.evaluateProposals(proposals);
      this.messageCollector.completeJudgmentPhase(evaluations);
      logger.info(`Completed ${evaluations.length} evaluations`);

      // Check for early exit
      if (input.enableEarlyExit && this.shouldEarlyExit(evaluations, input.consensusThreshold || 0.8)) {
        logger.info('Early exit triggered due to strong consensus');
      }

      // Phase 3: Synthesize consensus
      this.messageCollector.startPhase('consensus');
      const votingData = this.prepareVotingData(proposals, evaluations);
      this.messageCollector.startVoting(this.config.consensusMethod, proposals.length);
      
      // Collect votes
      this.collectVotes(proposals, evaluations, votingData);
      
      const consensus = await this.synthesizeConsensus(proposals, evaluations);
      this.messageCollector.collectSynthesis(consensus, this.config.consensusMethod);
      logger.info(`Consensus reached: ${consensus.finalWinner} (confidence: ${consensus.confidenceLevel})`);

      // Create committee decision
      const endTime = Date.now();
      const deliberationTimeMs = endTime - startTime;
      
      const committeeDecision = this.createCommitteeDecision(
        input.contractId,
        consensus.finalWinner,
        proposals,
        evaluations,
        consensus,
        deliberationTimeMs,
        startTime
      );

      // Complete deliberation and build visualization
      this.messageCollector.completeDeliberation(
        consensus.finalWinner,
        committeeDecision.id,
        {
          totalProposals: proposals.length,
          totalComparisons: evaluations.length,
          consensusLevel: consensus.metrics.unanimityLevel,
          totalCost: this.calculateCostBreakdown(proposals, evaluations).totalCostUSD
        }
      );

      // Build complete visualization data
      const visualization = this.messageCollector.buildVisualization(
        proposals,
        evaluations,
        consensus,
        votingData,
        committeeDecision.id
      );

      // Update agent weights based on performance
      this.updateAgentPerformance(proposals, evaluations, consensus.finalWinner);

      const result: CommitteeDeliberationResult = {
        winnerId: consensus.finalWinner,
        metadata: {
          confidence: consensus.confidenceLevel,
          reasoning: consensus.synthesizedReasoning,
          dataPoints: consensus.mergedEvidence.map(e => e.source),
          timestamp: new Date()
        },
        committeeDecision,
        deliberationMetrics: {
          totalProposals: proposals.length,
          deliberationTimeMs,
          consensusLevel: consensus.metrics.unanimityLevel,
          costBreakdown: this.calculateCostBreakdown(proposals, evaluations)
        },
        // Add visualization data to result
        visualization,
        messages: this.messageCollector.getMessages()
      };

      logger.info('Committee deliberation completed successfully', {
        contractId: input.contractId,
        winner: consensus.finalWinner,
        confidence: consensus.confidenceLevel,
        deliberationTimeMs
      });

      return result;

    } catch (error) {
      logger.error('Committee deliberation failed', { 
        contractId: input.contractId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  getCommitteeConfig(): CommitteeConfiguration {
    return { ...this.config };
  }

  updateAgentWeights(agentId: string, performance: number): void {
    this.agentWeights[agentId] = Math.max(0.1, Math.min(1.0, performance));
    logger.info(`Updated agent weight`, { agentId, newWeight: this.agentWeights[agentId] });
  }

  private async generateProposals(input: CommitteeDeliberationInput): Promise<AgentProposal[]> {
    const proposals: AgentProposal[] = [];
    const maxProposalsPerAgent = input.maxProposalsPerAgent || 2;

    const proposalPromises = this.proposerAgents.map(async (agent) => {
      if (!this.config.enabledProposers.includes(agent.agentType)) {
        return [];
      }

      try {
        const agentProposals = await agent.generateProposals({
          contractId: input.contractId,
          partyA: input.partyA,
          partyB: input.partyB,
          context: input.additionalContext
        }, maxProposalsPerAgent);

        // Collect each proposal for visualization
        agentProposals.forEach(proposal => {
          this.messageCollector.collectProposal(agent, proposal);
        });

        logger.debug(`Agent ${agent.agentName} generated ${agentProposals.length} proposals`);
        return agentProposals;

      } catch (error) {
        logger.error(`Agent ${agent.agentName} failed to generate proposals`, { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        return [];
      }
    });

    const agentProposalGroups = await Promise.all(proposalPromises);
    agentProposalGroups.forEach(group => proposals.push(...group));

    if (proposals.length < (input.minProposals || 3)) {
      throw new Error(`Insufficient proposals generated: ${proposals.length} < ${input.minProposals || 3}`);
    }

    return proposals;
  }

  private async evaluateProposals(proposals: AgentProposal[]): Promise<JudgeEvaluation[]> {
    logger.info('Starting proposal evaluation phase');
    
    // Rule-based evaluation
    const ruleEvaluation = await this.judgeService.evaluateWithRules(proposals);
    
    // Pairwise comparisons
    const pairwisePromises = [];
    const pairwiseMetadata: Array<{i: number, j: number}> = [];
    
    for (let i = 0; i < proposals.length; i++) {
      for (let j = i + 1; j < proposals.length; j++) {
        pairwiseMetadata.push({i, j});
        pairwisePromises.push(
          this.judgeService.performPairwiseComparison(
            proposals[i], 
            proposals[j], 
            this.config.judgeConfiguration.pairwiseRounds
          )
        );
      }
    }

    const pairwiseResults = await Promise.all(pairwisePromises);
    
    // Collect pairwise comparison results
    pairwiseResults.forEach((result, index) => {
      const meta = pairwiseMetadata[index];
      this.messageCollector.collectPairwiseComparison(
        proposals[meta.i].id,
        proposals[meta.j].id,
        result.winner,
        result.scores.A,
        result.scores.B,
        result.reasoning,
        1 // Round number simplified for now
      );
    });
    
    // Generate ranking
    const ranking = await this.judgeService.generateRanking([]);

    // Create evaluations for each proposal
    const evaluations: JudgeEvaluation[] = proposals.map((proposal, index) => {
      const proposalPairwiseResults = this.extractPairwiseResults(proposal.id, pairwiseResults, proposals);
      
      return new JudgeEvaluation(
        `eval_${proposal.id}`,
        proposal.id,
        'committee_judge',
        'Committee Judge',
        ruleEvaluation.scores[proposal.id] || 0,
        ruleEvaluation.criteria.completeness[proposal.id] ? {
          completeness: ruleEvaluation.criteria.completeness[proposal.id] || 0,
          consistency: ruleEvaluation.criteria.consistency[proposal.id] || 0,
          evidenceQuality: ruleEvaluation.criteria.evidenceQuality[proposal.id] || 0,
          clarity: proposal.getQualityScore(), // Use proposal's quality score for clarity
          relevance: proposal.hasSufficientEvidence() ? 0.8 : 0.5
        } : {
          completeness: 0.5,
          consistency: 0.5,
          evidenceQuality: 0.5,
          clarity: 0.5,
          relevance: 0.5
        },
        proposalPairwiseResults,
        this.calculateOverallScore(ruleEvaluation.scores[proposal.id] || 0, proposalPairwiseResults),
        [`Rule-based score: ${ruleEvaluation.scores[proposal.id] || 0}`],
        0.8, // Default confidence
        {
          evaluationTimeMs: 1000, // Placeholder
          evaluationMethod: 'rule_based_and_pairwise'
        }
      );
    });

    // Collect evaluations for visualization
    evaluations.forEach(evaluation => {
      this.messageCollector.collectEvaluation(evaluation);
    });

    return evaluations;
  }

  private async synthesizeConsensus(
    proposals: AgentProposal[], 
    evaluations: JudgeEvaluation[]
  ) {
    const rankedProposals = this.rankProposalsByEvaluation(proposals, evaluations);
    return await this.synthesizerService.synthesizeConsensus(rankedProposals, evaluations);
  }

  private shouldEarlyExit(evaluations: JudgeEvaluation[], threshold: number): boolean {
    if (evaluations.length < 2) return false;
    
    const topScore = Math.max(...evaluations.map(e => e.overallScore));
    const secondScore = evaluations
      .map(e => e.overallScore)
      .sort((a, b) => b - a)[1] || 0;
    
    return (topScore - secondScore) >= threshold;
  }

  private rankProposalsByEvaluation(
    proposals: AgentProposal[], 
    evaluations: JudgeEvaluation[]
  ): AgentProposal[] {
    const evaluationMap = new Map(evaluations.map(e => [e.proposalId, e]));
    
    return proposals
      .map(proposal => ({
        proposal,
        evaluation: evaluationMap.get(proposal.id)
      }))
      .sort((a, b) => {
        const scoreA = a.evaluation?.getWeightedScore(
          this.config.judgeConfiguration.ruleBasedWeight,
          this.config.judgeConfiguration.llmWeight
        ) || 0;
        const scoreB = b.evaluation?.getWeightedScore(
          this.config.judgeConfiguration.ruleBasedWeight,
          this.config.judgeConfiguration.llmWeight
        ) || 0;
        return scoreB - scoreA;
      })
      .map(item => item.proposal);
  }

  private createCommitteeDecision(
    contractId: string,
    finalWinnerId: string,
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[],
    consensus: any,
    deliberationTimeMs: number,
    startTime: number
  ): CommitteeDecision {
    const metrics = {
      totalProposals: proposals.length,
      totalEvaluations: evaluations.length,
      deliberationStartTime: new Date(startTime),
      deliberationEndTime: new Date(),
      deliberationTimeMs,
      consensusReachedAt: new Date(),
      earlyExitTriggered: false,
      costBreakdown: this.calculateCostBreakdown(proposals, evaluations),
      qualityMetrics: {
        averageProposalConfidence: proposals.reduce((sum, p) => sum + p.confidence, 0) / proposals.length,
        averageEvaluationConfidence: evaluations.reduce((sum, e) => sum + e.confidence, 0) / evaluations.length,
        consensusLevel: consensus.metrics.unanimityLevel,
        diversityScore: consensus.metrics.evidenceOverlap
      }
    };

    // Use pre-generated deliberation ID if available, otherwise generate new one
    const decisionId = this.currentDeliberationId || `committee_${contractId}_${Date.now()}`;
    
    return new CommitteeDecision(
      decisionId,
      contractId,
      finalWinnerId,
      proposals,
      evaluations,
      consensus,
      this.config.consensusMethod,
      metrics
    );
  }

  private calculateCostBreakdown(proposals: AgentProposal[], evaluations: JudgeEvaluation[]) {
    const proposerTokens = proposals.reduce((sum, p) => sum + p.metadata.tokenUsage.totalTokens, 0);
    const judgeTokens = evaluations.reduce((sum, e) => sum + (e.metadata.tokenUsage || 0), 0);
    const synthesizerTokens = 1000; // Placeholder
    
    return {
      proposerTokens,
      judgeTokens,
      synthesizerTokens,
      totalCostUSD: proposals.reduce((sum, p) => sum + p.metadata.getCostEstimate(), 0)
    };
  }

  private updateAgentPerformance(
    proposals: AgentProposal[], 
    evaluations: JudgeEvaluation[], 
    finalWinner: string
  ): void {
    proposals.forEach(proposal => {
      const wasCorrect = proposal.winnerId === finalWinner;
      const currentWeight = this.agentWeights[proposal.agentId] || 1.0;
      
      // Simple performance update: increase if correct, decrease if wrong
      const adjustment = wasCorrect ? 0.05 : -0.02;
      const newWeight = Math.max(0.1, Math.min(1.0, currentWeight + adjustment));
      
      this.updateAgentWeights(proposal.agentId, newWeight);
    });
  }

  private extractPairwiseResults(proposalId: string, pairwiseResults: any[], proposals: AgentProposal[]) {
    // This is a simplified implementation
    // In a real implementation, you would extract the actual pairwise comparison results
    return [];
  }

  private calculateOverallScore(ruleBasedScore: number, pairwiseResults: any[]): number {
    // Simple implementation combining rule-based and pairwise scores
    const pairwiseScore = pairwiseResults.length > 0 ? 0.7 : 0.5; // Placeholder
    return (ruleBasedScore * 0.4) + (pairwiseScore * 0.6);
  }

  private initializeConfiguration(): void {
    this.config = {
      enabledProposers: (process.env.COMMITTEE_ENABLED_PROPOSERS || 'gpt4,claude,gemini').split(','),
      judgeConfiguration: {
        ruleBasedWeight: parseFloat(process.env.JUDGE_RULE_BASED_WEIGHT || '0.4'),
        llmWeight: parseFloat(process.env.JUDGE_LLM_WEIGHT || '0.6'),
        pairwiseRounds: parseInt(process.env.JUDGE_PAIRWISE_ROUNDS || '3')
      },
      consensusMethod: (process.env.COMMITTEE_CONSENSUS_METHOD as any) || 'weighted_voting',
      earlyExitThreshold: parseFloat(process.env.COMMITTEE_EARLY_EXIT_THRESHOLD || '0.8'),
      agentWeights: {}
    };
  }

  private initializeAgentWeights(): void {
    this.proposerAgents.forEach(agent => {
      this.agentWeights[agent.agentId] = agent.getPerformanceWeight();
    });
  }

  /**
   * Prepares voting data for visualization
   */
  private prepareVotingData(
    proposals: AgentProposal[], 
    evaluations: JudgeEvaluation[]
  ): VotingData {
    const evaluationMap = new Map(evaluations.map(e => [e.proposalId, e]));
    const votes: VotingData['votes'] = [];
    const distribution: Record<string, number> = {};
    let totalWeight = 0;

    // Create vote entries for each proposal (representing agent votes)
    proposals.forEach(proposal => {
      const evaluation = evaluationMap.get(proposal.id);
      const weight = this.agentWeights[proposal.agentId] || 1.0;
      const evaluationScore = evaluation?.overallScore || 0.5;
      const confidence = proposal.confidence;
      
      // Calculate weighted contribution
      const contribution = weight * evaluationScore * confidence;
      
      votes.push({
        agentId: proposal.agentId,
        agentName: proposal.agentName,
        choice: proposal.winnerId,
        confidence,
        weight,
        contribution
      });

      // Accumulate distribution
      distribution[proposal.winnerId] = (distribution[proposal.winnerId] || 0) + contribution;
      totalWeight += contribution;
    });

    // Normalize distribution to percentages
    Object.keys(distribution).forEach(choice => {
      distribution[choice] = distribution[choice] / totalWeight;
    });

    // Determine winner and margin
    const sortedChoices = Object.entries(distribution).sort(([,a], [,b]) => b - a);
    const winner = sortedChoices[0][0];
    const winnerScore = sortedChoices[0][1];
    const runnerUpScore = sortedChoices[1]?.[1] || 0;
    const margin = winnerScore - runnerUpScore;

    return {
      method: this.config.consensusMethod,
      votes,
      distribution,
      winner,
      margin,
      totalWeight
    };
  }

  /**
   * Collects votes for visualization
   */
  private collectVotes(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[],
    votingData: VotingData
  ): void {
    // Collect each vote for the message stream
    votingData.votes.forEach(vote => {
      this.messageCollector.collectVote(
        vote.agentId,
        vote.agentName,
        vote.choice,
        vote.confidence,
        vote.weight,
        vote.contribution
      );
    });
  }
}