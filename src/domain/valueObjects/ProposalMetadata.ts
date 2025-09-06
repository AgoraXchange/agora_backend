export interface IProposalMetadata {
  temperature: number;
  maxTokens: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  processingTimeMs: number;
  model: string;
  prompt: string;
  rawResponse?: any;
  analysisMethod: string;
  samplingParameters: {
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

export class ProposalMetadata implements IProposalMetadata {
  constructor(
    public readonly temperature: number,
    public readonly maxTokens: number,
    public readonly tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    },
    public readonly processingTimeMs: number,
    public readonly model: string,
    public readonly prompt: string,
    public readonly analysisMethod: string,
    public readonly samplingParameters: {
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
    } = {},
    public readonly rawResponse?: any
  ) {}

  /**
   * Gets the cost estimate based on token usage
   */
  getCostEstimate(): number {
    const promptCostPer1K = this.getPromptCostPer1K();
    const completionCostPer1K = this.getCompletionCostPer1K();
    
    const promptCost = (this.tokenUsage.promptTokens / 1000) * promptCostPer1K;
    const completionCost = (this.tokenUsage.completionTokens / 1000) * completionCostPer1K;
    
    return promptCost + completionCost;
  }

  /**
   * Gets efficiency score (quality per token)
   */
  getEfficiencyScore(): number {
    const tokensPerSecond = this.tokenUsage.totalTokens / (this.processingTimeMs / 1000);
    return Math.min(tokensPerSecond / 100, 1); // Normalize to 0-1
  }

  private getPromptCostPer1K(): number {
    // Approximate costs per 1K tokens (USD)
    switch (this.model.toLowerCase()) {
      case 'gpt-5':
      case 'gpt-5-2025-08-07':
        return 0.01;
      case 'claude-sonnet-4-20250514':
        return 0.003;
      case 'gemini-2.5-pro':
        return 0.0005;
      default:
        return 0.002; // Default estimate
    }
  }

  private getCompletionCostPer1K(): number {
    // Approximate costs per 1K tokens (USD)
    switch (this.model.toLowerCase()) {
      case 'gpt-5':
      case 'gpt-5-2025-08-07':
        return 0.03;
      case 'claude-sonnet-4-20250514':
        return 0.015;
      case 'gemini-2.5-pro':
        return 0.0015;
      default:
        return 0.006; // Default estimate
    }
  }
}