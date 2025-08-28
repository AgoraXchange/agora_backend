import { injectable } from 'inversify';
import OpenAI from 'openai';
import { BaseProposer, ProposerConfig } from './BaseProposer';
import { logger } from '../../logging/Logger';

@injectable()
export class GPT5Proposer extends BaseProposer {
  readonly agentId = 'gpt5';
  readonly agentName = 'GPT-5 Analyst';
  readonly agentType = 'gpt5';
  
  private openai?: OpenAI;

  constructor() {
    super();
  }
  
  private getOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key is required for GPT-5 Proposer');
      }
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }

  protected getDefaultConfig(): ProposerConfig {
    return {
      temperature: 0.7,
      maxTokens: 2000,
      topP: 0.9,
      frequencyPenalty: 0.0,
      presencePenalty: 0.0,
      systemPrompt: `Expert analyst evaluating smart contract disputes. Analyze parties objectively and decide winner.

Return JSON:
{
  "winner": "partyA" or "partyB",
  "confidence": 0.0-1.0,
  "rationale": "brief reasoning (max 100 words)",
  "evidence": ["key point 1", "key point 2"],
  "methodology": "analysis method"
}`,
      userPromptTemplate: `Contract {CONTRACT_ID}

Party A: {PARTY_A_NAME} ({PARTY_A_ADDRESS})
{PARTY_A_DESCRIPTION}

Party B: {PARTY_B_NAME} ({PARTY_B_ADDRESS})
{PARTY_B_DESCRIPTION}

Context: {CONTEXT}

Determine winner. Return JSON.`
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

      const completion = await this.getOpenAI().chat.completions.create({
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
      const finishReason = completion.choices[0]?.finish_reason;

      if (!content) {
        logger.error('GPT-5 response missing content', {
          finishReason,
          usage: usage
        });
        throw new Error(`No content received from GPT-5 (finish_reason: ${finishReason})`);
      }
      
      if (finishReason === 'length') {
        logger.warn('GPT-5 response truncated due to token limit', {
          contentLength: content.length,
          usage: usage
        });
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