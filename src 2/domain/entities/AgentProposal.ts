import { ProposalMetadata } from '../valueObjects/ProposalMetadata';

export class AgentProposal {
  constructor(
    public readonly id: string,
    public readonly agentId: string,
    public readonly agentName: string,
    public readonly contractId: string,
    public readonly winnerId: string,
    public readonly confidence: number,
    public readonly rationale: string,
    public readonly evidence: string[],
    public readonly metadata: ProposalMetadata,
    public readonly createdAt: Date = new Date()
  ) {
    if (confidence < 0 || confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }
    
    if (!winnerId || winnerId.trim() === '') {
      throw new Error('Winner ID cannot be empty');
    }
    
    if (!rationale || rationale.trim() === '') {
      throw new Error('Rationale cannot be empty');
    }
  }

  /**
   * Checks if this proposal has high confidence (>= 0.8)
   */
  isHighConfidence(): boolean {
    return this.confidence >= 0.8;
  }

  /**
   * Gets the quality score based on evidence and rationale
   */
  getQualityScore(): number {
    const evidenceScore = Math.min(this.evidence.length * 0.1, 0.3);
    const rationaleScore = Math.min(this.rationale.length / 500, 0.5);
    const confidenceScore = this.confidence * 0.2;
    
    return evidenceScore + rationaleScore + confidenceScore;
  }

  /**
   * Checks if proposal has sufficient evidence
   */
  hasSufficientEvidence(): boolean {
    return this.evidence.length >= 2 && this.rationale.length >= 100;
  }

  /**
   * Compares with another proposal for equality
   */
  equals(other: AgentProposal): boolean {
    return this.id === other.id;
  }

  /**
   * Gets a summary for logging/debugging
   */
  getSummary(): string {
    return `${this.agentName}: ${this.winnerId} (confidence: ${this.confidence.toFixed(2)})`;
  }
}