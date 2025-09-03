import { injectable, inject } from 'inversify';
import { IJuryService, IJuror, DeliberationConfig } from '../../../domain/services/IJuryService';
import { InvestigationReport } from '../../../domain/entities/InvestigationReport';
import { JurorOpinion, JurorId } from '../../../domain/entities/JurorOpinion';
import { JuryDeliberation } from '../../../domain/entities/JuryDeliberation';
import { JuryDiscussion } from '../../../domain/entities/JuryDiscussion';
import { DeliberationRound, VotingResult } from '../../../domain/entities/DeliberationRound';
import { Choice } from '../../../domain/entities/DebateContract';
import { GPT5Juror } from './GPT5Juror';
import { ClaudeJuror } from './ClaudeJuror';
import { GeminiJuror } from './GeminiJuror';
import { DiscussionManager } from './DiscussionManager';
import { logger } from '../../logging/Logger';

@injectable()
export class JuryOrchestrator implements IJuryService {
  private jurors: Map<JurorId, IJuror>;
  private discussionManager: DiscussionManager;
  
  constructor(
    @inject('DiscussionManager') discussionManager?: DiscussionManager
  ) {
    // 배심원단 초기화
    this.jurors = new Map<JurorId, IJuror>([
      ['gpt5', new GPT5Juror()],
      ['claude', new ClaudeJuror()],
      ['gemini', new GeminiJuror()]
    ]);
    
    this.discussionManager = discussionManager || new DiscussionManager();
  }

  async deliberate(
    report: InvestigationReport,
    config: DeliberationConfig
  ): Promise<JuryDeliberation> {
    const deliberationId = `deliberation_${report.contractId}_${Date.now()}`;
    const startTime = Date.now();
    
    logger.info('Starting jury deliberation', {
      deliberationId,
      reportId: report.id,
      maxRounds: config.maxRounds
    });

    try {
      // 1단계: 각 배심원 초기 평가
      const initialOpinions = await this.getInitialOpinions(report);
      
      logger.info('Initial opinions formed', {
        opinions: initialOpinions.map(o => ({
          juror: o.jurorId,
          position: o.currentPosition,
          confidence: o.confidenceLevel
        }))
      });

      // 2단계: 토론 라운드 진행
      const deliberationRounds: DeliberationRound[] = [];
      let currentOpinions = [...initialOpinions];
      let unanimous = false;
      let round = 0;

      while (round < config.maxRounds && !unanimous) {
        round++;
        const roundStartTime = Date.now();
        
        logger.info(`Starting deliberation round ${round}`);
        
        // 토론 진행
        const discussions = await this.conductDiscussion(
          currentOpinions,
          round,
          this.getAllDiscussions(deliberationRounds)
        );
        
        // 설득 및 의견 변경 처리
        if (config.enablePersuasion) {
          currentOpinions = await this.processPersuasion(
            currentOpinions,
            discussions
          );
        }
        
        // 투표
        const votingResult = this.conductVoting(currentOpinions);
        
        // 만장일치 확인
        unanimous = config.unanimityRequired 
          ? this.checkUnanimity(currentOpinions)
          : this.checkMajority(votingResult);
        
        // 라운드 기록
        const roundDuration = Date.now() - roundStartTime;
        const deliberationRound = new DeliberationRound(
          round,
          discussions,
          votingResult,
          [...currentOpinions], // 복사본 저장
          unanimous,
          roundDuration
        );
        
        deliberationRounds.push(deliberationRound);
        
        logger.info(`Round ${round} completed`, {
          votingResult,
          unanimous,
          durationMs: roundDuration
        });
        
        // 조기 종료 조건
        if (this.shouldEarlyExit(currentOpinions, config)) {
          logger.info('Early exit condition met');
          break;
        }
      }

      // 3단계: 최종 판결 결정
      const finalVerdict = this.determineFinalVerdict(
        currentOpinions,
        deliberationRounds,
        config
      );

      // 4단계: 심의 결과 생성
      const deliberationTime = Date.now() - startTime;
      
      const juryDeliberation = new JuryDeliberation(
        deliberationId,
        report.contractId,
        report.id,
        initialOpinions,
        deliberationRounds,
        unanimous,
        deliberationTime,
        undefined,
        finalVerdict,
        currentOpinions
      );

      logger.info('Deliberation completed', {
        deliberationId,
        verdict: finalVerdict,
        unanimous,
        rounds: deliberationRounds.length,
        timeMs: deliberationTime
      });

      return juryDeliberation;

    } catch (error) {
      logger.error('Deliberation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        deliberationId
      });
      throw error;
    }
  }

  async conductDiscussion(
    currentOpinions: JurorOpinion[],
    roundNumber: number,
    previousDiscussions?: JuryDiscussion[]
  ): Promise<JuryDiscussion[]> {
    return await this.discussionManager.facilitateDiscussion(
      currentOpinions,
      roundNumber,
      this.jurors,
      previousDiscussions
    );
  }

  checkUnanimity(opinions: JurorOpinion[]): boolean {
    if (opinions.length === 0) return false;
    
    const positions = opinions.map(o => o.currentPosition);
    const firstPosition = positions[0];
    
    // 모두 같은 입장이고 UNDECIDED가 아닌 경우
    return firstPosition !== 'UNDECIDED' && 
           positions.every(p => p === firstPosition);
  }

  conductVoting(opinions: JurorOpinion[]): VotingResult {
    const voteA: JurorId[] = [];
    const voteB: JurorId[] = [];
    const abstain: JurorId[] = [];
    
    opinions.forEach(opinion => {
      switch (opinion.currentPosition) {
        case 'A':
          voteA.push(opinion.jurorId);
          break;
        case 'B':
          voteB.push(opinion.jurorId);
          break;
        case 'UNDECIDED':
          abstain.push(opinion.jurorId);
          break;
      }
    });
    
    return { voteA, voteB, abstain };
  }

  // === Private 메서드들 ===

  private async getInitialOpinions(report: InvestigationReport): Promise<JurorOpinion[]> {
    const opinions: JurorOpinion[] = [];
    
    for (const [jurorId, juror] of this.jurors) {
      try {
        const opinion = await juror.evaluateReport(report);
        opinions.push(opinion);
      } catch (error) {
        logger.error(`Failed to get initial opinion from ${jurorId}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // 실패한 배심원은 UNDECIDED로 처리
        opinions.push(new JurorOpinion(
          jurorId,
          juror.jurorName,
          'UNDECIDED',
          '평가 실패',
          0.1,
          { premiseValidity: 0.5, logicalCoherence: 0.5, evidenceStrength: 0.5, probabilityScore: 0.5 },
          false,
          [],
          ['평가 오류'],
          [],
          1.0
        ));
      }
    }
    
    return opinions;
  }

  private async processPersuasion(
    opinions: JurorOpinion[],
    discussions: JuryDiscussion[]
  ): Promise<JurorOpinion[]> {
    const updatedOpinions = [...opinions];
    
    // 설득 시도 찾기
    const persuasionAttempts = discussions.filter(d => 
      d.persuasionIntent > 0.5 && 
      (d.argumentType === 'challenge' || d.argumentType === 'support')
    );
    
    for (const attempt of persuasionAttempts) {
      if (!attempt.addressingJuror) continue;
      
      const targetIndex = updatedOpinions.findIndex(o => o.jurorId === attempt.addressingJuror);
      if (targetIndex === -1) continue;
      
      const targetOpinion = updatedOpinions[targetIndex];
      const targetJuror = this.jurors.get(attempt.addressingJuror);
      
      if (targetJuror && targetOpinion.canBePersuaded()) {
        const result = await targetJuror.considerPersuasion(attempt, targetOpinion);
        
        if (result.changed && result.newOpinion) {
          updatedOpinions[targetIndex] = result.newOpinion;
          logger.info('Juror changed opinion', {
            juror: attempt.addressingJuror,
            oldPosition: targetOpinion.currentPosition,
            newPosition: result.newOpinion.currentPosition
          });
        }
      }
    }
    
    return updatedOpinions;
  }

  private getAllDiscussions(rounds: DeliberationRound[]): JuryDiscussion[] {
    return rounds.flatMap(r => r.discussions);
  }

  private checkMajority(votingResult: VotingResult): boolean {
    const { voteA, voteB } = votingResult;
    return voteA.length >= 2 || voteB.length >= 2;
  }

  private shouldEarlyExit(opinions: JurorOpinion[], config: DeliberationConfig): boolean {
    // 모든 배심원의 신뢰도가 임계값을 넘으면 조기 종료
    const allHighConfidence = opinions.every(o => 
      o.confidenceLevel >= config.minConfidenceThreshold
    );
    
    // 더 이상 의견 변경 의향이 없으면 종료
    const noOneWillingToChange = opinions.every(o => !o.willingToChange);
    
    return allHighConfidence || noOneWillingToChange;
  }

  private determineFinalVerdict(
    finalOpinions: JurorOpinion[],
    rounds: DeliberationRound[],
    config: DeliberationConfig
  ): Choice {
    // 마지막 투표 결과 확인
    if (rounds.length > 0) {
      const lastRound = rounds[rounds.length - 1];
      const { voteA, voteB } = lastRound.votingResult;
      
      if (config.unanimityRequired) {
        // 만장일치 요구 시
        if (voteA.length === 3) return Choice.ARGUMENT_A;
        if (voteB.length === 3) return Choice.ARGUMENT_B;
        return Choice.UNDECIDED;
      } else {
        // 다수결
        if (voteA.length > voteB.length) return Choice.ARGUMENT_A;
        if (voteB.length > voteA.length) return Choice.ARGUMENT_B;
        
        // 동점일 경우 신뢰도 합계로 결정
        const confidenceA = finalOpinions
          .filter(o => o.currentPosition === 'A')
          .reduce((sum, o) => sum + o.confidenceLevel, 0);
        const confidenceB = finalOpinions
          .filter(o => o.currentPosition === 'B')
          .reduce((sum, o) => sum + o.confidenceLevel, 0);
        
        if (confidenceA > confidenceB) return Choice.ARGUMENT_A;
        if (confidenceB > confidenceA) return Choice.ARGUMENT_B;
      }
    }
    
    return Choice.UNDECIDED;
  }
}
