import { injectable } from 'inversify';
import { BaseJuror, JurorPersonality, EvaluationFocus } from './BaseJuror';
import { JurorId, EvaluationCriteria, JurorOpinion } from '../../../domain/entities/JurorOpinion';
import { JuryDiscussion } from '../../../domain/entities/JuryDiscussion';
import { InvestigationReport } from '../../../domain/entities/InvestigationReport';
import { ArgumentAnalysis } from '../../../domain/entities/ArgumentAnalysis';
import { OpenAI } from 'openai';
import { logger } from '../../logging/Logger';

@injectable()
export class GPT5Juror extends BaseJuror {
  readonly jurorId: JurorId = 'gpt5';
  readonly jurorName = 'GPT-5 논리분석관';
  
  readonly personality: JurorPersonality = {
    analyticalDepth: 0.95,      // 매우 깊은 분석
    stubbornness: 0.7,          // 높은 고집
    openToPersuasion: 0.3,      // 낮은 설득 수용도
    criticalThinking: 0.9,      // 매우 높은 비판적 사고
    empathy: 0.4,               // 낮은 공감
    assertiveness: 0.8          // 높은 주장 강도
  };
  
  readonly evaluationFocus: EvaluationFocus = {
    logicalRigor: 0.4,          // 논리적 엄격성 최우선
    evidenceWeight: 0.3,        // 증거 중시
    contextualRelevance: 0.2,   // 맥락 고려
    practicalViability: 0.1     // 실용성은 낮게
  };
  
  private openai: OpenAI;
  private readonly model = 'gpt-5-2025-08-07';
  
  constructor() {
    super();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key required for GPT-5 Juror');
    }
    this.openai = new OpenAI({ apiKey });
  }

  protected evaluateArgument(analysis: ArgumentAnalysis): EvaluationCriteria {
    // GPT-5는 논리적 오류에 매우 엄격
    const logicalStrength = analysis.calculateLogicalStrength();
    
    // 논리적 오류 패널티 적용
    const hasLogicalFallacies = analysis.weaknesses.some(w => 
      w.includes('논리') || w.includes('모순') || w.includes('오류')
    );
    const fallacyPenalty = hasLogicalFallacies ? 0.3 : 0;
    
    // 전제 검증 강화
    const premiseScore = Math.max(0, logicalStrength.premiseValidity - fallacyPenalty);
    
    // 형식 논리 중시
    const formalLogicBonus = analysis.logicalStructure.reasoning.length >= 3 ? 0.1 : 0;
    
    return {
      premiseValidity: premiseScore,
      logicalCoherence: Math.min(1, logicalStrength.logicalCoherence + formalLogicBonus),
      evidenceStrength: logicalStrength.evidenceStrength * 0.9, // 증거도 중요하지만 논리가 우선
      probabilityScore: logicalStrength.probabilityScore * 0.8  // 개연성은 덜 중요
    };
  }

  protected async generateReasoning(
    report: InvestigationReport,
    position: 'A' | 'B' | 'UNDECIDED',
    evaluationA: EvaluationCriteria,
    evaluationB: EvaluationCriteria
  ): Promise<string> {
    const prompt = `
    당신은 엄격한 논리 분석가입니다.
    
    A 주장 평가:
    - 전제 타당성: ${evaluationA.premiseValidity}
    - 논리 일관성: ${evaluationA.logicalCoherence}
    - 증거 강도: ${evaluationA.evidenceStrength}
    
    B 주장 평가:
    - 전제 타당성: ${evaluationB.premiseValidity}
    - 논리 일관성: ${evaluationB.logicalCoherence}
    - 증거 강도: ${evaluationB.evidenceStrength}
    
    결정: ${position}
    
    논리적 근거를 200자 이내로 설명하시오. 형식 논리와 연역적 추론을 중시하시오.
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 1,
        max_completion_tokens: 500
      });
      
      return response.choices[0]?.message?.content || '논리적 분석 기반 판단';
    } catch (error) {
      logger.error('GPT-5 reasoning generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return '논리적 타당성 기준으로 평가';
    }
  }

  protected async generateSupportStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}의 분석에 동의합니다. 특히 전제 타당성 ${
      (other.evaluationCriteria.premiseValidity * 100).toFixed(0)
    }% 평가가 정확합니다. 논리적 일관성 측면에서도 타당한 결론입니다.`;
  }

  protected async generateChallengeStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    const weakPoint = other.evaluationCriteria.premiseValidity < 0.5 
      ? '전제의 타당성' 
      : other.evaluationCriteria.logicalCoherence < 0.5 
        ? '논리적 일관성' 
        : '증거의 신뢰성';
    
    return `${other.jurorName}의 판단에 이의를 제기합니다. ${weakPoint}이 불충분합니다. 
    제 분석으로는 ${mine.currentPosition} 주장이 논리적으로 ${
      (mine.confidenceLevel * 100).toFixed(0)
    }% 더 타당합니다. 형식 논리상 명백한 우위가 있습니다.`;
  }

  protected async generateQuestionStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}님, ${other.currentPosition} 주장의 논리적 비약은 어떻게 설명하시겠습니까? 
    전제에서 결론으로의 연역 과정이 불명확해 보입니다.`;
  }

  protected async generateClarificationQuestion(other: JurorOpinion): Promise<string> {
    return `${other.jurorName}님, 해당 주장의 필요충분조건을 명확히 해주시겠습니까? 
    논리적 함의 관계를 더 구체적으로 설명 부탁드립니다.`;
  }

  protected async generateResistanceStatement(
    argument: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${argument.speakerName}의 지적을 검토했으나, 논리적 오류가 있습니다. 
    제 분석의 형식 논리적 타당성은 변하지 않습니다. 
    ${mine.currentPosition} 주장의 연역적 우위가 여전히 명확합니다.`;
  }

  protected async generateAnswer(
    question: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${question.speakerName}의 질문에 답변드립니다. 
    제 판단의 논리적 근거는 다음과 같습니다:
    1. 전제 타당성: ${(mine.evaluationCriteria.premiseValidity * 100).toFixed(0)}%
    2. 논리 일관성: ${(mine.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%
    3. 형식 논리상 모순이 없음
    따라서 ${mine.currentPosition} 주장이 타당합니다.`;
  }
}