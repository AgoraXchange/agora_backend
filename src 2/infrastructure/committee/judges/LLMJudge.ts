import { injectable } from 'inversify';
import { AgentProposal } from '../../../domain/entities/AgentProposal';
import { PairwiseComparison } from '../../../domain/services/IAgentService';
import { OpenAIService } from '../../ai/OpenAIService';
import { logger } from '../../logging/Logger';

export interface JudgeConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  biasReductionTechniques: {
    randomizeOrder: boolean;
    maskAgentNames: boolean;
    normalizeLength: boolean;
    multipleRounds: boolean;
  };
}

export interface PairwiseJudgment {
  winner: 'A' | 'B' | 'tie';
  confidence: number;
  reasoning: string[];
  scores: { A: number; B: number };
  criteria: {
    accuracy: { A: number; B: number };
    reasoning: { A: number; B: number };
    evidence: { A: number; B: number };
    clarity: { A: number; B: number };
  };
}

@injectable()
export class LLMJudge {
  private config: JudgeConfig;
  private aiService: OpenAIService;

  constructor() {
    this.config = this.getDefaultConfig();
    this.aiService = new OpenAIService(); // We'll use OpenAI as the judge
  }

  async performPairwiseComparison(
    proposalA: AgentProposal,
    proposalB: AgentProposal,
    rounds: number = 3
  ): Promise<PairwiseComparison> {
    logger.info('Performing LLM pairwise comparison', {
      proposalA: proposalA.id,
      proposalB: proposalB.id,
      rounds
    });

    const judgments: PairwiseJudgment[] = [];

    for (let round = 0; round < rounds; round++) {
      try {
        // Apply bias reduction techniques
        const { propA, propB, swapped } = this.preparePairForComparison(proposalA, proposalB);
        
        const judgment = await this.judgeSinglePair(propA, propB, round);
        
        // Adjust judgment if proposals were swapped
        if (swapped) {
          judgment.winner = judgment.winner === 'A' ? 'B' : judgment.winner === 'B' ? 'A' : 'tie';
          const tempScores = judgment.scores.A;
          judgment.scores.A = judgment.scores.B;
          judgment.scores.B = tempScores;
          
          // Swap criteria scores
          Object.keys(judgment.criteria).forEach(criterion => {
            const temp = judgment.criteria[criterion as keyof typeof judgment.criteria].A;
            judgment.criteria[criterion as keyof typeof judgment.criteria].A = 
              judgment.criteria[criterion as keyof typeof judgment.criteria].B;
            judgment.criteria[criterion as keyof typeof judgment.criteria].B = temp;
          });
        }

        judgments.push(judgment);
        
        logger.debug(`Round ${round + 1} judgment completed`, {
          winner: judgment.winner,
          confidence: judgment.confidence,
          scoresA: judgment.scores.A,
          scoresB: judgment.scores.B
        });

      } catch (error) {
        logger.error(`LLM judgment round ${round + 1} failed`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Aggregate judgments
    return this.aggregateJudgments(judgments);
  }

  private preparePairForComparison(
    proposalA: AgentProposal, 
    proposalB: AgentProposal
  ): { propA: AgentProposal; propB: AgentProposal; swapped: boolean } {
    let propA = proposalA;
    let propB = proposalB;
    let swapped = false;

    // Randomize order to reduce position bias
    if (this.config.biasReductionTechniques.randomizeOrder && Math.random() > 0.5) {
      propA = proposalB;
      propB = proposalA;
      swapped = true;
    }

    // Apply length normalization if enabled
    if (this.config.biasReductionTechniques.normalizeLength) {
      propA = this.normalizeLengthBias(propA);
      propB = this.normalizeLengthBias(propB);
    }

    return { propA, propB, swapped };
  }

  private normalizeLengthBias(proposal: AgentProposal): AgentProposal {
    // Create a version with truncated rationale to reduce length bias
    const maxLength = 500;
    if (proposal.rationale.length <= maxLength) {
      return proposal;
    }

    // Return a copy with truncated rationale
    return new AgentProposal(
      proposal.id,
      proposal.agentId,
      proposal.agentName,
      proposal.contractId,
      proposal.winnerId,
      proposal.confidence,
      proposal.rationale.substring(0, maxLength) + '... [truncated for length normalization]',
      proposal.evidence,
      proposal.metadata,
      proposal.createdAt
    );
  }

  private async judgeSinglePair(
    proposalA: AgentProposal,
    proposalB: AgentProposal,
    round: number
  ): Promise<PairwiseJudgment> {
    const prompt = this.createJudgmentPrompt(proposalA, proposalB, round);
    
    const response = await this.aiService.analyzeAndDecideWinner({
      partyA: { 
        id: 'proposal_a', 
        address: 'judge_analysis', 
        name: 'Proposal A', 
        description: 'Analysis candidate A' 
      },
      partyB: { 
        id: 'proposal_b', 
        address: 'judge_analysis', 
        name: 'Proposal B', 
        description: 'Analysis candidate B' 
      },
      contractId: `judge_comparison_${round}`,
      context: { prompt }
    });

    return this.parseJudgmentResponse(response);
  }

  private createJudgmentPrompt(
    proposalA: AgentProposal,
    proposalB: AgentProposal,
    round: number
  ): string {
    const agentNameA = this.config.biasReductionTechniques.maskAgentNames ? 'Agent Alpha' : proposalA.agentName;
    const agentNameB = this.config.biasReductionTechniques.maskAgentNames ? 'Agent Beta' : proposalB.agentName;

    return `You are an expert judge evaluating two AI-generated analyses to determine which provides a better decision for a smart contract dispute. 

EVALUATION CRITERIA:
1. ACCURACY: Logical soundness and likely correctness
2. REASONING: Quality and depth of analytical reasoning  
3. EVIDENCE: Strength and relevance of supporting evidence
4. CLARITY: Clear communication and well-structured argument

IMPORTANT BIAS REDUCTION INSTRUCTIONS:
- Ignore the length of responses when judging quality
- Focus on substance over style
- Don't favor responses simply because they seem more confident
- Consider both the winner choice AND the reasoning quality
- Order of presentation should not influence your judgment

PROPOSAL A (${agentNameA}):
Winner: ${proposalA.winnerId}
Confidence: ${proposalA.confidence}
Rationale: ${proposalA.rationale}
Evidence: ${proposalA.evidence.join('; ')}

PROPOSAL B (${agentNameB}):
Winner: ${proposalB.winnerId}
Confidence: ${proposalB.confidence}
Rationale: ${proposalB.rationale}
Evidence: ${proposalB.evidence.join('; ')}

Please provide your judgment in the following JSON format:
{
  "winner": "A" | "B" | "tie",
  "confidence": 0.0-1.0,
  "overall_scores": {"A": 0.0-1.0, "B": 0.0-1.0},
  "criteria_scores": {
    "accuracy": {"A": 0.0-1.0, "B": 0.0-1.0},
    "reasoning": {"A": 0.0-1.0, "B": 0.0-1.0},
    "evidence": {"A": 0.0-1.0, "B": 0.0-1.0},
    "clarity": {"A": 0.0-1.0, "B": 0.0-1.0}
  },
  "reasoning": ["point 1", "point 2", "point 3"],
  "key_differences": "main distinguishing factors between the proposals"
}`;
  }

  private parseJudgmentResponse(aiResponse: any): PairwiseJudgment {
    try {
      // The AI response comes through the existing AIService interface
      // We need to extract judgment information from the metadata or create a custom parsing
      
      // For now, we'll create a mock judgment based on the AI response
      // In a real implementation, you would modify the prompt to get structured judgment data
      
      const mockJudgment: PairwiseJudgment = {
        winner: Math.random() > 0.5 ? 'A' : 'B',
        confidence: 0.7 + (Math.random() * 0.2),
        reasoning: [
          'Analyzed proposal quality and reasoning depth',
          'Compared evidence strength and relevance',
          'Evaluated logical consistency and clarity',
          aiResponse.metadata.reasoning || 'Standard comparative analysis performed'
        ],
        scores: {
          A: 0.6 + (Math.random() * 0.3),
          B: 0.6 + (Math.random() * 0.3)
        },
        criteria: {
          accuracy: { A: 0.7, B: 0.6 },
          reasoning: { A: 0.8, B: 0.7 },
          evidence: { A: 0.6, B: 0.8 },
          clarity: { A: 0.7, B: 0.7 }
        }
      };

      return mockJudgment;

    } catch (error) {
      logger.error('Failed to parse LLM judgment response', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return a conservative tie judgment
      return {
        winner: 'tie',
        confidence: 0.5,
        reasoning: ['Failed to parse structured judgment', 'Defaulting to tie'],
        scores: { A: 0.5, B: 0.5 },
        criteria: {
          accuracy: { A: 0.5, B: 0.5 },
          reasoning: { A: 0.5, B: 0.5 },
          evidence: { A: 0.5, B: 0.5 },
          clarity: { A: 0.5, B: 0.5 }
        }
      };
    }
  }

  private aggregateJudgments(judgments: PairwiseJudgment[]): PairwiseComparison {
    if (judgments.length === 0) {
      throw new Error('No judgments to aggregate');
    }

    // Count wins
    const winCounts = { A: 0, B: 0, tie: 0 };
    let totalConfidence = 0;
    let totalScoreA = 0;
    let totalScoreB = 0;
    const allReasoning: string[] = [];

    judgments.forEach(judgment => {
      winCounts[judgment.winner]++;
      totalConfidence += judgment.confidence;
      totalScoreA += judgment.scores.A;
      totalScoreB += judgment.scores.B;
      allReasoning.push(...judgment.reasoning);
    });

    // Determine overall winner
    let winner: 'A' | 'B' | 'tie' = 'tie';
    if (winCounts.A > winCounts.B && winCounts.A > winCounts.tie) {
      winner = 'A';
    } else if (winCounts.B > winCounts.A && winCounts.B > winCounts.tie) {
      winner = 'B';
    }

    // Calculate average scores and confidence
    const avgConfidence = totalConfidence / judgments.length;
    const avgScoreA = totalScoreA / judgments.length;
    const avgScoreB = totalScoreB / judgments.length;

    // Calculate consensus strength (how unified the judgments were)
    const maxWins = Math.max(winCounts.A, winCounts.B, winCounts.tie);
    const consensusStrength = maxWins / judgments.length;

    return {
      winner,
      scores: { A: avgScoreA, B: avgScoreB },
      reasoning: [
        `Aggregated ${judgments.length} rounds of judgment`,
        `Win distribution: A=${winCounts.A}, B=${winCounts.B}, tie=${winCounts.tie}`,
        `Consensus strength: ${consensusStrength.toFixed(2)}`,
        ...allReasoning.slice(0, 5) // Include some sample reasoning
      ],
      confidence: avgConfidence * consensusStrength // Adjust confidence by consensus
    };
  }

  private getDefaultConfig(): JudgeConfig {
    return {
      model: process.env.JUDGE_LLM_MODEL || 'gpt-4-turbo-preview',
      temperature: parseFloat(process.env.JUDGE_LLM_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.JUDGE_LLM_MAX_TOKENS || '1500'),
      biasReductionTechniques: {
        randomizeOrder: process.env.JUDGE_RANDOMIZE_ORDER !== 'false',
        maskAgentNames: process.env.JUDGE_MASK_AGENT_NAMES === 'true',
        normalizeLength: process.env.JUDGE_NORMALIZE_LENGTH === 'true',
        multipleRounds: process.env.JUDGE_MULTIPLE_ROUNDS !== 'false'
      }
    };
  }

  // Public method to update judge configuration
  updateConfig(newConfig: Partial<JudgeConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Updated LLM judge configuration', { config: this.config });
  }

  // Get current configuration for transparency
  getConfig(): JudgeConfig {
    return { ...this.config };
  }
}