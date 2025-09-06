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
  readonly jurorName = 'Gemini Comprehensive Evaluator';
  
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
    // Gemini performs multi-angle comprehensive evaluation
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
    Perform a multi-faceted comprehensive evaluation.
    
    Scores for A:
    - Logic: ${evaluationA.logicalCoherence}
    - Evidence: ${evaluationA.evidenceStrength}
    - Plausibility: ${evaluationA.probabilityScore}
    
    Scores for B:
    - Logic: ${evaluationB.logicalCoherence}
    - Evidence: ${evaluationB.evidenceStrength}
    - Plausibility: ${evaluationB.probabilityScore}
    
    Decision: ${position}
    
    In 200 characters or fewer, explain the reasoning from a balanced, comprehensive perspective.
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
      
      return result.response.text() || 'Judgment based on comprehensive evaluation';
      
    } catch (error) {
      logger.error('Gemini reasoning generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  protected async generateSupportStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `My comprehensive evaluation aligns with ${other.jurorName}'s analysis. 
    The ${other.currentPosition} stance is superior across logic (${(other.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%), 
    evidence (${(other.evaluationCriteria.evidenceStrength * 100).toFixed(0)}%), 
    and practicality.`;
  }

  protected async generateChallengeStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    const alternativeView = mine.currentPosition === 'A' 
      ? 'We should also consider strengths of stance B'
      : 'It seems the strengths of stance A are being underestimated';
    
    return `${other.jurorName}, have you considered the alternative perspective? ${alternativeView}. 
    On a comprehensive evaluation, the ${mine.currentPosition} stance is ${(mine.confidenceLevel * 100).toFixed(0)}% more balanced. 
    A multi-perspective analysis is needed.`;
  }

  protected async generateQuestionStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}, how did you evaluate other aspects of the ${other.currentPosition} stance? 
    From my view, there seem to be factors not yet considered. A comprehensive review appears necessary.`;
  }

  protected async generateClarificationQuestion(other: JurorOpinion): Promise<string> {
    return `${other.jurorName}, how did you set the weights for your evaluation criteria? 
    Did you comprehensively consider logic, evidence, context, and practicality?`;
  }

  protected async generateResistanceStatement(
    argument: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${argument.speakerName}'s perspective has merit. 
    However, my multi-perspective analysis still supports ${mine.currentPosition}. 
    This is the conclusion after balancing all factors.`;
  }

  protected async generateAnswer(
    question: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `Answering ${question.speakerName}'s question. 
    My comprehensive evaluation is as follows:
    1) Logical aspect: ${(mine.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%
    2) Evidential aspect: ${(mine.evaluationCriteria.evidenceStrength * 100).toFixed(0)}%
    3) Contextual aspect: ${(mine.evaluationCriteria.premiseValidity * 100).toFixed(0)}%
    4) Practical aspect: ${(mine.evaluationCriteria.probabilityScore * 100).toFixed(0)}%
    Balancing all aspects, the ${mine.currentPosition} stance is more justified.`;
  }
}
