import { DebateContract } from '../entities/DebateContract';
import { DebateComment, CommentSupportingSide } from '../entities/DebateComment';
import { InvestigationReport } from '../entities/InvestigationReport';
import { ArgumentAnalysis } from '../entities/ArgumentAnalysis';

export interface DebateAnalysisInput {
  contractId: string;
  topic: string;
  description: string;
  argumentA: string;
  argumentB: string;
  comments: DebateComment[];
}

export interface CommentCategorization {
  supportingA: DebateComment[];
  supportingB: DebateComment[];
  neutral: DebateComment[];
  uncategorized: DebateComment[];
}

export interface IInvestigatorService {
  /**
   * 전체 토론 조사 수행
   */
  investigate(input: DebateAnalysisInput): Promise<InvestigationReport>;
  
  /**
   * 댓글들로부터 특정 주장의 논리 구조 추출
   */
  extractArgumentStructure(
    comments: DebateComment[], 
    supportingSide: 'A' | 'B',
    context: {
      topic: string;
      argument: string;
    }
  ): Promise<ArgumentAnalysis>;
  
  /**
   * 댓글들을 지지 측면별로 분류
   */
  categorizeComments(
    comments: DebateComment[],
    context: {
      argumentA: string;
      argumentB: string;
    }
  ): Promise<CommentCategorization>;
  
  /**
   * 단일 댓글의 지지 측면 판단
   */
  determineCommentSide(
    comment: DebateComment,
    argumentA: string,
    argumentB: string
  ): Promise<CommentSupportingSide>;
  
  /**
   * 중립적 발견사항 및 전반적 관찰 추출
   */
  extractNeutralInsights(
    comments: DebateComment[],
    categorization: CommentCategorization
  ): Promise<{
    neutralFindings: string[];
    overallObservations: string[];
  }>;
}