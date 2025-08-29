import { injectable, inject } from 'inversify';
import { IAgentService, IConsensusResult } from '../../domain/services/IAgentService';
import { AgentProposal } from '../../domain/entities/AgentProposal';
import { JudgeEvaluation, EvaluationCriteria, PairwiseResult } from '../../domain/entities/JudgeEvaluation';
import { ConsensusResult } from '../../domain/valueObjects/ConsensusResult';
import { DeliberationMessage } from '../../domain/valueObjects/DeliberationMessage';
import { 
  DeliberationVisualization,
  ProgressData,
  VotingData,
  PairwiseComparisonData,
  EvaluationRadarData,
  TimelineData,
  CostBreakdownData
} from '../../domain/valueObjects/DeliberationVisualization';
import { DeliberationEventEmitter } from './events/DeliberationEventEmitter';
import { 
  DeliberationStartedEvent,
  ProposalGeneratedEvent,
  ProposalPhaseCompletedEvent,
  EvaluationStartedEvent,
  PairwiseComparisonEvent,
  JudgmentPhaseCompletedEvent,
  VotingStartedEvent,
  VoteCastEvent,
  ConsensusReachedEvent,
  DeliberationCompletedEvent
} from '../../domain/events/DeliberationEvent';
import { logger } from '../logging/Logger';

@injectable()
export class MessageCollector {
  private messages: DeliberationMessage[] = [];
  private startTime: Date;
  private phaseStartTimes: Record<string, Date> = {};
  private contractId: string = '';

  constructor(
    @inject('DeliberationEventEmitter') private eventEmitter: DeliberationEventEmitter
  ) {
    this.startTime = new Date();
  }

  /**
   * Initializes the collector for a new deliberation
   */
  initialize(contractId: string, agentCount: number): void {
    this.contractId = contractId;
    this.messages = [];
    this.startTime = new Date();
    this.phaseStartTimes = {};
    
    // Emit deliberation started event
    this.eventEmitter.emitDeliberationEvent(
      new DeliberationStartedEvent(contractId, agentCount, 15000) // Estimated 15 seconds
    );
    
    // Add initial progress message
    const startMessage = DeliberationMessage.createProgress('proposing', '위원회 심의 시작', 0);
    this.addMessage(startMessage);
    
    logger.info('MessageCollector initialized', { contractId, agentCount });
  }

  /**
   * Starts a new phase
   */
  startPhase(phase: 'proposing' | 'discussion' | 'consensus'): void {
    this.phaseStartTimes[phase] = new Date();
    
    const phaseNames = {
      proposing: '제안 생성 단계',
      discussion: '토의 단계',
      consensus: '합의 단계'
    } as const;
    
    const message = DeliberationMessage.createProgress(
      phase, 
      `${phaseNames[phase]} 시작`, 
      phase === 'proposing' ? 10 : phase === 'discussion' ? 40 : 80
    );
    this.addMessage(message);
  }

  /**
   * Collects a proposal from an agent
   */
  collectProposal(agent: IAgentService, proposal: AgentProposal): void {
    const message = DeliberationMessage.createProposal(
      agent.agentId,
      agent.agentName,
      proposal.winnerId,
      proposal.confidence,
      proposal.rationale,
      proposal.evidence,
      proposal.metadata.tokenUsage.totalTokens,
      proposal.metadata.processingTimeMs
    );
    
    this.addMessage(message);
    
    // Emit proposal generated event
    this.eventEmitter.emitDeliberationEvent(
      new ProposalGeneratedEvent(
        this.contractId,
        agent.agentId,
        agent.agentName,
        proposal.id,
        proposal.winnerId,
        proposal.confidence
      )
    );
    
    logger.debug('Proposal collected', {
      contractId: this.contractId,
      agentId: agent.agentId,
      proposalId: proposal.id,
      winner: proposal.winnerId
    });
  }

  /**
   * Marks proposal phase as completed
   */
  completeProposalPhase(proposals: AgentProposal[]): void {
    const winnerDistribution: Record<string, number> = {};
    proposals.forEach(p => {
      winnerDistribution[p.winnerId] = (winnerDistribution[p.winnerId] || 0) + 1;
    });
    
    const message = DeliberationMessage.createProgress(
      'proposing', 
      `제안 생성 완료 (총 ${proposals.length}개)`, 
      30
    );
    this.addMessage(message);
    
    // Emit phase completed event
    this.eventEmitter.emitDeliberationEvent(
      new ProposalPhaseCompletedEvent(this.contractId, proposals.length, winnerDistribution)
    );
  }

  /**
   * Collects a rule-based evaluation
   */
  collectEvaluation(evaluation: JudgeEvaluation): void {
    const reasoning = [
      `완전성: ${evaluation.criteria.completeness.toFixed(2)}`,
      `일관성: ${evaluation.criteria.consistency.toFixed(2)}`,
      `증거품질: ${evaluation.criteria.evidenceQuality.toFixed(2)}`,
      `명확성: ${evaluation.criteria.clarity.toFixed(2)}`
    ];
    
    const message = DeliberationMessage.createEvaluation(
      evaluation.proposalId,
      {
        completeness: evaluation.criteria.completeness,
        consistency: evaluation.criteria.consistency,
        evidenceQuality: evaluation.criteria.evidenceQuality,
        clarity: evaluation.criteria.clarity,
        overall: evaluation.overallScore
      },
      reasoning
    );
    
    this.addMessage(message);
    
    logger.debug('Evaluation collected', {
      contractId: this.contractId,
      proposalId: evaluation.proposalId,
      overallScore: evaluation.overallScore
    });
  }

  /**
   * Collects a pairwise comparison result
   */
  collectPairwiseComparison(
    proposalAId: string,
    proposalBId: string,
    winner: 'A' | 'B' | 'tie',
    scoreA: number,
    scoreB: number,
    reasoning: string[],
    round: number
  ): void {
    const message = DeliberationMessage.createComparison(
      proposalAId,
      proposalBId,
      winner,
      scoreA,
      scoreB,
      reasoning,
      round
    );
    
    this.addMessage(message);
    
    // Emit pairwise comparison event
    this.eventEmitter.emitDeliberationEvent(
      new PairwiseComparisonEvent(
        this.contractId,
        proposalAId,
        proposalBId,
        winner,
        round
      )
    );
    
    logger.debug('Pairwise comparison collected', {
      contractId: this.contractId,
      proposalAId,
      proposalBId,
      winner,
      round
    });
  }

  /**
   * Marks judgment phase as completed
   */
  completeJudgmentPhase(evaluations: JudgeEvaluation[]): void {
    const rankings = evaluations
      .map(e => ({
        proposalId: e.proposalId,
        score: e.overallScore,
        rank: 0
      }))
      .sort((a, b) => b.score - a.score)
      .map((item, index) => ({ ...item, rank: index + 1 }));
    
    const message = DeliberationMessage.createProgress(
      'discussion', 
      `토의 완료 (총 ${evaluations.length}개 평가)`, 
      70
    );
    this.addMessage(message);
    
    // Emit judgment phase completed event
    this.eventEmitter.emitDeliberationEvent(
      new JudgmentPhaseCompletedEvent(this.contractId, rankings)
    );
  }

  /**
   * Starts voting phase
   */
  startVoting(method: string, participantCount: number): void {
    const message = DeliberationMessage.createProgress(
      'consensus', 
      `투표 시작 (방법: ${method})`, 
      80
    );
    this.addMessage(message);
    
    // Emit voting started event
    this.eventEmitter.emitDeliberationEvent(
      new VotingStartedEvent(this.contractId, method, participantCount)
    );
  }

  /**
   * Collects a vote
   */
  collectVote(
    agentId: string,
    agentName: string,
    choice: string,
    confidence: number,
    weight: number,
    contribution: number
  ): void {
    const message = DeliberationMessage.createVote(
      agentId,
      agentName,
      choice,
      confidence,
      weight,
      contribution
    );
    
    this.addMessage(message);
    
    // Emit vote cast event
    this.eventEmitter.emitDeliberationEvent(
      new VoteCastEvent(this.contractId, agentId, choice, weight)
    );
    
    logger.debug('Vote collected', {
      contractId: this.contractId,
      agentId,
      choice,
      contribution
    });
  }

  /**
   * Collects the final synthesis result
   */
  collectSynthesis(result: IConsensusResult, method: string): void {
    const message = DeliberationMessage.createSynthesis(
      result.finalWinner,
      result.confidenceLevel,
      result.synthesizedReasoning,
      method
    );
    
    this.addMessage(message);
    
    // Emit consensus reached event
    this.eventEmitter.emitDeliberationEvent(
      new ConsensusReachedEvent(
        this.contractId,
        result.finalWinner,
        result.confidenceLevel,
        result.metrics.unanimityLevel,
        method
      )
    );
    
    logger.debug('Synthesis collected', {
      contractId: this.contractId,
      finalWinner: result.finalWinner,
      confidence: result.confidenceLevel
    });
  }

  /**
   * Marks deliberation as completed
   */
  completeDeliberation(
    finalWinner: string,
    decisionId: string,
    metrics: {
      totalProposals: number;
      totalComparisons: number;
      consensusLevel: number;
      totalCost: number;
    }
  ): void {
    const endTime = new Date();
    const totalDuration = endTime.getTime() - this.startTime.getTime();
    
    const completionMessage = DeliberationMessage.createProgress(
      'completed', 
      `위원회 심의 완료: ${finalWinner}`, 
      100
    );
    this.addMessage(completionMessage);
    
    // Emit deliberation completed event
    this.eventEmitter.emitDeliberationEvent(
      new DeliberationCompletedEvent(
        this.contractId,
        finalWinner,
        totalDuration,
        decisionId,
        metrics
      )
    );
    
    logger.info('Deliberation completed', {
      contractId: this.contractId,
      finalWinner,
      totalDuration,
      messageCount: this.messages.length
    });
  }

  /**
   * Adds a message and emits it for real-time streaming
   */
  private addMessage(message: DeliberationMessage): void {
    this.messages.push(message);
    this.eventEmitter.emitMessage(this.contractId, message);
    
    // Debug logging
    console.log(`💬 Message collected #${this.messages.length}:`, {
      contractId: this.contractId,
      messageType: message.messageType,
      phase: message.phase,
      agentName: message.agentName || 'system'
    });
  }

  /**
   * Gets all collected messages
   */
  getMessages(): DeliberationMessage[] {
    return [...this.messages];
  }

  /**
   * Builds complete visualization data
   */
  buildVisualization(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[],
    consensus: IConsensusResult,
    votingData: VotingData,
    committeeDecisionId: string
  ): DeliberationVisualization {
    const endTime = new Date();
    const totalDuration = endTime.getTime() - this.startTime.getTime();
    
    return new DeliberationVisualization(
      this.getMessages(),
      this.buildProgressData(),
      votingData,
      this.buildPairwiseMatrix(proposals, evaluations),
      this.buildEvaluationRadar(proposals, evaluations),
      this.buildTimeline(totalDuration),
      this.buildCostBreakdown(proposals, evaluations),
      {
        contractId: this.contractId,
        committeeDecisionId,
        createdAt: this.startTime,
        finalWinner: consensus.finalWinner,
        finalConfidence: consensus.confidenceLevel
      }
    );
  }

  private buildProgressData(): ProgressData {
    const phases = ['proposing', 'discussion', 'consensus', 'completed'];
    const completedSteps = this.messages
      .filter(m => m.messageType === 'progress')
      .map(m => m.content.progress?.step || '');
    
    return {
      currentPhase: 'completed',
      completedSteps,
      totalSteps: phases.length,
      percentComplete: 100
    };
  }

  private buildPairwiseMatrix(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[]
  ): PairwiseComparisonData {
    const comparisonMessages = this.messages.filter(m => m.messageType === 'comparison');
    const proposalData = proposals.map(p => ({
      id: p.id,
      agentName: p.agentName,
      winner: p.winnerId,
      confidence: p.confidence
    }));

    const comparisons = comparisonMessages.map(m => ({
      proposalAId: m.metadata.comparisonPair?.split(' vs ')[0] || '',
      proposalBId: m.metadata.comparisonPair?.split(' vs ')[1] || '',
      proposalAName: proposals.find(p => p.id === m.metadata.comparisonPair?.split(' vs ')[0])?.agentName || 'Unknown',
      proposalBName: proposals.find(p => p.id === m.metadata.comparisonPair?.split(' vs ')[1])?.agentName || 'Unknown',
      winner: m.content.winner as 'A' | 'B' | 'tie',
      scoreA: m.content.scores?.A || 0,
      scoreB: m.content.scores?.B || 0,
      reasoning: m.content.reasoning?.join('; ') || '',
      round: m.metadata.round || 1
    }));

    // Build win/loss matrix
    const n = proposals.length;
    const matrix = Array(n).fill(0).map(() => Array(n).fill(0.5)); // Initialize with ties
    
    // Populate matrix based on comparisons (simplified)
    comparisons.forEach(comp => {
      const aIndex = proposals.findIndex(p => p.id === comp.proposalAId);
      const bIndex = proposals.findIndex(p => p.id === comp.proposalBId);
      
      if (aIndex >= 0 && bIndex >= 0) {
        if (comp.winner === 'A') {
          matrix[aIndex][bIndex] = 1;
          matrix[bIndex][aIndex] = 0;
        } else if (comp.winner === 'B') {
          matrix[aIndex][bIndex] = 0;
          matrix[bIndex][aIndex] = 1;
        }
      }
    });

    return {
      proposals: proposalData,
      comparisons,
      matrix
    };
  }

  private buildEvaluationRadar(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[]
  ): EvaluationRadarData {
    const criteria = ['completeness', 'consistency', 'evidenceQuality', 'clarity'];
    
    const proposalData = proposals.map(proposal => {
      const evaluation = evaluations.find(e => e.proposalId === proposal.id);
      const scores = criteria.map(criterion => 
        evaluation?.criteria[criterion as keyof EvaluationCriteria] || 0
      );
      
      return {
        id: proposal.id,
        agentName: proposal.agentName,
        winner: proposal.winnerId,
        scores,
        overallScore: evaluation?.overallScore || 0
      };
    });

    return {
      criteria,
      proposals: proposalData,
      maxScore: 1.0
    };
  }

  private buildTimeline(totalDuration: number): TimelineData {
    const events = this.messages.map(m => ({
      timestamp: m.metadata.timestamp,
      phase: m.phase,
      event: m.messageType,
      description: m.getSummary(),
      duration: m.metadata.processingTimeMs,
      agentName: m.agentName
    }));

    const phaseBreakdown: Record<string, number> = {};
    const phases = ['proposing', 'discussion', 'consensus'];
    
    phases.forEach(phase => {
      const phaseMessages = this.messages.filter(m => m.phase === phase);
      if (phaseMessages.length > 0) {
        const start = phaseMessages[0].metadata.timestamp.getTime();
        const end = phaseMessages[phaseMessages.length - 1].metadata.timestamp.getTime();
        phaseBreakdown[phase] = end - start;
      }
    });

    return {
      events,
      totalDuration,
      phaseBreakdown
    };
  }

  private buildCostBreakdown(
    proposals: AgentProposal[],
    evaluations: JudgeEvaluation[]
  ): CostBreakdownData {
    const proposerCosts = proposals.map(p => ({
      agentId: p.agentId,
      agentName: p.agentName,
      tokenUsage: p.metadata.tokenUsage.totalTokens,
      estimatedCost: p.metadata.getCostEstimate()
    }));

    const judgeTokens = evaluations.reduce((sum, e) => sum + (e.metadata.tokenUsage || 0), 0);
    const judgeCosts = {
      ruleBasedTokens: Math.round(judgeTokens * 0.3),
      pairwiseTokens: Math.round(judgeTokens * 0.7),
      totalTokens: judgeTokens,
      estimatedCost: judgeTokens * 0.002 / 1000 // Rough estimate
    };

    const synthesisCosts = {
      tokenUsage: 500, // Estimated
      estimatedCost: 0.001 // Estimated
    };

    const totalCost = proposerCosts.reduce((sum, p) => sum + p.estimatedCost, 0) +
                     judgeCosts.estimatedCost +
                     synthesisCosts.estimatedCost;

    return {
      proposerCosts,
      judgeCosts,
      synthesisCosts,
      totalCost
    };
  }
}
