import { injectable, inject } from 'inversify';
import { IInvestigatorService, DebateAnalysisInput } from '../../domain/services/IInvestigatorService';
import { IJuryService, DeliberationConfig } from '../../domain/services/IJuryService';
import { DebateContract, Choice } from '../../domain/entities/DebateContract';
import { DebateComment } from '../../domain/entities/DebateComment';
import { InvestigationReport } from '../../domain/entities/InvestigationReport';
import { JuryDeliberation } from '../../domain/entities/JuryDeliberation';
import { ClaudeInvestigator } from './investigator/ClaudeInvestigator';
import { JuryOrchestrator } from './jury/JuryOrchestrator';
import { UnanimousConsensus, ConsensusResult } from './consensus/UnanimousConsensus';
import { MessageCollector } from './MessageCollector';
import { logger } from '../logging/Logger';

export interface DebateAnalysisResult {
  contractId: string;
  investigationReport: InvestigationReport;
  juryDeliberation: JuryDeliberation;
  finalConsensus: ConsensusResult;
  executionTimeMs: number;
  success: boolean;
  error?: string;
}

export interface DebateAnalysisConfig {
  investigationEnabled: boolean;
  juryEnabled: boolean;
  maxDeliberationRounds: number;
  unanimityRequired: boolean;
  minConfidenceThreshold: number;
  streamingEnabled?: boolean;
  deliberationId?: string;
}

@injectable()
export class DebateAnalysisOrchestrator {
  private investigator: IInvestigatorService;
  private juryService: IJuryService;
  private consensusService: UnanimousConsensus;
  
  constructor(
    @inject('ClaudeInvestigator') investigator?: IInvestigatorService,
    @inject('JuryOrchestrator') juryService?: IJuryService,
    @inject('UnanimousConsensus') consensusService?: UnanimousConsensus,
    @inject('MessageCollector') private messageCollector?: MessageCollector
  ) {
    this.investigator = investigator || new ClaudeInvestigator();
    this.juryService = juryService || new JuryOrchestrator();
    this.consensusService = consensusService || new UnanimousConsensus();
  }

  async analyzeDebate(
    contract: DebateContract,
    config: DebateAnalysisConfig
  ): Promise<DebateAnalysisResult> {
    const startTime = Date.now();
    const contractId = contract.id;
    
    logger.info('Starting debate analysis', {
      contractId,
      topic: contract.topic,
      totalComments: contract.totalComments,
      config
    });

    try {
      // 실시간 스트리밍 초기화 (설정된 경우)
      if (config.streamingEnabled && this.messageCollector && config.deliberationId) {
        this.messageCollector.initialize(contractId, 3); // 3명의 배심원
      }
      
      // Phase 1: 조사 단계
      this.emitPhaseStart('investigating', contractId);
      
      const investigationReport = await this.performInvestigation(contract, config);
      
      logger.info('Investigation completed', {
        reportId: investigationReport.id,
        strongerArgument: investigationReport.strongerArgument,
        confidence: investigationReport.confidence
      });
      
      this.emitPhaseComplete('investigating', contractId, investigationReport);
      
      // Phase 2: 배심원 심의 단계
      this.emitPhaseStart('deliberating', contractId);
      
      const juryDeliberation = await this.performDeliberation(
        investigationReport, 
        config
      );
      
      logger.info('Jury deliberation completed', {
        deliberationId: juryDeliberation.id,
        verdict: juryDeliberation.finalVerdict,
        unanimous: juryDeliberation.unanimousDecision,
        rounds: juryDeliberation.totalRounds
      });
      
      this.emitPhaseComplete('deliberating', contractId, juryDeliberation);
      
      // Phase 3: 최종 합의 도출
      this.emitPhaseStart('consensus', contractId);
      
      const finalConsensus = await this.consensusService.reachConsensus(juryDeliberation);
      
      logger.info('Final consensus reached', {
        decision: finalConsensus.decision,
        confidence: finalConsensus.confidence,
        unanimous: finalConsensus.consensusMetrics.unanimityAchieved
      });
      
      this.emitPhaseComplete('consensus', contractId, finalConsensus);
      
      // 계약 상태 업데이트
      if (finalConsensus.decision !== Choice.UNDECIDED) {
        contract.setWinner(finalConsensus.decision);
      }
      
      const executionTimeMs = Date.now() - startTime;
      
      // 최종 결과 생성
      const result: DebateAnalysisResult = {
        contractId,
        investigationReport,
        juryDeliberation,
        finalConsensus,
        executionTimeMs,
        success: true
      };
      
      logger.info('Debate analysis completed successfully', {
        contractId,
        decision: finalConsensus.decision,
        confidence: finalConsensus.confidence,
        timeMs: executionTimeMs
      });
      
      // 완료 이벤트 발송
      this.emitAnalysisComplete(contractId, result);
      
      return result;
      
    } catch (error) {
      logger.error('Debate analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        contractId
      });
      
      const executionTimeMs = Date.now() - startTime;
      
      // 실패 결과 반환
      return {
        contractId,
        investigationReport: this.createFailedInvestigationReport(contractId),
        juryDeliberation: this.createFailedDeliberation(contractId),
        finalConsensus: this.createFailedConsensus(),
        executionTimeMs,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async performInvestigation(
    contract: DebateContract,
    config: DebateAnalysisConfig
  ): Promise<InvestigationReport> {
    if (!config.investigationEnabled) {
      // 조사 비활성화 시 기본 보고서 생성
      return this.createDefaultInvestigationReport(contract);
    }
    
    const analysisInput: DebateAnalysisInput = {
      contractId: contract.id,
      topic: contract.topic,
      description: contract.description,
      argumentA: contract.argumentA,
      argumentB: contract.argumentB,
      comments: contract.comments
    };
    
    return await this.investigator.investigate(analysisInput);
  }

  private async performDeliberation(
    report: InvestigationReport,
    config: DebateAnalysisConfig
  ): Promise<JuryDeliberation> {
    if (!config.juryEnabled) {
      // 배심원 비활성화 시 조사 보고서 기반 즉시 결정
      return this.createImmediateDeliberation(report);
    }
    
    const deliberationConfig: DeliberationConfig = {
      maxRounds: config.maxDeliberationRounds,
      unanimityRequired: config.unanimityRequired,
      minConfidenceThreshold: config.minConfidenceThreshold,
      enablePersuasion: true,
      discussionDepth: 'deep'
    };
    
    return await this.juryService.deliberate(report, deliberationConfig);
  }

  // === 이벤트 발송 메서드들 ===
  
  private emitPhaseStart(phase: string, contractId: string): void {
    if (this.messageCollector) {
      try {
        this.messageCollector.startPhase(phase as any);
      } catch (error) {
        logger.error('Failed to emit phase start', {
          phase,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  private emitPhaseComplete(phase: string, contractId: string, data: any): void {
    if (this.messageCollector) {
      try {
        if (phase === 'investigating') {
          // 조사 완료 이벤트
          const report = data as InvestigationReport;
          logger.debug('Investigation phase complete event', {
            reportId: report.id
          });
        } else if (phase === 'deliberating') {
          // 심의 완료 이벤트
          const deliberation = data as JuryDeliberation;
          logger.debug('Deliberation phase complete event', {
            deliberationId: deliberation.id
          });
        } else if (phase === 'consensus') {
          // 합의 완료 이벤트
          const consensus = data as ConsensusResult;
          logger.debug('Consensus phase complete event', {
            decision: consensus.decision
          });
        }
      } catch (error) {
        logger.error('Failed to emit phase complete', {
          phase,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  private emitAnalysisComplete(contractId: string, result: DebateAnalysisResult): void {
    if (this.messageCollector) {
      try {
        this.messageCollector.completeDeliberation(
          result.finalConsensus.decision.toString(),
          result.juryDeliberation.id,
          {
            totalProposals: 3, // 3명의 배심원
            totalComparisons: result.juryDeliberation.deliberationRounds.length,
            consensusLevel: result.finalConsensus.confidence,
            totalCost: 0 // 비용 계산은 별도 구현 필요
          }
        );
      } catch (error) {
        logger.error('Failed to emit analysis complete', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }
  
  // === 실패 시 기본 객체 생성 메서드들 ===
  
  private createDefaultInvestigationReport(contract: DebateContract): InvestigationReport {
    // 기본 조사 보고서 (조사 생략 시)
    const emptyAnalysis = {
      supportingSide: 'A' as const,
      logicalStructure: {
        premises: ['조사 생략'],
        reasoning: ['조사 생략'],
        conclusion: '조사 생략',
        assumptions: []
      },
      evidenceExtracted: [],
      sourceCommentIds: [],
      keyInsights: [],
      weaknesses: [],
      counterArguments: [],
      confidence: 0.1,
      overallStrength: 0.1,
      calculateLogicalStrength: () => ({
        premiseValidity: 0.1,
        logicalCoherence: 0.1,
        evidenceStrength: 0.1,
        probabilityScore: 0.1
      }),
      getSummary: () => '조사 생략',
      toJSON: () => ({})
    };
    
    return new InvestigationReport(
      `default_report_${contract.id}`,
      contract.id,
      'claude',
      emptyAnalysis as any,
      { ...emptyAnalysis, supportingSide: 'B' as const } as any,
      [],
      [],
      0.1,
      {
        totalComments: 0,
        analyzedComments: 0,
        supportingA: 0,
        supportingB: 0,
        neutralComments: 0,
        tokensUsed: 0,
        investigationTimeMs: 0,
        model: 'claude',
        modelVersion: '0'
      }
    );
  }
  
  private createImmediateDeliberation(report: InvestigationReport): JuryDeliberation {
    // 즉시 결정 (배심원 심의 생략)
    const verdict = report.strongerArgument === 'A' 
      ? Choice.ARGUMENT_A 
      : report.strongerArgument === 'B'
        ? Choice.ARGUMENT_B
        : Choice.UNDECIDED;
    
    return new JuryDeliberation(
      `immediate_deliberation_${report.contractId}`,
      report.contractId,
      report.id,
      [], // 배심원 없음
      true, // 즉시 결정이므로 만장일치로 간주
      [], // 토론 없음
      verdict,
      [],
      0
    );
  }
  
  private createFailedInvestigationReport(contractId: string): InvestigationReport {
    return this.createDefaultInvestigationReport({ id: contractId } as DebateContract);
  }
  
  private createFailedDeliberation(contractId: string): JuryDeliberation {
    return new JuryDeliberation(
      `failed_deliberation_${contractId}`,
      contractId,
      'failed_report',
      [],
      false,
      [],
      Choice.UNDECIDED,
      [],
      0
    );
  }
  
  private createFailedConsensus(): ConsensusResult {
    return {
      decision: Choice.UNDECIDED,
      confidence: 0,
      reasoning: '분석 실패',
      dissent: null,
      consensusMetrics: {
        unanimityAchieved: false,
        convergenceRate: 0,
        averageConfidence: 0,
        deliberationQuality: 0,
        roundsToConsensus: 0
      }
    };
  }
}