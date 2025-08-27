import { injectable } from 'inversify';
import { JuryDeliberation } from '../../../domain/entities/JuryDeliberation';
import { JurorOpinion } from '../../../domain/entities/JurorOpinion';
import { Choice } from '../../../domain/entities/DebateContract';
import { logger } from '../../logging/Logger';

export interface ConsensusResult {
  decision: Choice;
  confidence: number;
  reasoning: string;
  dissent: DissentingOpinion[] | null;
  consensusMetrics: ConsensusMetrics;
}

export interface DissentingOpinion {
  jurorId: string;
  jurorName: string;
  position: string;
  reasoning: string;
}

export interface ConsensusMetrics {
  unanimityAchieved: boolean;
  convergenceRate: number;
  averageConfidence: number;
  deliberationQuality: number;
  roundsToConsensus: number;
}

@injectable()
export class UnanimousConsensus {
  
  async reachConsensus(deliberation: JuryDeliberation): Promise<ConsensusResult> {
    logger.info('Evaluating consensus', {
      deliberationId: deliberation.id,
      unanimous: deliberation.unanimousDecision,
      rounds: deliberation.totalRounds
    });

    try {
      // 만장일치 달성한 경우
      if (deliberation.unanimousDecision && deliberation.finalVerdict && 
          deliberation.finalVerdict !== Choice.UNDECIDED) {
        return this.createUnanimousResult(deliberation);
      }
      
      // 만장일치 실패한 경우
      return this.createDividedResult(deliberation);
      
    } catch (error) {
      logger.error('Consensus evaluation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        deliberationId: deliberation.id
      });
      
      return this.createFailureResult(deliberation);
    }
  }
  
  private createUnanimousResult(deliberation: JuryDeliberation): ConsensusResult {
    const finalJurors = deliberation.finalJurors || deliberation.initialJurors;
    const confidence = this.calculateConfidence(deliberation, true);
    const reasoning = this.synthesizeUnanimousReasoning(deliberation, finalJurors);
    const metrics = this.calculateMetrics(deliberation, true);
    
    logger.info('Unanimous consensus achieved', {
      decision: deliberation.finalVerdict,
      confidence,
      rounds: deliberation.totalRounds
    });
    
    return {
      decision: deliberation.finalVerdict!,
      confidence,
      reasoning,
      dissent: null,
      consensusMetrics: metrics
    };
  }
  
  private createDividedResult(deliberation: JuryDeliberation): ConsensusResult {
    const finalJurors = deliberation.finalJurors || deliberation.initialJurors;
    const dissent = this.extractDissentingOpinions(finalJurors);
    const reasoning = this.synthesizeDividedReasoning(deliberation, finalJurors);
    const confidence = this.calculateConfidence(deliberation, false);
    const metrics = this.calculateMetrics(deliberation, false);
    
    // 다수결로 결정 (만장일치 실패 시)
    const decision = this.determineMajorityDecision(finalJurors);
    
    logger.info('Divided consensus - majority decision', {
      decision,
      confidence,
      dissent: dissent.length,
      rounds: deliberation.totalRounds
    });
    
    return {
      decision,
      confidence,
      reasoning,
      dissent,
      consensusMetrics: metrics
    };
  }
  
  private createFailureResult(deliberation: JuryDeliberation): ConsensusResult {
    return {
      decision: Choice.UNDECIDED,
      confidence: 0,
      reasoning: '합의 도출 실패 - 배심원단이 결론에 도달하지 못했습니다.',
      dissent: null,
      consensusMetrics: {
        unanimityAchieved: false,
        convergenceRate: 0,
        averageConfidence: 0,
        deliberationQuality: 0,
        roundsToConsensus: deliberation.totalRounds
      }
    };
  }
  
  private calculateConfidence(deliberation: JuryDeliberation, unanimous: boolean): number {
    const finalJurors = deliberation.finalJurors || deliberation.initialJurors;
    
    // 평균 신뢰도
    const avgConfidence = finalJurors.reduce(
      (sum, j) => sum + j.confidenceLevel, 0
    ) / finalJurors.length;
    
    // 라운드 페널티 (토론이 길어질수록 신뢰도 감소)
    const roundPenalty = Math.min(0.3, deliberation.totalRounds * 0.05);
    
    // 만장일치 보너스
    const unanimityBonus = unanimous ? 0.2 : 0;
    
    // 수렴률 보너스
    const convergenceBonus = deliberation.convergenceRate * 0.1;
    
    return Math.max(0.1, Math.min(1.0, 
      avgConfidence - roundPenalty + unanimityBonus + convergenceBonus
    ));
  }
  
  private calculateMetrics(
    deliberation: JuryDeliberation, 
    unanimous: boolean
  ): ConsensusMetrics {
    const stats = deliberation.getStatistics();
    const finalJurors = deliberation.finalJurors || deliberation.initialJurors;
    
    // 심의 품질 계산
    const discussionDepth = Math.min(1, stats.totalDiscussions / 30); // 30개 토론을 기준
    const questionQuality = Math.min(1, stats.totalQuestions / 10);   // 10개 질문을 기준
    const challengeQuality = Math.min(1, stats.totalChallenges / 5);  // 5개 도전을 기준
    
    const deliberationQuality = (discussionDepth + questionQuality + challengeQuality) / 3;
    
    return {
      unanimityAchieved: unanimous,
      convergenceRate: deliberation.convergenceRate,
      averageConfidence: stats.averageFinalConfidence,
      deliberationQuality,
      roundsToConsensus: unanimous ? deliberation.totalRounds : -1
    };
  }
  
  private synthesizeUnanimousReasoning(
    deliberation: JuryDeliberation, 
    finalJurors: JurorOpinion[]
  ): string {
    const position = finalJurors[0].currentPosition;
    const keyArguments = this.extractKeyArguments(finalJurors);
    const stats = deliberation.getStatistics();
    
    return `
배심원단 만장일치 결정: ${position} 주장

합의 과정:
- ${deliberation.totalRounds}라운드의 심도 있는 토론
- ${stats.totalDiscussions}회의 의견 교환
- ${stats.totalQuestions}개의 질의응답
- ${stats.totalChallenges}회의 논리적 도전

핵심 합의 사항:
${keyArguments.map(arg => `• ${arg}`).join('\n')}

최종 신뢰도: ${(stats.averageFinalConfidence * 100).toFixed(1)}%

배심원단은 충분한 논의를 거쳐 ${position} 주장이 논리적으로 더 타당하다는 결론에 도달했습니다.
    `.trim();
  }
  
  private synthesizeDividedReasoning(
    deliberation: JuryDeliberation,
    finalJurors: JurorOpinion[]
  ): string {
    const votingResult = this.getVotingDistribution(finalJurors);
    const majorityPosition = this.determineMajorityDecision(finalJurors);
    const stats = deliberation.getStatistics();
    
    return `
배심원단 다수결 결정: ${majorityPosition === Choice.UNDECIDED ? '결정 불가' : `${majorityPosition}`}

투표 결과:
- A 주장: ${votingResult.A}표
- B 주장: ${votingResult.B}표  
- 미결정: ${votingResult.UNDECIDED}표

심의 과정:
- ${deliberation.totalRounds}라운드 토론
- ${stats.totalDiscussions}회 의견 교환
- 만장일치 도달 실패

의견 불일치 사유:
${this.extractDisagreementReasons(finalJurors).map(r => `• ${r}`).join('\n')}

${majorityPosition !== Choice.UNDECIDED 
  ? `다수 의견에 따라 ${majorityPosition} 주장을 선택하나, 완전한 합의는 이루어지지 않았습니다.`
  : '배심원단이 명확한 결론에 도달하지 못했습니다.'}
    `.trim();
  }
  
  private extractDissentingOpinions(jurors: JurorOpinion[]): DissentingOpinion[] {
    const majority = this.determineMajorityPosition(jurors);
    
    return jurors
      .filter(j => j.currentPosition !== majority)
      .map(j => ({
        jurorId: j.jurorId,
        jurorName: j.jurorName,
        position: j.currentPosition,
        reasoning: j.reasoning
      }));
  }
  
  private determineMajorityDecision(jurors: JurorOpinion[]): Choice {
    const voteCounts = this.getVotingDistribution(jurors);
    
    if (voteCounts.A > voteCounts.B && voteCounts.A >= 2) {
      return Choice.ARGUMENT_A;
    }
    if (voteCounts.B > voteCounts.A && voteCounts.B >= 2) {
      return Choice.ARGUMENT_B;
    }
    
    // 동점이거나 과반 미달
    if (voteCounts.A === voteCounts.B && voteCounts.A > 0) {
      // 신뢰도로 결정
      const confidenceA = jurors
        .filter(j => j.currentPosition === 'A')
        .reduce((sum, j) => sum + j.confidenceLevel, 0);
      const confidenceB = jurors
        .filter(j => j.currentPosition === 'B')
        .reduce((sum, j) => sum + j.confidenceLevel, 0);
        
      if (confidenceA > confidenceB) return Choice.ARGUMENT_A;
      if (confidenceB > confidenceA) return Choice.ARGUMENT_B;
    }
    
    return Choice.UNDECIDED;
  }
  
  private determineMajorityPosition(jurors: JurorOpinion[]): string {
    const voteCounts = this.getVotingDistribution(jurors);
    
    if (voteCounts.A > voteCounts.B) return 'A';
    if (voteCounts.B > voteCounts.A) return 'B';
    return 'UNDECIDED';
  }
  
  private getVotingDistribution(jurors: JurorOpinion[]): {
    A: number;
    B: number;
    UNDECIDED: number;
  } {
    const distribution = {
      A: 0,
      B: 0,
      UNDECIDED: 0
    };
    
    jurors.forEach(j => {
      if (j.currentPosition === 'A') distribution.A++;
      else if (j.currentPosition === 'B') distribution.B++;
      else distribution.UNDECIDED++;
    });
    
    return distribution;
  }
  
  private extractKeyArguments(jurors: JurorOpinion[]): string[] {
    const allArguments = jurors.flatMap(j => j.keyArguments);
    
    // 중복 제거 및 상위 5개 선택
    const uniqueArguments = [...new Set(allArguments)];
    return uniqueArguments.slice(0, 5);
  }
  
  private extractDisagreementReasons(jurors: JurorOpinion[]): string[] {
    const reasons: string[] = [];
    
    const positions = new Set(jurors.map(j => j.currentPosition));
    if (positions.size > 1) {
      reasons.push('배심원 간 근본적인 해석 차이');
    }
    
    const confidenceRange = Math.max(...jurors.map(j => j.confidenceLevel)) - 
                           Math.min(...jurors.map(j => j.confidenceLevel));
    if (confidenceRange > 0.5) {
      reasons.push('증거 평가에 대한 신뢰도 격차');
    }
    
    const concerns = jurors.flatMap(j => j.concerns);
    if (concerns.length > 5) {
      reasons.push('해결되지 않은 다수의 우려사항');
    }
    
    if (jurors.some(j => j.currentPosition === 'UNDECIDED')) {
      reasons.push('일부 배심원의 판단 보류');
    }
    
    return reasons.length > 0 ? reasons : ['복잡한 논점에 대한 다양한 해석'];
  }
}