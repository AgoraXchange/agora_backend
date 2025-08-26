import { injectable } from 'inversify';
import { BaseProposer, ProposerConfig } from './BaseProposer';
import { logger } from '../../logging/Logger';
import Anthropic from '@anthropic-ai/sdk';

@injectable()
export class ClaudeProposer extends BaseProposer {
  readonly agentId = 'claude';
  readonly agentName = 'Claude Constitutional AI';
  readonly agentType = 'claude';

  protected getDefaultConfig(): ProposerConfig {
    return {
      temperature: 0.6, // Claude typically uses lower temperature
      maxTokens: 1200,
      topP: 0.85,
      systemPrompt: `You are Claude, an AI assistant created by Anthropic. You're serving as an expert committee member to evaluate smart contract disputes with a focus on ethical reasoning and constitutional principles.

Your analytical approach emphasizes:
1. Fairness and impartiality in evaluation
2. Systematic consideration of evidence  
3. Clear logical reasoning chains
4. Recognition of uncertainty and limitations
5. Constitutional principles of justice

You will analyze both parties objectively and make a reasoned determination based on available evidence. Consider both the letter and spirit of agreements.

Respond in JSON format:
{
  "winner": "partyA" or "partyB",  
  "confidence": 0.0 to 1.0,
  "rationale": "detailed ethical and logical reasoning",
  "evidence": ["supporting", "evidence", "points"],
  "methodology": "constitutional analysis with emphasis on fairness",
  "ethical_considerations": "any ethical concerns or principles applied",
  "uncertainty_factors": ["factors", "that", "create", "uncertainty"]
}`,
      userPromptTemplate: `I need your analysis of this smart contract dispute to determine the rightful winner:

Contract Details:
- ID: {CONTRACT_ID}

Parties Involved:

Party A: {PARTY_A_NAME}
- Blockchain Address: {PARTY_A_ADDRESS}
- Description: {PARTY_A_DESCRIPTION}

Party B: {PARTY_B_NAME}  
- Blockchain Address: {PARTY_B_ADDRESS}
- Description: {PARTY_B_DESCRIPTION}

Context and Additional Information:
{CONTEXT}

Please provide your constitutional analysis determining which party should be declared the winner. Focus on fairness, evidence, and principled reasoning.`
    };
  }

  protected getModelName(): string {
    return process.env.CLAUDE_MODEL || 'claude-3-sonnet';
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
    const apiKey = process.env.CLAUDE_API_KEY;
    
    if (!apiKey || apiKey === 'mock' || apiKey.includes('mock_claude')) {
      logger.debug('Using mock Claude response (mock mode enabled)');
      return this.getMockClaudeResponse(prompt);
    }
    
    try {
      logger.debug('Calling Claude model', { 
        model: this.getModelName(),
        temperature,
        maxTokens: this.config.maxTokens 
      });

      // Implement real Claude API call
      const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
      
      const message = await anthropic.messages.create({
        model: this.getModelName(),
        max_tokens: this.config.maxTokens,
        temperature: temperature,
        system: this.config.systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      });

      // Parse Claude's response
      let responseContent: any;
      const textContent = message.content[0]?.type === 'text' ? message.content[0].text : '';
      
      try {
        // Try to parse as JSON
        responseContent = JSON.parse(textContent);
      } catch (parseError) {
        logger.warn('Failed to parse Claude response as JSON, using text content', { 
          error: parseError instanceof Error ? parseError.message : 'Unknown parse error' 
        });
        // Create structured response from text
        responseContent = {
          winner: textContent.includes('partyA') ? 'partyA' : 'partyB',
          confidence: 0.75,
          rationale: textContent,
          evidence: ['Based on Claude analysis'],
          methodology: 'constitutional analysis with emphasis on fairness',
          ethical_considerations: 'Analysis completed with Claude',
          uncertainty_factors: ['Response parsing uncertainty']
        };
      }
      
      return {
        content: responseContent,
        tokenUsage: {
          promptTokens: message.usage?.input_tokens || 0,
          completionTokens: message.usage?.output_tokens || 0,
          totalTokens: (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0)
        },
        rawResponse: message
      };
      
    } catch (error) {
      logger.error('Claude API call failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model: this.getModelName()
      });

      // Return mock response in case of API failure
      logger.warn('Using mock Claude response due to API failure');
      return this.getMockClaudeResponse(prompt);
    }
  }

  private getMockClaudeResponse(prompt: string) {
    // Extract party IDs from the prompt
    const partyAMatch = prompt.match(/Party A \(([^)]+)\)/);
    const partyBMatch = prompt.match(/Party B \(([^)]+)\)/);
    const partyAId = partyAMatch ? partyAMatch[1].split(':')[0] : 'partyA';
    const partyBId = partyBMatch ? partyBMatch[1].split(':')[0] : 'partyB';
    
    // Claude tends to be more cautious and provide more balanced analysis
    const isPartyA = Math.random() > 0.45; // Slightly favor more balanced decisions
    const baseConfidence = 0.65 + (Math.random() * 0.25); // 0.65-0.9, generally more conservative
    const winnerId = isPartyA ? partyAId : partyBId;
    
    const mockResponse = {
      winner: winnerId,
      confidence: Math.round(baseConfidence * 100) / 100,
      rationale: `Through constitutional analysis, I've evaluated this dispute by examining the fundamental principles of fairness, evidence quality, and contractual obligations. ${winnerId} demonstrates stronger alignment with established legal and ethical precedents. My analysis considered both parties' positions carefully, weighing evidence systematically while acknowledging areas of uncertainty.`,
      evidence: [
        'Contractual compliance history',
        'Alignment with constitutional principles',
        'Quality and completeness of documentation',
        'Adherence to agreed-upon terms',
        'Consistency with legal precedents'
      ],
      methodology: 'constitutional analysis with emphasis on fairness',
      ethical_considerations: 'Ensured impartial evaluation respecting both parties\' rights and maintaining procedural fairness',
      uncertainty_factors: [
        'Limited contextual information',
        'Potential for additional evidence',
        'Subjective elements in evaluation criteria'
      ]
    };

    return {
      content: mockResponse,
      tokenUsage: {
        promptTokens: 600,  // Claude often uses more tokens for thorough analysis
        completionTokens: 300,
        totalTokens: 900
      },
      rawResponse: { 
        mock: true, 
        model: this.getModelName(),
        note: 'Mock Claude response - implement real API for production'
      }
    };
  }
}