import { injectable } from 'inversify';
import OpenAI from 'openai';
import { IAIService, AIAnalysisInput, AIAnalysisResult } from '../../domain/services/IAIService';
import { DecisionMetadata } from '../../domain/entities/OracleDecision';
import { logger } from '../logging/Logger';
import { AppError, ErrorCode } from '../../domain/errors/AppError';

@injectable()
export class OpenAIService implements IAIService {
  private openai: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
  }

  async analyzeAndDecideWinner(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    try {
      const prompt = this.buildPrompt(input);
      const response = await this.callOpenAI(prompt);
      
      const analysis = this.parseResponse(response);
      
      // For judge comparisons, the response is already structured judgment data
      if (input.additionalContext?.prompt) {
        // This is a judge comparison, return the full judgment data
        const winnerId = this.determineWinner(input, analysis);
        
        const metadata: DecisionMetadata = {
          confidence: analysis.confidence || 0.85,
          reasoning: analysis.reasoning || 'AI analysis completed',
          dataPoints: analysis, // Pass the entire response as dataPoints for judge
          timestamp: new Date()
        };

        return {
          winnerId,
          metadata
        };
      }
      
      // Regular analysis path
      const winnerId = this.determineWinner(input, analysis);
      
      const metadata: DecisionMetadata = {
        confidence: analysis.confidence || 0.85,
        reasoning: analysis.reasoning || 'AI analysis completed',
        dataPoints: analysis.dataPoints || {},
        timestamp: new Date()
      };

      return {
        winnerId,
        metadata
      };
    } catch (error) {
      logger.error('AI Service error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        contractId: input.contractId 
      });
      throw new AppError(
        ErrorCode.AI_SERVICE_ERROR,
        'Failed to analyze and decide winner',
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  private buildPrompt(input: AIAnalysisInput): string {
    // Check if this is a judge comparison (has prompt in additionalContext)
    if (input.additionalContext?.prompt) {
      return input.additionalContext.prompt;
    }
    
    // Default prompt for regular analysis
    return `
      Analyze the following contract parties and determine the winner:
      
      Party A:
      - ID: ${input.partyA.id}
      - Name: ${input.partyA.name}
      - Description: ${input.partyA.description}
      
      Party B:
      - ID: ${input.partyB.id}
      - Name: ${input.partyB.name}
      - Description: ${input.partyB.description}
      
      Contract ID: ${input.contractId}
      
      Please analyze and provide:
      1. Winner (Party A or Party B)
      2. Confidence level (0-1)
      3. Reasoning for the decision
      4. Key data points considered
      
      Response format: JSON
    `;
  }

  private async callOpenAI(prompt: string): Promise<any> {
    // Check if we should use mock mode
    const apiKey = process.env.OPENAI_API_KEY;
    if (process.env.OPENAI_FALLBACK_TO_MOCK === 'true' || !apiKey || apiKey.includes('mock')) {
      logger.debug('Using mock OpenAI response (mock mode enabled)');
      return {
        winner: Math.random() > 0.5 ? 'A' : 'B',
        confidence: 0.85 + Math.random() * 0.15,
        reasoning: 'Mock analysis due to mock mode',
        dataPoints: {
          factor1: 'Mock performance metrics',
          factor2: 'Mock historical data',
          factor3: 'Mock current conditions'
        }
      };
    }
    
    try {
      logger.info('Calling OpenAI API for winner analysis');
      
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an AI oracle that analyzes parties in smart contracts and determines winners based on provided criteria. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 1, // GPT-5 only supports temperature 1
        max_completion_tokens: 8000, // Increased significantly for GPT-5 reasoning tokens + response
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      const finishReason = completion.choices[0]?.finish_reason;
      const usage = completion.usage;
      
      // Extract reasoning tokens if available (GPT-5 specific)
      const reasoningTokens = (usage as any)?.completion_tokens_details?.reasoning_tokens || 0;
      const actualCompletionTokens = usage?.completion_tokens || 0;
      const effectiveOutputTokens = actualCompletionTokens - reasoningTokens;
      
      if (!responseText) {
        logger.error('Empty response from OpenAI', {
          finishReason,
          usage,
          reasoningTokens,
          effectiveOutputTokens,
          promptLength: prompt.length,
          model: this.model
        });
        
        // Special handling for GPT-5 reasoning token exhaustion
        if (reasoningTokens >= 2000 && effectiveOutputTokens <= 0) {
          throw new Error(`GPT-5 reasoning tokens (${reasoningTokens}) consumed entire budget, no output tokens available. Consider increasing max_completion_tokens or simplifying the prompt.`);
        }
        
        throw new Error(`Empty response from OpenAI (finish_reason: ${finishReason}, reasoning_tokens: ${reasoningTokens}, total_tokens: ${usage?.total_tokens || 'unknown'})`);
      }

      if (finishReason === 'length') {
        logger.warn('OpenAI response truncated due to token limit', {
          usage,
          reasoningTokens,
          effectiveOutputTokens,
          contentLength: responseText.length
        });
        // Attempt to parse partial response
        try {
          return JSON.parse(responseText);
        } catch (parseError) {
          logger.error('Failed to parse truncated response', {
            error: parseError instanceof Error ? parseError.message : 'Unknown error',
            responsePreview: responseText.substring(0, 200),
            reasoningTokens,
            effectiveOutputTokens
          });
          throw new Error(`Response truncated and unparseable (reasoning_tokens: ${reasoningTokens}, effective_output: ${effectiveOutputTokens})`);
        }
      }

      logger.info('Received response from OpenAI', {
        finishReason,
        tokensUsed: usage?.total_tokens,
        reasoningTokens,
        effectiveOutputTokens,
        responseLength: responseText.length
      });
      
      return JSON.parse(responseText);
    } catch (error) {
      logger.error('OpenAI API call failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        model: this.model,
        promptLength: prompt.length
      });
      
      if (process.env.OPENAI_FALLBACK_TO_MOCK === 'true') {
        logger.warn('Falling back to mock response');
        return {
          winner: Math.random() > 0.5 ? 'A' : 'B',
          confidence: 0.85 + Math.random() * 0.15,
          reasoning: 'Mock analysis due to API failure',
          dataPoints: {
            factor1: 'Mock performance metrics',
            factor2: 'Mock historical data',
            factor3: 'Mock current conditions'
          }
        };
      }
      
      throw error;
    }
  }

  private parseResponse(response: any): any {
    return response;
  }

  private determineWinner(input: AIAnalysisInput, analysis: any): string {
    return analysis.winner === 'A' ? input.partyA.id : input.partyB.id;
  }
}