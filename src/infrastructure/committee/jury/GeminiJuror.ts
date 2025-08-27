import { injectable } from 'inversify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseJuror, JurorPersonality, EvaluationFocus } from './BaseJuror';
import { JurorId, EvaluationCriteria, JurorOpinion } from '../../../domain/entities/JurorOpinion';
import { JuryDiscussion } from '../../../domain/entities/JuryDiscussion';
import { InvestigationReport } from '../../../domain/entities/InvestigationReport';
import { ArgumentAnalysis } from '../../../domain/entities/ArgumentAnalysis';
import { logger } from '../../logging/Logger';

@injectable()
export class GeminiJuror extends BaseJuror {
  readonly jurorId: JurorId = 'gemini';
  readonly jurorName = 'Gemini 종합평가관';
  
  readonly personality: JurorPersonality = {
    analyticalDepth: 0.7,       // 적당한 분석 깊이
    stubbornness: 0.5,          // 중간 고집
    openToPersuasion: 0.5,      // 중간 설득 수용도
    criticalThinking: 0.8,      // 높은 비판적 사고
    empathy: 0.6,               // 중간 공감
    assertiveness: 0.6          // 중간 주장 강도
  };
  
  readonly evaluationFocus: EvaluationFocus = {
    logicalRigor: 0.25,         // 균형잡힌 평가
    evidenceWeight: 0.25,       
    contextualRelevance: 0.25,  
    practicalViability: 0.25    
  };
  
  private gemini: GoogleGenerativeAI;
  private readonly model = 'gemini-2.5-pro';
  
  constructor() {
    super();
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('Google AI API key required for Gemini Juror');
    }
    this.gemini = new GoogleGenerativeAI(apiKey);
  }

  protected evaluateArgument(analysis: ArgumentAnalysis): EvaluationCriteria {
    // Gemini는 다각도 종합 평가
    const logicalStrength = analysis.calculateLogicalStrength();
    
    // 균형잡힌 평가 - 극단값 회피
    const balanceAdjustment = (score: number): number => {
      if (score < 0.2) return score + 0.1;
      if (score > 0.8) return score - 0.1;
      return score;
    };
    
    // 다양성 보너스 - 여러 관점 고려
    const diversityBonus = 
      (analysis.keyInsights.length >= 3 ? 0.05 : 0) +
      (analysis.evidenceExtracted.length >= 3 ? 0.05 : 0) +
      (analysis.counterArguments.length >= 2 ? 0.05 : 0);
    
    // 극단적 약점 페널티
    const criticalWeakness = analysis.weaknesses.some(w => 
      w.includes('치명적') || w.includes('근본적') || w.includes('완전')
    ) ? 0.15 : 0;
    
    return {
      premiseValidity: balanceAdjustment(logicalStrength.premiseValidity + diversityBonus),
      logicalCoherence: balanceAdjustment(logicalStrength.logicalCoherence),
      evidenceStrength: Math.max(0, balanceAdjustment(logicalStrength.evidenceStrength) - criticalWeakness),
      probabilityScore: balanceAdjustment(logicalStrength.probabilityScore + diversityBonus)
    };
  }

  protected async generateReasoning(
    report: InvestigationReport,
    position: 'A' | 'B' | 'UNDECIDED',
    evaluationA: EvaluationCriteria,
    evaluationB: EvaluationCriteria
  ): Promise<string> {
    const prompt = `
    다각도 종합 평가 수행.
    
    A 주장 점수:
    - 논리: ${evaluationA.logicalCoherence}
    - 증거: ${evaluationA.evidenceStrength}
    - 개연성: ${evaluationA.probabilityScore}
    
    B 주장 점수:
    - 논리: ${evaluationB.logicalCoherence}
    - 증거: ${evaluationB.evidenceStrength}
    - 개연성: ${evaluationB.probabilityScore}
    
    결정: ${position}
    
    종합적 관점에서 판단 근거를 200자 이내로 설명.
    `;

    try {
      const model = this.gemini.getGenerativeModel({ model: this.model });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      });
      
      return result.response.text() || '종합적 평가 기반 판단';
      
    } catch (error) {
      logger.error('Gemini reasoning generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return '다각도 분석을 통한 균형잡힌 판단';
    }
  }

  protected async generateSupportStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}의 분석과 제 종합 평가가 일치합니다. 
    ${other.currentPosition} 주장이 논리(${(other.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%), 
    증거(${(other.evaluationCriteria.evidenceStrength * 100).toFixed(0)}%), 
    실용성 측면에서 모두 우위에 있습니다.`;
  }

  protected async generateChallengeStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    const alternativeView = mine.currentPosition === 'A' 
      ? 'B 주장의 장점도 고려해야 합니다'
      : 'A 주장의 강점을 과소평가하신 것 같습니다';
    
    return `${other.jurorName}님, 다른 관점도 고려해보셨나요? ${alternativeView}. 
    종합적으로 평가하면 ${mine.currentPosition} 주장이 ${(mine.confidenceLevel * 100).toFixed(0)}% 더 균형잡혀 있습니다. 
    다각도 분석이 필요합니다.`;
  }

  protected async generateQuestionStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}님, ${other.currentPosition} 주장의 다른 측면은 어떻게 평가하셨습니까? 
    제가 볼 때는 고려하지 않으신 요소들이 있는 것 같습니다. 종합적 검토가 필요해 보입니다.`;
  }

  protected async generateClarificationQuestion(other: JurorOpinion): Promise<string> {
    return `${other.jurorName}님, 평가 기준의 가중치를 어떻게 설정하셨는지 궁금합니다. 
    논리, 증거, 맥락, 실용성을 종합적으로 고려하셨는지요?`;
  }

  protected async generateResistanceStatement(
    argument: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${argument.speakerName}의 관점도 일리가 있습니다. 
    하지만 제가 수행한 다각도 분석 결과는 여전히 ${mine.currentPosition}를 지지합니다. 
    모든 요소를 균형있게 고려했을 때의 결론입니다.`;
  }

  protected async generateAnswer(
    question: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${question.speakerName}의 질문에 답변드립니다. 
    제 종합 평가는 다음과 같습니다:
    1. 논리적 측면: ${(mine.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%
    2. 증거적 측면: ${(mine.evaluationCriteria.evidenceStrength * 100).toFixed(0)}%
    3. 맥락적 측면: ${(mine.evaluationCriteria.premiseValidity * 100).toFixed(0)}%
    4. 실용적 측면: ${(mine.evaluationCriteria.probabilityScore * 100).toFixed(0)}%
    모든 측면을 균형있게 평가한 결과 ${mine.currentPosition}가 더 타당합니다.`;
  }
}