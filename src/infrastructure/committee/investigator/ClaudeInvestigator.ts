import { injectable } from 'inversify';
import { Anthropic } from '@anthropic-ai/sdk';
import { 
  IInvestigatorService, 
  DebateAnalysisInput,
  CommentCategorization 
} from '../../../domain/services/IInvestigatorService';
import { DebateComment, CommentSupportingSide } from '../../../domain/entities/DebateComment';
import { InvestigationReport, InvestigationMetadata } from '../../../domain/entities/InvestigationReport';
import { ArgumentAnalysis, LogicalStructure } from '../../../domain/entities/ArgumentAnalysis';
import { logger } from '../../logging/Logger';

@injectable()
export class ClaudeInvestigator implements IInvestigatorService {
  private claude: Anthropic;
  private readonly model = 'claude-3-5-sonnet-20241022';
  
  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key is required for investigator');
    }
    this.claude = new Anthropic({ apiKey });
  }

  async investigate(input: DebateAnalysisInput): Promise<InvestigationReport> {
    const startTime = Date.now();
    logger.info('Starting investigation', { 
      contractId: input.contractId,
      totalComments: input.comments.length 
    });

    try {
      // 1단계: 댓글 분류
      const categorization = await this.categorizeComments(input.comments, {
        argumentA: input.argumentA,
        argumentB: input.argumentB
      });

      logger.info('Comments categorized', {
        supportingA: categorization.supportingA.length,
        supportingB: categorization.supportingB.length,
        neutral: categorization.neutral.length
      });

      // 2단계: A 주장 논리 구조 추출
      const argumentAAnalysis = await this.extractArgumentStructure(
        categorization.supportingA,
        'A',
        { topic: input.topic, argument: input.argumentA }
      );

      // 3단계: B 주장 논리 구조 추출
      const argumentBAnalysis = await this.extractArgumentStructure(
        categorization.supportingB,
        'B',
        { topic: input.topic, argument: input.argumentB }
      );

      // 4단계: 중립적 통찰 추출
      const insights = await this.extractNeutralInsights(input.comments, categorization);

      // 5단계: 메타데이터 계산
      const metadata: InvestigationMetadata = {
        totalComments: input.comments.length,
        analyzedComments: categorization.supportingA.length + 
                         categorization.supportingB.length + 
                         categorization.neutral.length,
        supportingA: categorization.supportingA.length,
        supportingB: categorization.supportingB.length,
        neutralComments: categorization.neutral.length,
        tokensUsed: 0, // Will be updated from API responses
        investigationTimeMs: Date.now() - startTime,
        model: this.model,
        modelVersion: '20241022'
      };

      // 6단계: 조사 보고서 생성
      const reportId = `investigation_${input.contractId}_${Date.now()}`;
      const confidence = this.calculateInvestigationConfidence(
        argumentAAnalysis,
        argumentBAnalysis,
        metadata
      );

      const report = new InvestigationReport(
        reportId,
        input.contractId,
        'claude',
        argumentAAnalysis,
        argumentBAnalysis,
        insights.neutralFindings,
        insights.overallObservations,
        confidence,
        metadata
      );

      logger.info('Investigation completed', {
        reportId,
        confidence,
        strongerArgument: report.strongerArgument,
        timeMs: metadata.investigationTimeMs
      });

      return report;

    } catch (error) {
      logger.error('Investigation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        contractId: input.contractId
      });
      throw error;
    }
  }

  async categorizeComments(
    comments: DebateComment[],
    context: { argumentA: string; argumentB: string }
  ): Promise<CommentCategorization> {
    if (comments.length === 0) {
      return {
        supportingA: [],
        supportingB: [],
        neutral: [],
        uncategorized: []
      };
    }

    const prompt = this.buildCategorizationPrompt(comments, context);
    
    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 2000,
        temperature: 0.3, // 낮은 온도로 일관성 있는 분류
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const categorization = this.parseCategorizationResponse(content.text, comments);
      
      // 각 댓글에 분류 결과 설정
      categorization.supportingA.forEach(c => c.setSupportingSide(CommentSupportingSide.ARGUMENT_A));
      categorization.supportingB.forEach(c => c.setSupportingSide(CommentSupportingSide.ARGUMENT_B));
      categorization.neutral.forEach(c => c.setSupportingSide(CommentSupportingSide.NEUTRAL));
      
      return categorization;

    } catch (error) {
      logger.error('Comment categorization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // 실패 시 모든 댓글을 미분류로 처리
      return {
        supportingA: [],
        supportingB: [],
        neutral: [],
        uncategorized: comments
      };
    }
  }

  async extractArgumentStructure(
    comments: DebateComment[],
    supportingSide: 'A' | 'B',
    context: { topic: string; argument: string }
  ): Promise<ArgumentAnalysis> {
    if (comments.length === 0) {
      // 댓글이 없는 경우 기본 구조 반환
      return new ArgumentAnalysis(
        supportingSide,
        {
          premises: [`${supportingSide} 주장: ${context.argument}`],
          reasoning: ['지지 댓글 없음'],
          conclusion: context.argument,
          assumptions: []
        },
        [],
        [],
        ['댓글 근거 부족'],
        ['지지 논거 없음'],
        ['반대 논리로 쉽게 반박 가능'],
        0.1
      );
    }

    const prompt = this.buildExtractionPrompt(comments, supportingSide, context);

    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 3000,
        temperature: 0.5,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return this.parseArgumentAnalysis(content.text, supportingSide, comments);

    } catch (error) {
      logger.error('Argument extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        side: supportingSide
      });
      
      // 실패 시 기본 분석 반환
      return new ArgumentAnalysis(
        supportingSide,
        {
          premises: [context.argument],
          reasoning: ['분석 실패'],
          conclusion: context.argument,
          assumptions: []
        },
        [],
        comments.map(c => c.id),
        [],
        ['분석 오류'],
        [],
        0.1
      );
    }
  }

  async determineCommentSide(
    comment: DebateComment,
    argumentA: string,
    argumentB: string
  ): Promise<CommentSupportingSide> {
    const prompt = `
    댓글을 분석하여 어느 주장을 지지하는지 판단하시오.
    
    A 주장: ${argumentA}
    B 주장: ${argumentB}
    
    댓글: "${comment.content}"
    
    답변 형식: A, B, NEUTRAL, UNKNOWN 중 하나만
    `;

    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 10,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return CommentSupportingSide.UNKNOWN;
      }

      const side = content.text.trim().toUpperCase();
      switch (side) {
        case 'A':
          return CommentSupportingSide.ARGUMENT_A;
        case 'B':
          return CommentSupportingSide.ARGUMENT_B;
        case 'NEUTRAL':
          return CommentSupportingSide.NEUTRAL;
        default:
          return CommentSupportingSide.UNKNOWN;
      }

    } catch (error) {
      logger.error('Comment side determination failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commentId: comment.id
      });
      return CommentSupportingSide.UNKNOWN;
    }
  }

  async extractNeutralInsights(
    comments: DebateComment[],
    categorization: CommentCategorization
  ): Promise<{ neutralFindings: string[]; overallObservations: string[] }> {
    const prompt = this.buildInsightsPrompt(comments, categorization);

    try {
      const response = await this.claude.messages.create({
        model: this.model,
        max_tokens: 1500,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return this.parseInsights(content.text);

    } catch (error) {
      logger.error('Insights extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        neutralFindings: ['통찰 추출 실패'],
        overallObservations: ['전반적 관찰 불가']
      };
    }
  }

  // === 프롬프트 빌더 메서드들 ===

  private buildCategorizationPrompt(
    comments: DebateComment[],
    context: { argumentA: string; argumentB: string }
  ): string {
    const commentsList = comments.map((c, i) => 
      `[${i + 1}] ${c.content} (추천: ${c.upvotes}, 비추천: ${c.downvotes})`
    ).join('\n');

    return `당신은 공정한 조사관입니다. 다음 댓글들을 A 주장 지지, B 주장 지지, 중립으로 분류하시오.

A 주장: ${context.argumentA}
B 주장: ${context.argumentB}

댓글 목록:
${commentsList}

각 댓글 번호와 분류를 JSON 형식으로 응답:
{
  "supportingA": [댓글 번호 배열],
  "supportingB": [댓글 번호 배열],
  "neutral": [댓글 번호 배열]
}`;
  }

  private buildExtractionPrompt(
    comments: DebateComment[],
    side: 'A' | 'B',
    context: { topic: string; argument: string }
  ): string {
    const commentsList = comments.map(c => 
      `- ${c.content} (평가: ${c.netVotes})`
    ).join('\n');

    return `당신은 논리 분석 전문가입니다. ${side} 주장을 지지하는 댓글들에서 논리 구조를 추출하시오.

토론 주제: ${context.topic}
${side} 주장: ${context.argument}

지지 댓글들:
${commentsList}

다음 형식으로 논리 구조를 추출하시오:
{
  "premises": ["전제1", "전제2", ...],
  "reasoning": ["추론1", "추론2", ...],
  "conclusion": "결론",
  "assumptions": ["암묵적 가정1", ...],
  "evidence": ["증거1", "증거2", ...],
  "keyInsights": ["핵심 통찰1", ...],
  "weaknesses": ["약점1", "약점2", ...],
  "counterArguments": ["가능한 반박1", ...],
  "confidence": 0.0-1.0
}`;
  }

  private buildInsightsPrompt(
    comments: DebateComment[],
    categorization: CommentCategorization
  ): string {
    return `토론 전체를 검토하여 중립적 발견사항과 전반적 관찰을 도출하시오.

전체 댓글 수: ${comments.length}
A 지지: ${categorization.supportingA.length}
B 지지: ${categorization.supportingB.length}
중립: ${categorization.neutral.length}

중립 댓글 예시:
${categorization.neutral.slice(0, 5).map(c => `- ${c.content}`).join('\n')}

다음 형식으로 응답:
{
  "neutralFindings": ["중립적 발견1", "중립적 발견2", ...],
  "overallObservations": ["전반적 관찰1", "전반적 관찰2", ...]
}`;
  }

  // === 응답 파서 메서드들 ===

  private parseCategorizationResponse(
    response: string,
    comments: DebateComment[]
  ): CommentCategorization {
    try {
      const parsed = JSON.parse(response);
      const commentMap = new Map(comments.map((c, i) => [i + 1, c]));
      
      return {
        supportingA: (parsed.supportingA || []).map((i: number) => commentMap.get(i)).filter(Boolean),
        supportingB: (parsed.supportingB || []).map((i: number) => commentMap.get(i)).filter(Boolean),
        neutral: (parsed.neutral || []).map((i: number) => commentMap.get(i)).filter(Boolean),
        uncategorized: []
      };
    } catch (error) {
      logger.error('Failed to parse categorization response', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        supportingA: [],
        supportingB: [],
        neutral: [],
        uncategorized: comments
      };
    }
  }

  private parseArgumentAnalysis(
    response: string,
    side: 'A' | 'B',
    comments: DebateComment[]
  ): ArgumentAnalysis {
    try {
      const parsed = JSON.parse(response);
      
      const logicalStructure: LogicalStructure = {
        premises: parsed.premises || [],
        reasoning: parsed.reasoning || [],
        conclusion: parsed.conclusion || '',
        assumptions: parsed.assumptions || []
      };

      return new ArgumentAnalysis(
        side,
        logicalStructure,
        parsed.evidence || [],
        comments.map(c => c.id),
        parsed.keyInsights || [],
        parsed.weaknesses || [],
        parsed.counterArguments || [],
        parsed.confidence || 0.5
      );
      
    } catch (error) {
      logger.error('Failed to parse argument analysis', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // 파싱 실패 시 기본값 반환
      return new ArgumentAnalysis(
        side,
        {
          premises: ['파싱 오류'],
          reasoning: ['파싱 오류'],
          conclusion: '파싱 오류',
          assumptions: []
        },
        [],
        comments.map(c => c.id),
        [],
        ['응답 파싱 실패'],
        [],
        0.1
      );
    }
  }

  private parseInsights(response: string): {
    neutralFindings: string[];
    overallObservations: string[];
  } {
    try {
      const parsed = JSON.parse(response);
      return {
        neutralFindings: parsed.neutralFindings || [],
        overallObservations: parsed.overallObservations || []
      };
    } catch (error) {
      logger.error('Failed to parse insights', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        neutralFindings: [],
        overallObservations: []
      };
    }
  }

  // === 유틸리티 메서드들 ===

  private calculateInvestigationConfidence(
    analysisA: ArgumentAnalysis,
    analysisB: ArgumentAnalysis,
    metadata: InvestigationMetadata
  ): number {
    // 조사 신뢰도 계산
    const coverageRatio = metadata.totalComments > 0 
      ? metadata.analyzedComments / metadata.totalComments 
      : 0;
    
    const analysisQuality = (analysisA.confidence + analysisB.confidence) / 2;
    const hasEnoughData = metadata.analyzedComments >= 5 ? 0.2 : 0;
    
    return Math.min(1, coverageRatio * 0.4 + analysisQuality * 0.4 + hasEnoughData);
  }
}