export interface LogicalStructure {
  premises: string[];           // 전제들
  reasoning: string[];          // 논리 전개 과정
  conclusion: string;           // 결론
  assumptions?: string[];       // 암묵적 가정들
}

export interface LogicalStrength {
  premiseValidity: number;      // 전제 타당성 (0-1)
  logicalCoherence: number;     // 논리적 일관성 (0-1)
  evidenceStrength: number;     // 증거 강도 (0-1)
  probabilityScore: number;     // 개연성 점수 (0-1)
}

export class ArgumentAnalysis {
  constructor(
    public readonly supportingSide: 'A' | 'B',
    public readonly logicalStructure: LogicalStructure,
    public readonly evidenceExtracted: string[],     // 댓글에서 추출한 증거
    public readonly sourceCommentIds: string[],      // 근거가 된 댓글 ID들
    public readonly keyInsights: string[],           // 핵심 통찰
    public readonly weaknesses: string[],            // 논리적 약점
    public readonly counterArguments: string[],      // 가능한 반박
    public readonly confidence: number               // 분석 신뢰도 (0-1)
  ) {
    this.validateAnalysis();
  }

  private validateAnalysis(): void {
    if (this.confidence < 0 || this.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }
    
    if (this.logicalStructure.premises.length === 0) {
      throw new Error('At least one premise is required');
    }
    
    if (!this.logicalStructure.conclusion) {
      throw new Error('Conclusion cannot be empty');
    }
  }

  get overallStrength(): number {
    // 전반적인 논증 강도 계산
    const hasEvidence = this.evidenceExtracted.length > 0 ? 0.3 : 0;
    const hasMultiplePremises = Math.min(this.logicalStructure.premises.length / 5, 1) * 0.2;
    const hasReasoning = Math.min(this.logicalStructure.reasoning.length / 3, 1) * 0.2;
    const confidenceWeight = this.confidence * 0.3;
    
    return hasEvidence + hasMultiplePremises + hasReasoning + confidenceWeight;
  }

  calculateLogicalStrength(): LogicalStrength {
    // 논리적 강도를 계산하는 기본 메트릭
    // 실제 평가는 배심원들이 수행
    return {
      premiseValidity: this.logicalStructure.premises.length > 0 ? 0.5 : 0,
      logicalCoherence: this.logicalStructure.reasoning.length > 0 ? 0.5 : 0,
      evidenceStrength: Math.min(this.evidenceExtracted.length / 5, 1),
      probabilityScore: this.confidence
    };
  }

  getSummary(): string {
    return `
    지지 측: ${this.supportingSide === 'A' ? 'A 주장' : 'B 주장'}
    전제 개수: ${this.logicalStructure.premises.length}
    증거 개수: ${this.evidenceExtracted.length}
    약점 개수: ${this.weaknesses.length}
    전체 강도: ${(this.overallStrength * 100).toFixed(1)}%
    `;
  }

  toJSON(): object {
    return {
      supportingSide: this.supportingSide,
      logicalStructure: this.logicalStructure,
      evidenceExtracted: this.evidenceExtracted,
      sourceCommentIds: this.sourceCommentIds,
      keyInsights: this.keyInsights,
      weaknesses: this.weaknesses,
      counterArguments: this.counterArguments,
      confidence: this.confidence,
      overallStrength: this.overallStrength,
      logicalStrength: this.calculateLogicalStrength()
    };
  }
}