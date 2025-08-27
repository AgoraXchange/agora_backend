export type JurorId = 'gpt5' | 'claude' | 'gemini';

export interface EvaluationCriteria {
  premiseValidity: number;        // 전제 타당성 (0-1)
  logicalCoherence: number;       // 논리적 일관성 (0-1)
  evidenceStrength: number;       // 증거 강도 (0-1)
  probabilityScore: number;       // 개연성 점수 (0-1)
}

export class JurorOpinion {
  constructor(
    public readonly jurorId: JurorId,
    public readonly jurorName: string,
    public currentPosition: 'A' | 'B' | 'UNDECIDED',
    public reasoning: string,
    public confidenceLevel: number,
    public evaluationCriteria: EvaluationCriteria,
    public willingToChange: boolean,              // 의견 변경 가능 여부
    public readonly keyArguments: string[],       // 핵심 논거
    public readonly concerns: string[],           // 우려사항
    public readonly questionsForOthers: string[], // 다른 배심원에 대한 질문
    public persuasionResistance: number = 0.5     // 설득 저항도 (0-1)
  ) {
    this.validateOpinion();
  }

  private validateOpinion(): void {
    if (this.confidenceLevel < 0 || this.confidenceLevel > 1) {
      throw new Error('Confidence level must be between 0 and 1');
    }

    if (this.persuasionResistance < 0 || this.persuasionResistance > 1) {
      throw new Error('Persuasion resistance must be between 0 and 1');
    }

    // 평가 기준 값 검증
    Object.values(this.evaluationCriteria).forEach(value => {
      if (value < 0 || value > 1) {
        throw new Error('All evaluation criteria must be between 0 and 1');
      }
    });
  }

  get overallScore(): number {
    const criteria = this.evaluationCriteria;
    return (
      criteria.premiseValidity * 0.25 +
      criteria.logicalCoherence * 0.25 +
      criteria.evidenceStrength * 0.25 +
      criteria.probabilityScore * 0.25
    );
  }

  get opinionStrength(): number {
    // 의견의 강도: 신뢰도와 설득 저항도의 조합
    return this.confidenceLevel * 0.7 + this.persuasionResistance * 0.3;
  }

  canBePersuaded(): boolean {
    return this.willingToChange && this.persuasionResistance < 0.8;
  }

  updatePosition(
    newPosition: 'A' | 'B' | 'UNDECIDED',
    newReasoning: string,
    newConfidence: number
  ): void {
    if (!this.willingToChange) {
      throw new Error(`Juror ${this.jurorId} is not willing to change position`);
    }

    this.currentPosition = newPosition;
    this.reasoning = newReasoning;
    this.confidenceLevel = newConfidence;
    
    // 입장을 바꾸면 설득 저항도가 증가
    this.persuasionResistance = Math.min(1, this.persuasionResistance + 0.2);
    
    // 신뢰도가 높아지면 변경 의향 감소
    if (newConfidence > 0.8) {
      this.willingToChange = false;
    }
  }

  toDiscussionStatement(): string {
    const positionStr = this.currentPosition === 'UNDECIDED' 
      ? '아직 결정하지 못했습니다' 
      : `${this.currentPosition} 주장을 지지합니다`;
    
    return `
    ${this.jurorName}의 의견:
    
    현재 입장: ${positionStr}
    신뢰도: ${(this.confidenceLevel * 100).toFixed(0)}%
    
    주요 논거:
    ${this.keyArguments.map(arg => `- ${arg}`).join('\n')}
    
    평가 결과:
    - 전제 타당성: ${(this.evaluationCriteria.premiseValidity * 100).toFixed(0)}%
    - 논리 일관성: ${(this.evaluationCriteria.logicalCoherence * 100).toFixed(0)}%
    - 증거 강도: ${(this.evaluationCriteria.evidenceStrength * 100).toFixed(0)}%
    - 개연성: ${(this.evaluationCriteria.probabilityScore * 100).toFixed(0)}%
    
    ${this.concerns.length > 0 ? `우려사항:\n${this.concerns.map(c => `- ${c}`).join('\n')}` : ''}
    ${this.questionsForOthers.length > 0 ? `\n질문:\n${this.questionsForOthers.map(q => `- ${q}`).join('\n')}` : ''}
    `;
  }

  toJSON(): object {
    return {
      jurorId: this.jurorId,
      jurorName: this.jurorName,
      currentPosition: this.currentPosition,
      reasoning: this.reasoning,
      confidenceLevel: this.confidenceLevel,
      evaluationCriteria: this.evaluationCriteria,
      willingToChange: this.willingToChange,
      keyArguments: this.keyArguments,
      concerns: this.concerns,
      questionsForOthers: this.questionsForOthers,
      persuasionResistance: this.persuasionResistance,
      overallScore: this.overallScore,
      opinionStrength: this.opinionStrength
    };
  }
}