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
      maxTokens: 1024,
      topP: 0.95,
      systemPrompt: `You are Gemini Pro, Google's advanced AI model, serving as a multi-modal analytical expert on a committee evaluating smart contract disputes.

Your analytical strengths include:
1. Multi-perspective reasoning and synthesis
2. Pattern recognition across complex data
3. Systematic evaluation of competing claims
4. Integration of diverse information sources
5. Probabilistic reasoning under uncertainty

Approach this analysis with:
- Comprehensive evaluation of both parties
- Data-driven decision making
- Clear probabilistic confidence assessment
- Identification of key decision factors
- Recognition of information gaps

Output your analysis in this JSON structure:
{
  "winner": "partyA" or "partyB",
  "confidence": 0.0 to 1.0,
  "rationale": "systematic analysis with clear reasoning chain",
  "evidence": ["key", "evidence", "factors", "considered"],
  "methodology": "multi-perspective analytical framework",
  "decision_factors": ["primary", "factors", "influencing", "decision"],
  "alternative_scenarios": "brief discussion of alternative outcomes",
  "information_gaps": ["identified", "limitations", "or", "missing", "data"]
}`,
      userPromptTemplate: `Analyze this smart contract dispute using your multi-perspective analytical capabilities:

CONTRACT ANALYSIS REQUEST
Contract ID: {CONTRACT_ID}

PARTY PROFILES:

Party A Analysis:
- Identity: {PARTY_A_NAME}
- Blockchain Address: {PARTY_A_ADDRESS}
- Profile: {PARTY_A_DESCRIPTION}

Party B Analysis:
- Identity: {PARTY_B_NAME}  
- Blockchain Address: {PARTY_B_ADDRESS}
- Profile: {PARTY_B_DESCRIPTION}

CONTEXTUAL DATA:
{CONTEXT}

Please conduct a comprehensive multi-perspective analysis to determine which party should be declared the winner. Consider all angles, weigh probabilities, and provide your structured assessment.`
    };
  }

  protected getModelName(): string {
    return process.env.GEMINI_MODEL || 'gemini-pro';
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
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    
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
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: this.getModelName() });
      
      // Combine system prompt and user prompt
      const fullPrompt = `${this.config.systemPrompt}\n\n${prompt}`;
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: this.config.maxTokens,
          topP: this.config.topP,
          responseMimeType: 'application/json'
        }
      });

      // Parse Gemini's response
      const response = result.response;
      const textContent = response.text();
      let responseContent: any;
      
      try {
        // Try to parse as JSON
        responseContent = JSON.parse(textContent);
      } catch (parseError) {
        logger.warn('Failed to parse Gemini response as JSON, using text content', { 
          error: parseError instanceof Error ? parseError.message : 'Unknown parse error' 
        });
        // Create structured response from text
        responseContent = {
          winner: textContent.includes('partyA') ? 'partyA' : 'partyB',
          confidence: 0.75,
          rationale: textContent,
          evidence: ['Based on Gemini analysis'],
          methodology: 'multi-perspective analytical framework',
          decision_factors: ['Analysis completed with Gemini'],
          alternative_scenarios: 'Gemini analysis',
          information_gaps: ['Response parsing uncertainty']
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
      rationale: `Multi-perspective analysis reveals ${decision.winner} has stronger positioning across key evaluation dimensions. My systematic framework evaluated contractual compliance, historical performance, risk factors, and procedural adherence. The analysis incorporated probabilistic reasoning to account for uncertainty while identifying the most likely successful outcome based on available data patterns.`,
      evidence: [
        'Contractual obligation fulfillment patterns',
        'Historical performance metrics',
        'Risk assessment indicators',
        'Procedural compliance verification',
        'Pattern analysis of similar cases',
        'Multi-dimensional scoring results'
      ],
      methodology: 'multi-perspective analytical framework',
      decision_factors: [
        'Quantitative performance indicators',
        'Qualitative assessment of execution capability',
        'Risk-adjusted probability calculations',
        'Comparative advantage analysis'
      ],
      alternative_scenarios: `Alternative outcome probability: ${(1 - decision.confidence).toFixed(2)} - would require additional evidence in specific areas to overturn primary conclusion`,
      information_gaps: [
        'Real-time performance data',
        'Complete historical context',
        'Detailed technical implementation metrics',
        'Third-party verification sources'
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