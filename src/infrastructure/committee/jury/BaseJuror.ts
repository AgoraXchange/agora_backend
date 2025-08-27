import { injectable } from 'inversify';
import { IJuror } from '../../../domain/services/IJuryService';
import { InvestigationReport } from '../../../domain/entities/InvestigationReport';
import { JurorOpinion, JurorId, EvaluationCriteria } from '../../../domain/entities/JurorOpinion';
import { JuryDiscussion, ArgumentType } from '../../../domain/entities/JuryDiscussion';
import { DeliberationRound } from '../../../domain/entities/DeliberationRound';
import { logger } from '../../logging/Logger';

export interface JurorPersonality {
  analyticalDepth: number;      // 분석 깊이 (0-1)
  stubbornness: number;          // 고집 강도 (0-1)
  openToPersuasion: number;      // 설득 수용도 (0-1)
  criticalThinking: number;      // 비판적 사고 (0-1)
  empathy: number;              // 공감 능력 (0-1)
  assertiveness: number;        // 주장 강도 (0-1)
}

export interface EvaluationFocus {
  logicalRigor: number;         // 논리적 엄격성 가중치
  evidenceWeight: number;       // 증거 중요도 가중치
  contextualRelevance: number;  // 맥락적 관련성 가중치
  practicalViability: number;   // 실용적 타당성 가중치
}

@injectable()
export abstract class BaseJuror implements IJuror {
  abstract readonly jurorId: JurorId;
  abstract readonly jurorName: string;
  abstract readonly personality: JurorPersonality;
  abstract readonly evaluationFocus: EvaluationFocus;
  
  protected discussionCount: number = 0;
  protected persuasionAttempts: number = 0;

  async evaluateReport(report: InvestigationReport): Promise<JurorOpinion> {
    logger.info(`${this.jurorName} evaluating investigation report`, {
      reportId: report.id,
      contractId: report.contractId
    });

    try {
      // 각 주장 평가
      const evaluationA = this.evaluateArgument(report.argumentAAnalysis);
      const evaluationB = this.evaluateArgument(report.argumentBAnalysis);
      
      // 어느 쪽이 더 강한지 판단
      const scoreA = this.calculateWeightedScore(evaluationA);
      const scoreB = this.calculateWeightedScore(evaluationB);
      
      let position: 'A' | 'B' | 'UNDECIDED';
      let confidence: number;
      
      const scoreDiff = Math.abs(scoreA - scoreB);
      
      if (scoreDiff < 0.1) {
        position = 'UNDECIDED';
        confidence = 0.3;
      } else {
        position = scoreA > scoreB ? 'A' : 'B';
        confidence = Math.min(0.95, 0.5 + scoreDiff);
      }
      
      // 추론 생성
      const reasoning = await this.generateReasoning(
        report, 
        position, 
        evaluationA, 
        evaluationB
      );
      
      // 핵심 논거 추출
      const keyArguments = this.extractKeyArguments(report, position);
      
      // 우려사항 식별
      const concerns = this.identifyConcerns(report, position);
      
      // 다른 배심원에 대한 질문 생성
      const questions = this.generateQuestions(report);
      
      // 평가 기준 평균
      const avgCriteria: EvaluationCriteria = position === 'UNDECIDED' 
        ? this.averageCriteria(evaluationA, evaluationB)
        : (position === 'A' ? evaluationA : evaluationB);

      const opinion = new JurorOpinion(
        this.jurorId,
        this.jurorName,
        position,
        reasoning,
        confidence,
        avgCriteria,
        confidence < 0.8, // 신뢰도가 낮으면 변경 가능
        keyArguments,
        concerns,
        questions,
        this.personality.stubbornness
      );

      logger.debug(`${this.jurorName} initial opinion formed`, {
        position,
        confidence,
        willingToChange: opinion.willingToChange
      });

      return opinion;

    } catch (error) {
      logger.error(`${this.jurorName} evaluation failed`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // 실패 시 기본 의견
      return new JurorOpinion(
        this.jurorId,
        this.jurorName,
        'UNDECIDED',
        '평가 중 오류 발생',
        0.1,
        { premiseValidity: 0.5, logicalCoherence: 0.5, evidenceStrength: 0.5, probabilityScore: 0.5 },
        true,
        [],
        ['평가 실패'],
        [],
        0.5
      );
    }
  }

  async respondToOpinion(
    otherOpinion: JurorOpinion,
    myCurrentOpinion: JurorOpinion
  ): Promise<JuryDiscussion> {
    this.discussionCount++;
    
    const discussionId = `discussion_${this.jurorId}_${Date.now()}`;
    let argumentType: ArgumentType;
    let statement: string;
    let emotionalTone: 'neutral' | 'assertive' | 'questioning' | 'conciliatory';
    
    // 의견 일치 여부 확인
    const agree = otherOpinion.currentPosition === myCurrentOpinion.currentPosition;
    
    if (agree) {
      // 동의하는 경우
      argumentType = 'support';
      emotionalTone = 'conciliatory';
      statement = await this.generateSupportStatement(otherOpinion, myCurrentOpinion);
    } else if (myCurrentOpinion.currentPosition === 'UNDECIDED') {
      // 아직 결정하지 못한 경우
      argumentType = 'question';
      emotionalTone = 'questioning';
      statement = await this.generateClarificationQuestion(otherOpinion);
    } else {
      // 반대하는 경우
      if (myCurrentOpinion.confidenceLevel > otherOpinion.confidenceLevel) {
        argumentType = 'challenge';
        emotionalTone = 'assertive';
        statement = await this.generateChallengeStatement(otherOpinion, myCurrentOpinion);
      } else {
        argumentType = 'question';
        emotionalTone = 'questioning';
        statement = await this.generateQuestionStatement(otherOpinion, myCurrentOpinion);
      }
    }
    
    return new JuryDiscussion(
      discussionId,
      this.jurorId,
      this.jurorName,
      statement,
      otherOpinion.jurorId,
      argumentType,
      undefined,
      emotionalTone,
      agree ? 0.2 : 0.6
    );
  }

  async considerPersuasion(
    argument: JuryDiscussion,
    myCurrentOpinion: JurorOpinion
  ): Promise<{
    changed: boolean;
    newOpinion?: JurorOpinion;
    response: JuryDiscussion;
  }> {
    this.persuasionAttempts++;
    
    // 설득 저항 계산
    const resistanceThreshold = myCurrentOpinion.persuasionResistance + 
                               (this.personality.stubbornness * 0.3);
    
    // 설득력 평가
    const persuasionPower = argument.persuasionIntent * 
                          (1 - this.personality.stubbornness) * 
                          this.personality.openToPersuasion;
    
    const changed = persuasionPower > resistanceThreshold && 
                   myCurrentOpinion.willingToChange;
    
    let response: JuryDiscussion;
    let newOpinion: JurorOpinion | undefined;
    
    if (changed) {
      // 의견 변경
      const newPosition = this.determineNewPosition(argument, myCurrentOpinion);
      const newConfidence = myCurrentOpinion.confidenceLevel * 0.7; // 변경 후 신뢰도 감소
      
      newOpinion = new JurorOpinion(
        this.jurorId,
        this.jurorName,
        newPosition,
        `${argument.speakerName}의 논점을 수용하여 입장 변경`,
        newConfidence,
        myCurrentOpinion.evaluationCriteria,
        newConfidence < 0.7,
        [`${argument.speakerName}의 주장 수용`],
        myCurrentOpinion.concerns,
        [],
        Math.min(1, myCurrentOpinion.persuasionResistance + 0.2)
      );
      
      response = new JuryDiscussion(
        `response_${this.jurorId}_${Date.now()}`,
        this.jurorId,
        this.jurorName,
        `설득력 있는 논거입니다. 제 입장을 재고하겠습니다.`,
        argument.speakerId,
        'concession',
        undefined,
        'conciliatory',
        0.1
      );
    } else {
      // 의견 유지
      response = new JuryDiscussion(
        `response_${this.jurorId}_${Date.now()}`,
        this.jurorId,
        this.jurorName,
        await this.generateResistanceStatement(argument, myCurrentOpinion),
        argument.speakerId,
        'response',
        undefined,
        'assertive',
        0.7
      );
    }
    
    return { changed, newOpinion, response };
  }

  async answerQuestion(
    question: JuryDiscussion,
    myCurrentOpinion: JurorOpinion
  ): Promise<JuryDiscussion> {
    const answer = await this.generateAnswer(question, myCurrentOpinion);
    
    return new JuryDiscussion(
      `answer_${this.jurorId}_${Date.now()}`,
      this.jurorId,
      this.jurorName,
      answer,
      question.speakerId,
      'response',
      question.referencePoint,
      'neutral',
      0.3
    );
  }

  async makeFinalStatement(
    currentOpinion: JurorOpinion,
    deliberationHistory: DeliberationRound[]
  ): Promise<string> {
    const totalRounds = deliberationHistory.length;
    const positionChanges = this.countPositionChanges(deliberationHistory);
    
    return `
    ${this.jurorName}의 최종 입장:
    
    결정: ${currentOpinion.currentPosition === 'UNDECIDED' 
      ? '결정 불가' 
      : `${currentOpinion.currentPosition} 주장 지지`}
    신뢰도: ${(currentOpinion.confidenceLevel * 100).toFixed(0)}%
    
    심의 과정:
    - 총 ${totalRounds}라운드 참여
    - ${positionChanges}회 입장 변경
    - ${this.discussionCount}회 발언
    
    최종 근거:
    ${currentOpinion.keyArguments.map(arg => `- ${arg}`).join('\n')}
    
    ${currentOpinion.reasoning}
    `;
  }

  // === 추상 메서드 (서브클래스에서 구현) ===
  
  protected abstract evaluateArgument(analysis: any): EvaluationCriteria;
  protected abstract generateReasoning(
    report: InvestigationReport,
    position: 'A' | 'B' | 'UNDECIDED',
    evaluationA: EvaluationCriteria,
    evaluationB: EvaluationCriteria
  ): Promise<string>;
  protected abstract generateSupportStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string>;
  protected abstract generateChallengeStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string>;
  protected abstract generateQuestionStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string>;
  protected abstract generateClarificationQuestion(other: JurorOpinion): Promise<string>;
  protected abstract generateResistanceStatement(
    argument: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string>;
  protected abstract generateAnswer(
    question: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string>;
  
  // === 유틸리티 메서드 ===
  
  protected calculateWeightedScore(criteria: EvaluationCriteria): number {
    const focus = this.evaluationFocus;
    return (
      criteria.premiseValidity * focus.logicalRigor +
      criteria.evidenceStrength * focus.evidenceWeight +
      criteria.logicalCoherence * focus.contextualRelevance +
      criteria.probabilityScore * focus.practicalViability
    ) / (focus.logicalRigor + focus.evidenceWeight + 
         focus.contextualRelevance + focus.practicalViability);
  }
  
  protected averageCriteria(a: EvaluationCriteria, b: EvaluationCriteria): EvaluationCriteria {
    return {
      premiseValidity: (a.premiseValidity + b.premiseValidity) / 2,
      logicalCoherence: (a.logicalCoherence + b.logicalCoherence) / 2,
      evidenceStrength: (a.evidenceStrength + b.evidenceStrength) / 2,
      probabilityScore: (a.probabilityScore + b.probabilityScore) / 2
    };
  }
  
  protected extractKeyArguments(report: InvestigationReport, position: 'A' | 'B' | 'UNDECIDED'): string[] {
    if (position === 'UNDECIDED') {
      return ['양측 논거가 균형적', '추가 정보 필요'];
    }
    
    const analysis = position === 'A' ? report.argumentAAnalysis : report.argumentBAnalysis;
    return [
      ...analysis.keyInsights.slice(0, 2),
      `증거 ${analysis.evidenceExtracted.length}개 확인`
    ];
  }
  
  protected identifyConcerns(report: InvestigationReport, position: 'A' | 'B' | 'UNDECIDED'): string[] {
    const concerns: string[] = [];
    
    if (position !== 'UNDECIDED') {
      const analysis = position === 'A' ? report.argumentAAnalysis : report.argumentBAnalysis;
      concerns.push(...analysis.weaknesses.slice(0, 2));
    } else {
      concerns.push('명확한 우위 판단 불가', '추가 증거 필요');
    }
    
    return concerns;
  }
  
  protected generateQuestions(report: InvestigationReport): string[] {
    return [
      `${report.argumentAAnalysis.weaknesses[0]}에 대한 해결책은?`,
      `${report.argumentBAnalysis.counterArguments[0]}를 어떻게 반박할 것인가?`
    ];
  }
  
  protected determineNewPosition(
    argument: JuryDiscussion,
    current: JurorOpinion
  ): 'A' | 'B' | 'UNDECIDED' {
    // 간단한 로직: 상대방 입장으로 변경
    if (current.currentPosition === 'UNDECIDED') {
      return Math.random() > 0.5 ? 'A' : 'B';
    }
    return current.currentPosition === 'A' ? 'B' : 'A';
  }
  
  protected countPositionChanges(history: DeliberationRound[]): number {
    let changes = 0;
    let previousPosition: string | undefined;
    
    history.forEach(round => {
      const myState = round.jurorsState.find(j => j.jurorId === this.jurorId);
      if (myState && previousPosition && myState.currentPosition !== previousPosition) {
        changes++;
      }
      previousPosition = myState?.currentPosition;
    });
    
    return changes;
  }
}