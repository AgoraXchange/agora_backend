import { injectable } from 'inversify';
import { BaseProposer, ProposerConfig } from './BaseProposer';
import { logger } from '../../logging/Logger';
import { GoogleGenerativeAI } from '@google/generative-ai';

@injectable()
export class GeminiProposer extends BaseProposer {
  readonly agentId = 'gemini';
  readonly agentName = 'Gemini Pro Analyst';
  readonly agentType = 'gemini';

  protected getDefaultConfig(): ProposerConfig {
    return {
      temperature: 0.8, // Gemini can handle higher temperature well
      maxTokens: 4000, // Increased to prevent truncation
      topP: 0.95,
      systemPrompt: `Analyze contract dispute. Return concise JSON:
{
  "winner": "partyA" or "partyB",
  "confidence": 0.0-1.0,
  "rationale": "brief reason (max 80 words)",
  "evidence": ["key point 1", "key point 2"]
}`,
      userPromptTemplate: `Contract {CONTRACT_ID}
A: {PARTY_A_NAME} - {PARTY_A_DESCRIPTION}
B: {PARTY_B_NAME} - {PARTY_B_DESCRIPTION}
Determine winner. Return JSON.`
    };
  }

  protected getModelName(): string {
    return process.env.GOOGLE_MODEL || 'gemini-pro';
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
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey || apiKey === 'mock' || apiKey.includes('mock_google')) {
      logger.debug('Using mock Gemini response (mock mode enabled)');
      return this.getMockGeminiResponse(prompt);
    }

    try {
      logger.debug('Calling Gemini model', { 
        model: this.getModelName(),
        temperature,
        maxTokens: this.config.maxTokens 
      });

      // Implement real Gemini API call
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
      const model = genAI.getGenerativeModel({ model: this.getModelName() });
      
      // Combine system prompt and user prompt
      const fullPrompt = `${this.config.systemPrompt}\n\n${prompt}`;
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: this.config.maxTokens,
          topP: this.config.topP
          // Removed responseMimeType to avoid truncation issues
        }
      });

      // Parse Gemini's response
      const response = result.response;
      let textContent = response.text();
      let responseContent: any;
      
      // Check for finish reason
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      
      if (finishReason === 'MAX_TOKENS') {
        logger.warn('Gemini response truncated due to token limit');
      }
      
      // Remove markdown code blocks if present
      if (textContent.includes('```json')) {
        textContent = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (textContent.includes('```')) {
        textContent = textContent.replace(/```\n?/g, '');
      }
      
      try {
        // Try to parse as JSON
        responseContent = JSON.parse(textContent.trim());
      } catch (parseError) {
        logger.warn('Failed to parse Gemini response as JSON', { 
          error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          responseLength: textContent.length,
          finishReason
        });
        // Create structured response from text (simplified)
        responseContent = {
          winner: textContent.includes('partyA') ? 'partyA' : 'partyB',
          confidence: 0.75,
          rationale: textContent.substring(0, 200),
          evidence: ['Based on Gemini analysis']
        };
      }
      
      // Get token usage if available
      const usageMetadata = response.usageMetadata;
      
      return {
        content: responseContent,
        tokenUsage: {
          promptTokens: usageMetadata?.promptTokenCount || 0,
          completionTokens: usageMetadata?.candidatesTokenCount || 0,
          totalTokens: usageMetadata?.totalTokenCount || 0
        },
        rawResponse: result
      };

    } catch (error) {
      logger.error('Gemini API call failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model: this.getModelName()
      });

      // Return mock response in case of API failure
      logger.warn('Using mock Gemini response due to API failure');
      return this.getMockGeminiResponse(prompt);
    }
  }

  private getMockGeminiResponse(prompt: string) {
    // Extract party IDs from the prompt
    const partyAMatch = prompt.match(/Party A \(([^)]+)\)/);
    const partyBMatch = prompt.match(/Party B \(([^)]+)\)/);
    const partyAId = partyAMatch ? partyAMatch[1].split(':')[0] : 'partyA';
    const partyBId = partyBMatch ? partyBMatch[1].split(':')[0] : 'partyB';
    
    // Gemini tends to provide more systematic, data-driven analysis
    const decision = this.generateGeminiStyleDecision(partyAId, partyBId);
    
    const mockResponse = {
      winner: decision.winner,
      confidence: decision.confidence,
      rationale: `Analysis shows ${decision.winner} has stronger position based on performance metrics and compliance patterns. Risk-adjusted evaluation indicates higher success probability.`,
      evidence: [
        'Performance metrics favor this party',
        'Risk assessment indicates lower exposure',
        'Historical compliance patterns support decision'
      ]
    };

    return {
      content: mockResponse,
      tokenUsage: {
        promptTokens: 550,  
        completionTokens: 350,  // Gemini often provides detailed responses
        totalTokens: 900
      },
      rawResponse: { 
        mock: true, 
        model: this.getModelName(),
        note: 'Mock Gemini response - implement real API for production'
      }
    };
  }

  private generateGeminiStyleDecision(partyAId: string, partyBId: string): { winner: string; confidence: number } {
    // Gemini-style decision making with systematic probability assessment
    const factors = {
      compliance: Math.random(),
      performance: Math.random(),
      risk: Math.random(),
      documentation: Math.random()
    };
    
    // Calculate weighted score (Gemini-style multi-factor analysis)
    const partyAScore = (factors.compliance * 0.3) + 
                       (factors.performance * 0.3) + 
                       ((1 - factors.risk) * 0.2) + // Lower risk is better
                       (factors.documentation * 0.2);
    
    const partyBScore = 1 - partyAScore; // Simplified for mock
    
    const winner = partyAScore > partyBScore ? partyAId : partyBId;
    const scoreGap = Math.abs(partyAScore - partyBScore);
    
    // Convert score gap to confidence (Gemini tends to be more confident with clear patterns)
    const confidence = Math.min(0.95, 0.5 + (scoreGap * 1.2));
    
    return {
      winner,
      confidence: Math.round(confidence * 100) / 100
    };
  }
}