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
    this.model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
  }

  async analyzeAndDecideWinner(input: AIAnalysisInput): Promise<AIAnalysisResult> {
    try {
      const prompt = this.buildPrompt(input);
      const response = await this.callOpenAI(prompt);
      
      const analysis = this.parseResponse(response);
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
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content;
      
      if (!responseText) {
        throw new Error('Empty response from OpenAI');
      }

      logger.info('Received response from OpenAI');
      
      return JSON.parse(responseText);
    } catch (error) {
      logger.error('OpenAI API call failed', { error: error.message });
      
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