import { InvestigationReport } from '../entities/InvestigationReport';
import { JurorOpinion, JurorId } from '../entities/JurorOpinion';
import { JuryDeliberation } from '../entities/JuryDeliberation';
import { JuryDiscussion } from '../entities/JuryDiscussion';
import { DeliberationRound } from '../entities/DeliberationRound';

export interface DeliberationConfig {
  maxRounds: number;
  unanimityRequired: boolean;
  minConfidenceThreshold: number;
  enablePersuasion: boolean;
  discussionDepth: 'shallow' | 'medium' | 'deep';
}

export interface IJuryService {
  /**
   * 배심원단 심의 진행
   */
  deliberate(
    report: InvestigationReport,
    config: DeliberationConfig
  ): Promise<JuryDeliberation>;
  
  /**
   * 라운드별 토론 진행
   */
  conductDiscussion(
    currentOpinions: JurorOpinion[],
    roundNumber: number,
    previousDiscussions?: JuryDiscussion[]
  ): Promise<JuryDiscussion[]>;
  
  /**
   * 만장일치 확인
   */
  checkUnanimity(opinions: JurorOpinion[]): boolean;
  
  /**
   * 투표 진행
   */
  conductVoting(opinions: JurorOpinion[]): {
    voteA: JurorId[];
    voteB: JurorId[];
    abstain: JurorId[];
  };
}

export interface IJuror {
  /**
   * 배심원 ID
   */
  readonly jurorId: JurorId;
  
  /**
   * 배심원 이름
   */
  readonly jurorName: string;
  
  /**
   * 조사 보고서 평가
   */
  evaluateReport(report: InvestigationReport): Promise<JurorOpinion>;
  
  /**
   * 다른 배심원의 의견 듣고 반응
   */
  respondToOpinion(
    otherOpinion: JurorOpinion,
    myCurrentOpinion: JurorOpinion
  ): Promise<JuryDiscussion>;
  
  /**
   * 설득 시도에 대한 반응
   */
  considerPersuasion(
    argument: JuryDiscussion,
    myCurrentOpinion: JurorOpinion
  ): Promise<{
    changed: boolean;
    newOpinion?: JurorOpinion;
    response: JuryDiscussion;
  }>;
  
  /**
   * 질문에 대한 답변
   */
  answerQuestion(
    question: JuryDiscussion,
    myCurrentOpinion: JurorOpinion
  ): Promise<JuryDiscussion>;
  
  /**
   * 최종 입장 표명
   */
  makeFinalStatement(
    currentOpinion: JurorOpinion,
    deliberationHistory: DeliberationRound[]
  ): Promise<string>;
}