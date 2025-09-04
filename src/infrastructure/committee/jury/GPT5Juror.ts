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
  readonly jurorName = 'GPT-5 Logical Analyst';
  
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
    // GPT-5 is highly strict about logical fallacies
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
    You are a strict logical analyst.
    
    Evaluation of Claim A:
    - Premise validity: ${evaluationA.premiseValidity}
    - Logical coherence: ${evaluationA.logicalCoherence}
    - Evidence strength: ${evaluationA.evidenceStrength}
    
    Evaluation of Claim B:
    - Premise validity: ${evaluationB.premiseValidity}
    - Logical coherence: ${evaluationB.logicalCoherence}
    - Evidence strength: ${evaluationB.evidenceStrength}
    
    Decision: ${position}
    
    Briefly explain (within 200 characters) the logical rationale. Emphasize formal logic and deductive reasoning.
    `;

    try {
      const response = await (this.openai.chat.completions.create as any)({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 1,
        max_completion_tokens: 500
      } as any);
      
      return response.choices[0]?.message?.content || 'Decision based on logical analysis';
    } catch (error) {
      logger.error('GPT-5 reasoning generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 'Evaluation based on logical validity';
    }
  }

  protected async generateSupportStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `I agree with ${other.jurorName}'s analysis. In particular, the premise validity assessment of ${
      (other.evaluationCriteria.premiseValidity * 100).toFixed(0)
    }% is accurate. The conclusion is also sound in terms of logical coherence.`;
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
    
    return `I challenge ${other.jurorName}'s judgment. ${weakPoint} is insufficient.
    According to my analysis, the ${mine.currentPosition} position is ${
      (mine.confidenceLevel * 100).toFixed(0)
    }% more logically valid. There is a clear advantage in formal logic.`;
  }

  protected async generateQuestionStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}, how do you account for the logical leap in the ${other.currentPosition} position?
    The deduction from premises to conclusion appears unclear.`;
  }

  protected async generateClarificationQuestion(other: JurorOpinion): Promise<string> {
    return `${other.jurorName}, could you clarify the necessary and sufficient conditions for that claim?
    Please explain the logical implication relations more concretely.`;
  }

  protected async generateResistanceStatement(
    argument: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `I have reviewed ${argument.speakerName}'s point, but there are logical errors.
    The formal logical validity of my analysis remains unchanged.
    The deductive superiority of the ${mine.currentPosition} position is still clear.`;
  }

  protected async generateAnswer(
    question: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `In response to ${question.speakerName}'s question:
    The logical basis of my judgment is as follows:
    1) Premise validity: ${(mine.evaluationCriteria.premiseValidity * 100).toFixed(0)}%
    2) Logical coherence: ${(mine.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%
    3) No contradictions under formal logic
    Therefore, the ${mine.currentPosition} position is valid.`;
  }
}
