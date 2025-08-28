import { JurorOpinion } from './JurorOpinion';
import { DeliberationRound } from './DeliberationRound';
import { Choice } from './DebateContract';

export interface DeliberationStatistics {
  totalRounds: number;
  totalDiscussions: number;
  totalChallenges: number;
  totalQuestions: number;
  totalConcessions: number;
  averageFinalConfidence: number;
  unanimityAchieved: boolean;
  deliberationTimeMs: number;
}

export class JuryDeliberation {
  constructor(
    public readonly id: string,
    public readonly contractId: string,
    public readonly investigationReportId: string,
    public readonly initialJurors: JurorOpinion[],      // 초기 배심원 의견
    public readonly unanimousDecision: boolean,
    public readonly deliberationRounds: DeliberationRound[] = [],
    public finalVerdict?: Choice,
    public readonly finalJurors?: JurorOpinion[],       // 최종 배심원 의견
    public readonly deliberationTimeMs: number = 0,
    public readonly createdAt: Date = new Date()
  ) {
    this.validateDeliberation();
  }

  private validateDeliberation(): void {
    if (this.initialJurors.length !== 3) {
      throw new Error('Exactly 3 jurors are required');
    }

    if (this.unanimousDecision && !this.finalVerdict) {
      throw new Error('Unanimous decision requires a final verdict');
    }

    if (this.finalVerdict && 
        this.finalVerdict !== Choice.ARGUMENT_A &&
        this.finalVerdict !== Choice.ARGUMENT_B &&
        this.finalVerdict !== Choice.UNDECIDED) {
      throw new Error('Invalid final verdict');
    }
  }

  get totalRounds(): number {
    return this.deliberationRounds.length;
  }

  get wasSuccessful(): boolean {
    return this.unanimousDecision && 
           this.finalVerdict !== undefined &&
           this.finalVerdict !== Choice.UNDECIDED;
  }

  get convergenceRate(): number {
    // 수렴률: 라운드가 진행될수록 의견이 얼마나 모이는지
    if (this.deliberationRounds.length === 0) return 0;

    const firstRound = this.deliberationRounds[0];
    const lastRound = this.deliberationRounds[this.deliberationRounds.length - 1];
    
    const initialMargin = firstRound.voteMargin;
    const finalMargin = lastRound.voteMargin;
    
    if (initialMargin === 0) return finalMargin === 3 ? 1 : 0;
    return Math.min(1, finalMargin / 3);
  }

  getStatistics(): DeliberationStatistics {
    let totalDiscussions = 0;
    let totalChallenges = 0;
    let totalQuestions = 0;
    let totalConcessions = 0;

    this.deliberationRounds.forEach(round => {
      const metrics = round.getMetrics();
      totalDiscussions += metrics.totalStatements;
      totalChallenges += metrics.challenges;
      totalQuestions += metrics.questions;
      totalConcessions += metrics.concessions;
    });

    const finalJurors = this.finalJurors || this.initialJurors;
    const totalConfidence = finalJurors.reduce(
      (sum, juror) => sum + juror.confidenceLevel, 0
    );
    const averageFinalConfidence = totalConfidence / finalJurors.length;

    return {
      totalRounds: this.totalRounds,
      totalDiscussions,
      totalChallenges,
      totalQuestions,
      totalConcessions,
      averageFinalConfidence,
      unanimityAchieved: this.unanimousDecision,
      deliberationTimeMs: this.deliberationTimeMs
    };
  }

  getDeliberationPath(): string[] {
    // 각 라운드의 투표 변화 추적
    return this.deliberationRounds.map((round, index) => {
      const voteStr = `A:${round.votingResult.voteA.length} B:${round.votingResult.voteB.length}`;
      const unanimous = round.unanimous ? ' (만장일치!)' : '';
      return `라운드 ${index + 1}: ${voteStr}${unanimous}`;
    });
  }

  getFinalReport(): string {
    const stats = this.getStatistics();
    const verdictStr = this.finalVerdict 
      ? (this.finalVerdict === Choice.UNDECIDED ? '결정 불가' : `${this.finalVerdict}`)
      : '미결정';

    return `
    배심원단 심의 최종 보고서
    ==========================
    
    심의 ID: ${this.id}
    계약 ID: ${this.contractId}
    
    최종 판결: ${verdictStr}
    만장일치: ${this.unanimousDecision ? '달성' : '실패'}
    성공 여부: ${this.wasSuccessful ? '성공' : '실패'}
    
    심의 과정:
    - 총 라운드: ${stats.totalRounds}회
    - 총 토론: ${stats.totalDiscussions}회
    - 도전/반박: ${stats.totalChallenges}회
    - 질문: ${stats.totalQuestions}회
    - 양보: ${stats.totalConcessions}회
    
    투표 경로:
    ${this.getDeliberationPath().join('\n')}
    
    최종 신뢰도: ${(stats.averageFinalConfidence * 100).toFixed(1)}%
    수렴률: ${(this.convergenceRate * 100).toFixed(1)}%
    소요 시간: ${(stats.deliberationTimeMs / 1000).toFixed(1)}초
    
    ${this.finalJurors ? `
    최종 배심원 입장:
    ${this.finalJurors.map(j => 
      `- ${j.jurorName}: ${j.currentPosition} (신뢰도 ${(j.confidenceLevel * 100).toFixed(0)}%)`
    ).join('\n')}
    ` : ''}
    `;
  }

  toJSON(): object {
    return {
      id: this.id,
      contractId: this.contractId,
      investigationReportId: this.investigationReportId,
      initialJurors: this.initialJurors.map(j => j.toJSON()),
      deliberationRounds: this.deliberationRounds.map(r => r.toJSON()),
      finalVerdict: this.finalVerdict,
      unanimousDecision: this.unanimousDecision,
      finalJurors: this.finalJurors?.map(j => j.toJSON()),
      wasSuccessful: this.wasSuccessful,
      convergenceRate: this.convergenceRate,
      statistics: this.getStatistics(),
      deliberationPath: this.getDeliberationPath(),
      deliberationTimeMs: this.deliberationTimeMs,
      createdAt: this.createdAt
    };
  }
}