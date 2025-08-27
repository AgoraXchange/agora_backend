import { injectable } from 'inversify';
import OpenAI from 'openai';
import { BaseProposer, ProposerConfig } from './BaseProposer';
import { logger } from '../../logging/Logger';

@injectable()
export class GPT5Proposer extends BaseProposer {
  readonly agentId = 'gpt5';
  readonly agentName = 'GPT-5 Analyst';
  readonly agentType = 'gpt5';
  
  private openai: OpenAI;

  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  protected getDefaultConfig(): ProposerConfig {
    return {
      temperature: 0.7,
      maxTokens: 1000,
      topP: 0.9,
      frequencyPenalty: 0.0,
      presencePenalty: 0.0,
      systemPrompt: `You are an expert analyst serving on a committee to determine the winner of a smart contract dispute between two parties.

Your role is to:
1. Carefully analyze both parties involved in the contract
2. Consider all available evidence and context
3. Make a reasoned decision about which party should be declared the winner
4. Provide clear rationale with supporting evidence

Be thorough, unbiased, and focus on factual analysis. Your decision will be combined with other expert analyses to reach a final consensus.

IMPORTANT: You must respond in valid JSON format with this exact structure:
{
  "winner": "partyA" or "partyB",
  "confidence": 0.0 to 1.0,
  "rationale": "detailed explanation of your reasoning",
  "evidence": ["list", "of", "supporting", "evidence", "points"],
  "methodology": "brief description of your analysis approach"
}`,
      userPromptTemplate: `Please analyze the following smart contract dispute and determine the winner:

Contract ID: {CONTRACT_ID}

Party A:
- Name: {PARTY_A_NAME}
- Address: {PARTY_A_ADDRESS}  
- Description: {PARTY_A_DESCRIPTION}

Party B:
- Name: {PARTY_B_NAME}
- Address: {PARTY_B_ADDRESS}
- Description: {PARTY_B_DESCRIPTION}

Additional Context: {CONTEXT}

Based on your analysis, which party should be declared the winner? Provide your response in the required JSON format.`
    };
  }

  protected getModelName(): string {
    return process.env.OPENAI_MODEL || 'gpt-5-2025-08-07';
  }

  protected async callAIModel(prompt: string, temperature: number): Promise<{
    content: any;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    rawResponse: any;
  }> {
    // Check if we should use mock mode
    const apiKey = process.env.OPENAI_API_KEY;
    if (process.env.OPENAI_FALLBACK_TO_MOCK === 'true' || !apiKey || apiKey.includes('mock')) {
      logger.debug('Using mock GPT-5 response (mock mode enabled)');
      return this.getMockResponse(prompt);
    }

    try {
      logger.debug('Calling GPT-5 model', { 
        model: this.getModelName(),
        temperature,
        maxTokens: this.config.maxTokens 
      });

      const completion = await this.openai.chat.completions.create({
        model: this.getModelName(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 1, // GPT-5 only supports temperature 1
        max_completion_tokens: this.config.maxTokens,
        // GPT-5 doesn't support top_p, frequency_penalty, presence_penalty
        response_format: { type: 'json_object' } // Force JSON response
      });

      const usage = completion.usage;
      const content = completion.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content received from GPT-5');
      }

      logger.debug('GPT-5 response received', {
        contentLength: content.length,
        tokenUsage: usage
      });

      return {
        content: JSON.parse(content),
        tokenUsage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0
        },
        rawResponse: completion
      };

    } catch (error) {
      logger.error('GPT-5 API call failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model: this.getModelName()
      });

      // Return mock response in case of API failure (for testing)
      if (process.env.OPENAI_FALLBACK_TO_MOCK === 'true') {
        logger.warn('Using mock GPT-5 response due to API failure');
        return this.getMockResponse(prompt);
      }

      throw error;
    }
  }

  private getMockResponse(prompt: string) {
    // Extract party IDs from the prompt
    const partyAMatch = prompt.match(/Party A \(([^)]+)\)/);
    const partyBMatch = prompt.match(/Party B \(([^)]+)\)/);
    const partyAId = partyAMatch ? partyAMatch[1].split(':')[0] : 'partyA';
    const partyBId = partyBMatch ? partyBMatch[1].split(':')[0] : 'partyB';
    
    const winnerId = Math.random() > 0.5 ? partyAId : partyBId;
    
    const mockResponse = {
      winner: winnerId,
      confidence: 0.6 + (Math.random() * 0.3), // 0.6-0.9
      rationale: `Mock analysis: Based on the available information and standard evaluation criteria, ${winnerId} demonstrates stronger positioning.`,
      evidence: [
        'Historical performance data',
        'Contract compliance record',
        'Available documentation'
      ],
      methodology: 'Mock GPT-5 analysis with randomized decision'
    };

    return {
      content: mockResponse,
      tokenUsage: {
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700
      },
      rawResponse: { mock: true }
    };
  }
}