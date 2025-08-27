export interface DecisionMetadata {
  confidence: number;
  reasoning: string;
  dataPoints: Record<string, any>;
  timestamp: Date;
}

export class OracleDecision {
  constructor(
    public readonly id: string,
    public readonly contractId: string,
    public readonly winnerId: string,
    public readonly metadata: DecisionMetadata,
    public readonly createdAt: Date = new Date()
  ) {}

  isHighConfidence(): boolean {
    return this.metadata.confidence >= 0.8;
  }
}