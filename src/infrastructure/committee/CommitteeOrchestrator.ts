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
import { ConsensusResult as ConsensusResultEntity, EvidenceSource } from '../../domain/valueObjects/ConsensusResult';

@injectable()
export class CommitteeOrchestrator implements ICommitteeService {
  private agentWeights: Record<string, number> = {};
  private config!: CommitteeConfiguration;
  private currentDeliberationId?: string;
  private lastAgentWinners: Map<string, string> = new Map();
  private lastUpdatedProposals: AgentProposal[] = [];

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

      // Phases 2 & 3: Discussion → Voting (repeat) with unanimity-first
      let unanimousWinner: string | null = null;
      const maxRounds = Math.max(1, parseInt(process.env.UNANIMOUS_MAX_ROUNDS || '10'));
      const agentNameMap = new Map<string, string>(this.proposerAgents.map(a => [a.agentId, a.agentName]));
      let lastVotes: Array<[string, string]> = [];

      let evaluations: JudgeEvaluation[] = [];
      for (let round = 1; round <= maxRounds; round++) {
        // Discussion round
        this.messageCollector.startPhase('discussion');
        evaluations = await this.evaluateProposals(proposals, input);
        this.messageCollector.completeJudgmentPhase(evaluations);
        logger.info(`Discussion round ${round} completed`);

        // Voting based on latest agent winner stances
        this.messageCollector.startVoting('majority', this.proposerAgents.length);
        const winners = Array.from(this.lastAgentWinners.entries());
        lastVotes = winners;
        const uniqueChoices = new Set<string>(winners.map(([_, w]) => w));

        winners.forEach(([agentId, choice]) => {
          const name = agentNameMap.get(agentId) || agentId;
          this.messageCollector.collectVote(agentId, name, choice, 1, 1, 1);
        });

        if (uniqueChoices.size === 1) {
          unanimousWinner = winners[0]?.[1] || null;
          logger.info('Unanimity achieved', { winner: unanimousWinner, round });
          break;
        } else {
          logger.info('Unanimity not reached, continuing discussion', {
            round,
            choices: Array.from(uniqueChoices.values())
          });
          continue;
        }
      }

      // Use latest updated proposals if available (from discussion anchors)
      const finalProposals: AgentProposal[] = (this.lastUpdatedProposals && this.lastUpdatedProposals.length > 0)
        ? [...this.lastUpdatedProposals]
        : proposals;

      // Build consensus result (entity) and voting visualization
      let consensusEntity: ConsensusResultEntity;
      let votingData: VotingData;
      if (!unanimousWinner) {
        // Majority fallback
        const counts: Record<string, number> = {};
        for (const [, choice] of lastVotes) {
          counts[choice] = (counts[choice] || 0) + 1;
        }
        const entries = Object.entries(counts).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
        const majorityWinner = entries[0]?.[0];
        if (!majorityWinner) {
          throw new Error('No votes available to determine majority');
        }
        consensusEntity = this.buildMajorityConsensus(majorityWinner, finalProposals, counts);
        votingData = this.buildMajorityVotingData(counts);
        this.messageCollector.collectSynthesis(consensusEntity, 'majority');
        logger.info(`Consensus (majority) reached: ${consensusEntity.finalWinner}`);
      } else {
        // Unanimous consensus
        consensusEntity = this.buildUnanimousConsensus(unanimousWinner, finalProposals);
        votingData = this.buildUnanimousVotingData(unanimousWinner);
        this.messageCollector.collectSynthesis(consensusEntity, 'majority');
        logger.info(`Consensus (unanimous) reached: ${consensusEntity.finalWinner}`);
      }

      // Create committee decision
      const endTime = Date.now();
      const deliberationTimeMs = endTime - startTime;

      const committeeDecision = this.createCommitteeDecision(
        input.contractId,
        consensusEntity.finalWinner,
        finalProposals,
        evaluations,
        consensusEntity,
        deliberationTimeMs,
        startTime
      );

      // Complete deliberation and build visualization
      this.messageCollector.completeDeliberation(
        consensusEntity.finalWinner,
        committeeDecision.id,
        {
          totalProposals: finalProposals.length,
          totalComparisons: evaluations.length,
          consensusLevel: consensusEntity.metrics.unanimityLevel,
          totalCost: this.calculateCostBreakdown(finalProposals, evaluations).totalCostUSD
        }
      );

      const visualization = this.messageCollector.buildVisualization(
        finalProposals,
        evaluations,
        consensusEntity,
        votingData,
        committeeDecision.id
      );

      // Update agent weights based on performance
      this.updateAgentPerformance(finalProposals, evaluations, consensusEntity.finalWinner);

      const result: CommitteeDeliberationResult = {
        winnerId: consensusEntity.finalWinner,
        metadata: {
          confidence: consensusEntity.confidenceLevel,
          reasoning: consensusEntity.synthesizedReasoning,
          dataPoints: consensusEntity.mergedEvidence.map(e => e.source),
          timestamp: new Date()
        },
        committeeDecision,
        deliberationMetrics: {
          totalProposals: finalProposals.length,
          deliberationTimeMs,
          consensusLevel: consensusEntity.metrics.unanimityLevel,
          costBreakdown: this.calculateCostBreakdown(finalProposals, evaluations)
        },
        visualization,
        messages: this.messageCollector.getMessages()
      };

      logger.info('Committee deliberation completed successfully', {
        contractId: input.contractId,
        winner: consensusEntity.finalWinner,
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

  private async evaluateProposals(
    proposals: AgentProposal[],
    input: CommitteeDeliberationInput
  ): Promise<JudgeEvaluation[]> {
    logger.info('Starting discussion phase');

    // Group proposals by agent and pick an anchor proposal per agent
    const proposalsByAgent = new Map<string, AgentProposal[]>();
    for (const p of proposals) {
      const list = proposalsByAgent.get(p.agentId) || [];
      list.push(p);
      proposalsByAgent.set(p.agentId, list);
    }
    const anchorByAgent = new Map<string, AgentProposal>();
    for (const [aid, list] of proposalsByAgent.entries()) {
      anchorByAgent.set(aid, list[0]);
    }

    // Map agentId -> agent service
    const agentMap = new Map<string, IAgentService>();
    this.proposerAgents.forEach(a => agentMap.set(a.agentId, a));

    // Track latest stance per agent during discussion
    const latestStance = new Map<string, { confidence: number; rationale: string }>();

    const summarize = (p: AgentProposal) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      winner: p.winnerId,
      confidence: p.confidence,
      rationale: p.rationale.substring(0, 200)
    });

    const discussionRounds = Math.max(
      1,
      parseInt(process.env.DISCUSSION_ROUNDS || `${this.config.judgeConfiguration.pairwiseRounds || 2}`)
    );
    for (let round = 1; round <= discussionRounds; round++) {
      logger.info('Discussion round', { round, participantCount: anchorByAgent.size });
      for (const [agentId, anchor] of anchorByAgent.entries()) {
        const agent = agentMap.get(agentId);
        if (!agent) continue;

        const peers = Array.from(anchorByAgent.entries())
          .filter(([otherId]) => otherId !== agentId)
          .map(([_, ap]) => summarize(ap));

        try {
          const updates = await agent.generateProposals(
            {
              contractId: input.contractId,
              partyA: input.partyA,
              partyB: input.partyB,
              context: {
                discussion: {
                  round,
                  peers,
                  instruction:
                    "You are in a live discussion with peers. Present a persuasive statement, respond to peers' points, and state (or reinforce) your winner with rationale. Keep JSON schema."
                }
              }
            },
            1
          );

          if (updates.length > 0) {
            const upd = updates[0];
            latestStance.set(agentId, { confidence: upd.confidence, rationale: upd.rationale });
            // Update anchor to reflect current stance (including winner)
            anchorByAgent.set(agentId, upd);

            // Emit a discussion evaluation message
            const evalMsg = new JudgeEvaluation(
              `disc_${agentId}_${round}`,
              anchor.id,
              'committee_discussion',
              'Committee Discussion',
              0,
              {
                completeness: 0.5,
                consistency: 0.5,
                evidenceQuality: 0.5,
                clarity: anchor.getQualityScore(),
                relevance: anchor.hasSufficientEvidence() ? 0.8 : 0.5
              },
              [],
              Math.min(1, Math.max(0, upd.confidence)),
              [upd.rationale.substring(0, 200)],
              0.75,
              {
                evaluationTimeMs: 800,
                evaluationMethod: 'discussion_statement'
              }
            );
            this.messageCollector.collectEvaluation(evalMsg);
          }
        } catch (err) {
          logger.warn('Discussion statement generation failed', {
            agentId,
            round,
            error: err instanceof Error ? err.message : 'Unknown error'
          });
        }
      }
    }

    // Record latest winners by agent for voting
    this.lastAgentWinners.clear();
    for (const [aid, ap] of anchorByAgent.entries()) {
      this.lastAgentWinners.set(aid, ap.winnerId);
    }
    // Persist latest updated proposals for final decision/evidence
    this.lastUpdatedProposals = Array.from(anchorByAgent.values());

    // Build final evaluations per original proposal using latest stance
    const evaluations: JudgeEvaluation[] = proposals.map((proposal) => {
      const stance = latestStance.get(proposal.agentId);
      const overall = Math.min(1, Math.max(0, stance?.confidence ?? proposal.confidence));
      return new JudgeEvaluation(
        `eval_${proposal.id}`,
        proposal.id,
        'committee_discussion_summary',
        'Committee Discussion Summary',
        0,
        {
          completeness: 0.5,
          consistency: 0.5,
          evidenceQuality: 0.5,
          clarity: proposal.getQualityScore(),
          relevance: proposal.hasSufficientEvidence() ? 0.8 : 0.5
        },
        [],
        overall,
        ['Latest stance consolidated after discussion'],
        0.75,
        {
          evaluationTimeMs: 1000,
          evaluationMethod: 'discussion_summary'
        }
      );
    });

    evaluations.forEach(e => this.messageCollector.collectEvaluation(e));
    return evaluations;
  }

  // Build unanimous consensus entity
  private buildUnanimousConsensus(finalWinner: string, proposals: AgentProposal[]): ConsensusResultEntity {
    const supporters = proposals.filter(p => p.winnerId === finalWinner);
    const mergedEvidence: EvidenceSource[] = supporters.slice(0, 3).map(p => ({
      source: p.rationale.substring(0, 200),
      relevance: 1,
      credibility: 1,
      snippet: p.evidence[0] || p.rationale.substring(0, 80)
    }));

    return new ConsensusResultEntity(
      finalWinner,
      1,
      0,
      mergedEvidence,
      `모든 참여자가 '${finalWinner}'로 만장일치하여 승자를 결정했습니다.`,
      'majority',
      {
        unanimityLevel: 1,
        confidenceVariance: 0,
        evidenceOverlap: 0,
        reasoning: {
          sharedPoints: [],
          conflictingPoints: [],
          uniqueInsights: []
        }
      },
      [],
      {
        hasMinorityDissent: false,
        hasInsufficientEvidence: supporters.length <= 1,
        hasConflictingEvidence: false,
        requiresHumanReview: false
      }
    );
  }

  // Build majority consensus entity
  private buildMajorityConsensus(finalWinner: string, proposals: AgentProposal[], counts: Record<string, number>): ConsensusResultEntity {
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const supporters = proposals.filter(p => p.winnerId === finalWinner);
    const mergedEvidence: EvidenceSource[] = supporters.slice(0, 3).map(p => ({
      source: p.rationale.substring(0, 200),
      relevance: 1,
      credibility: 1,
      snippet: p.evidence[0] || p.rationale.substring(0, 80)
    }));

    return new ConsensusResultEntity(
      finalWinner,
      1,
      0,
      mergedEvidence,
      `최대 라운드 초과에 따라 단순 다수결로 '${finalWinner}'를 승자로 결정했습니다.`,
      'majority',
      {
        unanimityLevel: (counts[finalWinner] || 0) / total,
        confidenceVariance: 0,
        evidenceOverlap: 0,
        reasoning: {
          sharedPoints: [],
          conflictingPoints: [],
          uniqueInsights: []
        }
      },
      [],
      {
        hasMinorityDissent: (counts[finalWinner] || 0) < total,
        hasInsufficientEvidence: supporters.length <= 1,
        hasConflictingEvidence: false,
        requiresHumanReview: false
      }
    );
  }

  private buildUnanimousVotingData(winner: string): VotingData {
    const votes = this.proposerAgents.map(a => ({
      agentId: a.agentId,
      agentName: a.agentName,
      choice: winner,
      confidence: 1,
      weight: 1,
      contribution: 1
    }));
    const distribution: Record<string, number> = { [winner]: 1 };
    return {
      method: 'majority',
      votes,
      distribution,
      winner,
      margin: 1,
      totalWeight: votes.length
    };
  }

  private buildMajorityVotingData(counts: Record<string, number>): VotingData {
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const distribution: Record<string, number> = {};
    Object.entries(counts).forEach(([k, v]) => {
      distribution[k] = v / total;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const winner = sorted[0][0];
    const margin = (sorted[0][1] - (sorted[1]?.[1] || 0)) / total;
    const votes = this.proposerAgents.map(a => ({
      agentId: a.agentId,
      agentName: a.agentName,
      choice: winner,
      confidence: 1,
      weight: 1,
      contribution: 1
    }));
    return {
      method: 'majority',
      votes,
      distribution,
      winner,
      margin,
      totalWeight: total
    };
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
    // Equal-weight voting: one vote per participant (agent). If an agent made
    // multiple proposals, pick the best one by proposal quality score (fallback
    // to confidence) and cast a single vote for that choice.
    const votes: VotingData['votes'] = [];
    const distribution: Record<string, number> = {};
    let totalWeight = 0;

    // Group proposals by agent
    const byAgent = new Map<string, AgentProposal[]>();
    proposals.forEach(p => {
      const arr = byAgent.get(p.agentId) || [];
      arr.push(p);
      byAgent.set(p.agentId, arr);
    });

    // Select best proposal per agent
    for (const [agentId, arr] of byAgent.entries()) {
      let best = arr[0];
      let bestScore = best.getQualityScore();
      for (let i = 1; i < arr.length; i++) {
        const s = arr[i].getQualityScore();
        if (s > bestScore || (s === bestScore && arr[i].confidence > best.confidence)) {
          best = arr[i];
          bestScore = s;
        }
      }

      // Cast one equal-weight vote per agent
      const weight = 1;
      const contribution = 1;
      votes.push({
        agentId,
        agentName: best.agentName,
        choice: best.winnerId,
        confidence: best.confidence,
        weight,
        contribution
      });

      distribution[best.winnerId] = (distribution[best.winnerId] || 0) + 1;
      totalWeight += 1;
    }

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
