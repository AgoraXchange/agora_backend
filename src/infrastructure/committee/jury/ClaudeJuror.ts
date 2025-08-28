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
  readonly jurorName = 'Claude 맥락해석관';
  
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key required for Claude Juror');
    }
    this.claude = new Anthropic({ apiKey });
  }

  protected evaluateArgument(analysis: ArgumentAnalysis): EvaluationCriteria {
    // Claude는 맥락과 뉘앙스를 중시
    const logicalStrength = analysis.calculateLogicalStrength();
    
    // 맥락적 완성도 평가
    const hasContext = analysis.keyInsights.length > 0;
    const contextBonus = hasContext ? 0.15 : 0;
    
    // 암묵적 가정 고려
    const assumptionPenalty = analysis.logicalStructure.assumptions && 
                             analysis.logicalStructure.assumptions.length > 3 ? 0.1 : 0;
    
    // 실용적 관점 보너스
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
    당신은 맥락을 중시하는 분석가입니다.
    
    A 주장의 맥락적 강점: ${report.argumentAAnalysis.keyInsights.slice(0, 2).join(', ')}
    B 주장의 맥락적 강점: ${report.argumentBAnalysis.keyInsights.slice(0, 2).join(', ')}
    
    중립적 발견: ${report.neutralFindings.slice(0, 2).join(', ')}
    
    결정: ${position}
    
    맥락과 실용성을 고려한 판단 근거를 200자 이내로 설명하시오.
    `;

    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 500,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const content = response.content[0];
      return content.type === 'text' ? content.text : '맥락적 분석 기반 판단';
      
    } catch (error) {
      logger.error('Claude reasoning generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return '맥락과 실용성을 고려한 종합적 판단';
    }
  }

  protected async generateSupportStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}의 견해에 공감합니다. 특히 ${
      other.keyArguments[0] || '핵심 논점'
    }은 중요한 통찰입니다. 
    맥락적으로 볼 때 ${other.currentPosition} 주장이 더 현실적이고 실행 가능해 보입니다.`;
  }

  protected async generateChallengeStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}님, 논리적 타당성은 인정하지만 맥락을 놓치고 계신 것 같습니다. 
    실제 상황에서는 ${mine.currentPosition} 주장이 더 적절합니다. 
    특히 ${mine.keyArguments[0] || '핵심 요소'}를 고려하면 실용적 관점에서 명확한 차이가 있습니다.`;
  }

  protected async generateQuestionStatement(
    other: JurorOpinion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${other.jurorName}님, ${other.currentPosition} 주장의 실제 적용 가능성은 어떻게 보십니까? 
    이론적으로는 타당할 수 있지만, 현실적 제약을 고려하셨는지 궁금합니다.`;
  }

  protected async generateClarificationQuestion(other: JurorOpinion): Promise<string> {
    return `${other.jurorName}님, 해당 판단의 맥락적 배경을 더 자세히 설명해 주시겠습니까? 
    특히 실무적 함의나 현실적 제약 사항이 있다면 듣고 싶습니다.`;
  }

  protected async generateResistanceStatement(
    argument: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${argument.speakerName}의 의견을 경청했습니다. 
    하지만 전체적인 맥락을 고려할 때 여전히 ${mine.currentPosition} 주장이 더 균형 잡혀 있습니다. 
    실용적 관점과 이론적 타당성을 모두 고려한 결과입니다.`;
  }

  protected async generateAnswer(
    question: JuryDiscussion,
    mine: JurorOpinion
  ): Promise<string> {
    return `${question.speakerName}의 질문에 답변드립니다. 
    제 판단은 다음 맥락적 요소들을 종합한 것입니다:
    1. 실제 적용 가능성: ${(mine.evaluationCriteria.probabilityScore * 100).toFixed(0)}%
    2. 맥락적 적절성: ${(mine.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%
    3. 현실적 제약 고려
    이러한 요소들을 균형 있게 고려했을 때 ${mine.currentPosition}가 더 타당합니다.`;
  }
}