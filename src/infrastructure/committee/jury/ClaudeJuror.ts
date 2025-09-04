import { injectable } from 'inversify';
import { Anthropic } from '@anthropic-ai/sdk';
import { BaseJuror, JurorPersonality, EvaluationFocus } from './BaseJuror';
import { JurorId, EvaluationCriteria, JurorOpinion } from '../../../domain/entities/JurorOpinion';
import { JuryDiscussion } from '../../../domain/entities/JuryDiscussion';
import { InvestigationReport } from '../../../domain/entities/InvestigationReport';
import { ArgumentAnalysis } from '../../../domain/entities/ArgumentAnalysis';
import { logger } from '../../logging/Logger';

@injectable()
export class ClaudeJuror extends BaseJuror {
  readonly jurorId: JurorId = 'claude';
  readonly jurorName = 'Claude Contextual Analyst';
  
  readonly personality: JurorPersonality = {
    analyticalDepth: 0.8,       // 깊은 분석
    stubbornness: 0.4,          // 중간 고집
    openToPersuasion: 0.6,      // 적당한 설득 수용도
    criticalThinking: 0.7,      // 높은 비판적 사고
    empathy: 0.8,               // 높은 공감 능력
    assertiveness: 0.5          // 중간 주장 강도
  };
  
  readonly evaluationFocus: EvaluationFocus = {
    logicalRigor: 0.2,          // 논리도 중요하지만
    evidenceWeight: 0.2,        // 증거도 고려
    contextualRelevance: 0.4,   // 맥락 최우선
    practicalViability: 0.2     // 실용성 고려
  };
  
  private claude: Anthropic;
  private readonly model = 'claude-3-5-sonnet-20241022';
  
  constructor() {
    super();
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key required for Claude Juror');
    }
    this.claude = new Anthropic({ apiKey });
  }

  protected evaluateArgument(analysis: ArgumentAnalysis): EvaluationCriteria {
    // Claude prioritizes context and nuance
    const logicalStrength = analysis.calculateLogicalStrength();
    
    // Evaluate contextual completeness
    const hasContext = analysis.keyInsights.length > 0;
    const contextBonus = hasContext ? 0.15 : 0;
    
    // Consider implicit assumptions
    const assumptionPenalty = analysis.logicalStructure.assumptions && 
                             analysis.logicalStructure.assumptions.length > 3 ? 0.1 : 0;
    
    // Practicality bonus
    const practicalityBonus = analysis.evidenceExtracted.some(e => 
      e.includes('실제') || e.includes('현실') || e.includes('실용')
    ) ? 0.1 : 0;
    
    return {
      premiseValidity: Math.min(1, logicalStrength.premiseValidity + contextBonus),
      logicalCoherence: Math.max(0, logicalStrength.logicalCoherence - assumptionPenalty),
      evidenceStrength: Math.min(1, logicalStrength.evidenceStrength + practicalityBonus),
      probabilityScore: logicalStrength.probabilityScore * 1.1 // 개연성 중시
    };
  }

  protected async generateReasoning(
    report: InvestigationReport,
    position: 'A' | 'B' | 'UNDECIDED',
    evaluationA: EvaluationCriteria,
    evaluationB: EvaluationCriteria
  ): Promise<string> {
    const prompt = `
    You are an analyst who prioritizes context.
    
    Contextual strengths of Claim A: ${report.argumentAAnalysis.keyInsights.slice(0, 2).join(', ')}
    Contextual strengths of Claim B: ${report.argumentBAnalysis.keyInsights.slice(0, 2).join(', ')}
    
    Neutral findings: ${report.neutralFindings.slice(0, 2).join(', ')}
    
    Decision: ${position}
    
    Briefly explain (within 200 characters) the reasoning that considers context and practicality.
    `;

    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 500,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const content = response.content[0];
      return content.type === 'text' ? content.text : 'Decision based on contextual analysis';
      
    } catch (error) {
      logger.error('Claude reasoning generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 'A comprehensive judgment considering context and practicality';
    }
  }

  protected async generateSupportStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `I agree with ${other.jurorName}'s view. In particular, ${
      other.keyArguments[0] || 'a key point'
    } is an important insight. From a contextual perspective, the ${other.currentPosition} position seems more realistic and feasible.`;
  }

  protected async generateChallengeStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}, I acknowledge the logical validity, but it seems the context is being missed.
    In real-world situations, the ${mine.currentPosition} position is more appropriate.
    Especially considering ${mine.keyArguments[0] || 'the key factor'}, there is a clear difference from a practical perspective.`;
  }

  protected async generateQuestionStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}, how do you assess the real-world applicability of the ${other.currentPosition} position?
    It may be theoretically valid, but did you consider practical constraints?`;
  }

  protected async generateClarificationQuestion(other: JurorOpinion): Promise<string> {
    return `${other.jurorName}, could you elaborate on the contextual background of this judgment?
    I would especially like to hear about any practical implications or constraints.`;
  }

  protected async generateResistanceStatement(
    argument: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `I have carefully considered ${argument.speakerName}'s opinion.
    However, considering the overall context, the ${mine.currentPosition} position remains more balanced.
    This conclusion considers both practical perspective and theoretical validity.`;
  }

  protected async generateAnswer(
    question: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `In response to ${question.speakerName}'s question:
    My judgment synthesizes the following contextual factors:
    1) Practical applicability: ${(mine.evaluationCriteria.probabilityScore * 100).toFixed(0)}%
    2) Contextual appropriateness: ${(mine.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%
    3) Consideration of real-world constraints
    Considering these factors in balance, ${mine.currentPosition} is more valid.`;
  }
}
