import { ArgumentAnalysis } from './ArgumentAnalysis';

export interface InvestigationMetadata {
  totalComments: number;
  analyzedComments: number;
  supportingA: number;
  supportingB: number;
  neutralComments: number;
  tokensUsed: number;
  investigationTimeMs: number;
  model: string;
  modelVersion: string;
}

export class InvestigationReport {
  constructor(
    public readonly id: string,
    public readonly contractId: string,
    public readonly investigatorId: 'claude',           // 조사관은 Claude로 고정
    public readonly argumentAAnalysis: ArgumentAnalysis,
    public readonly argumentBAnalysis: ArgumentAnalysis,
    public readonly neutralFindings: string[],          // 중립적 발견사항
    public readonly overallObservations: string[],      // 전반적 관찰사항
    public readonly confidence: number,
    public readonly metadata: InvestigationMetadata,
    public readonly createdAt: Date = new Date()
  ) {
    this.validateReport();
  }

  private validateReport(): void {
    if (this.confidence < 0 || this.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }

    if (this.argumentAAnalysis.supportingSide !== 'A') {
      throw new Error('Argument A analysis must support side A');
    }

    if (this.argumentBAnalysis.supportingSide !== 'B') {
      throw new Error('Argument B analysis must support side B');
    }
  }

  get strongerArgument(): 'A' | 'B' | 'EQUAL' {
    const strengthA = this.argumentAAnalysis.overallStrength;
    const strengthB = this.argumentBAnalysis.overallStrength;
    
    const difference = Math.abs(strengthA - strengthB);
    if (difference < 0.1) {
      return 'EQUAL';
    }
    
    return strengthA > strengthB ? 'A' : 'B';
  }

  get analysisCompleteness(): number {
    // 분석 완성도 평가
    if (this.metadata.totalComments === 0) return 0;
    
    const coverageRatio = this.metadata.analyzedComments / this.metadata.totalComments;
    const hasNeutralAnalysis = this.neutralFindings.length > 0 ? 0.1 : 0;
    const hasObservations = this.overallObservations.length > 0 ? 0.1 : 0;
    
    return Math.min(1, coverageRatio * 0.8 + hasNeutralAnalysis + hasObservations);
  }

  getExecutiveSummary(): string {
    return `
    조사 보고서 요약
    ================
    계약 ID: ${this.contractId}
    조사관: Claude
    
    분석 완료도: ${(this.analysisCompleteness * 100).toFixed(1)}%
    댓글 분석: ${this.metadata.analyzedComments}/${this.metadata.totalComments}건
    
    A 주장 강도: ${(this.argumentAAnalysis.overallStrength * 100).toFixed(1)}%
    - 전제: ${this.argumentAAnalysis.logicalStructure.premises.length}개
    - 증거: ${this.argumentAAnalysis.evidenceExtracted.length}개
    - 약점: ${this.argumentAAnalysis.weaknesses.length}개
    
    B 주장 강도: ${(this.argumentBAnalysis.overallStrength * 100).toFixed(1)}%
    - 전제: ${this.argumentBAnalysis.logicalStructure.premises.length}개
    - 증거: ${this.argumentBAnalysis.evidenceExtracted.length}개
    - 약점: ${this.argumentBAnalysis.weaknesses.length}개
    
    중립 발견사항: ${this.neutralFindings.length}개
    전반적 관찰: ${this.overallObservations.length}개
    
    예비 판단: ${this.strongerArgument === 'EQUAL' ? '팽팽한 균형' : `${this.strongerArgument} 주장이 더 강함`}
    조사 신뢰도: ${(this.confidence * 100).toFixed(1)}%
    `;
  }

  toJSON(): object {
    return {
      id: this.id,
      contractId: this.contractId,
      investigatorId: this.investigatorId,
      argumentAAnalysis: this.argumentAAnalysis.toJSON(),
      argumentBAnalysis: this.argumentBAnalysis.toJSON(),
      neutralFindings: this.neutralFindings,
      overallObservations: this.overallObservations,
      confidence: this.confidence,
      strongerArgument: this.strongerArgument,
      analysisCompleteness: this.analysisCompleteness,
      metadata: this.metadata,
      createdAt: this.createdAt
    };
  }
}