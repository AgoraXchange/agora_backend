import { injectable } from 'inversify';
import { IAgentService, AgentAnalysisInput } from '../../../domain/services/IAgentService';
import { AgentProposal } from '../../../domain/entities/AgentProposal';
import { ProposalMetadata } from '../../../domain/valueObjects/ProposalMetadata';
import { logger } from '../../logging/Logger';

export interface ProposerConfig {
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt: string;
  userPromptTemplate: string;
}

@injectable()
export abstract class BaseProposer implements IAgentService {
  protected performanceWeight: number = 1.0;
  protected config: ProposerConfig;

  abstract readonly agentId: string;
  abstract readonly agentName: string;
  abstract readonly agentType: string;

  constructor() {
    this.config = this.getDefaultConfig();
  }

  async generateProposals(input: AgentAnalysisInput, count: number): Promise<AgentProposal[]> {
    const proposals: AgentProposal[] = [];
    
    for (let i = 0; i < count; i++) {
      try {
        const startTime = Date.now();
        
        // Add variation for multiple proposals
        const temperature = this.config.temperature + (i * 0.1);
        const modifiedInput = { ...input, temperature: Math.min(temperature, 1.0) };
        
        const proposal = await this.generateSingleProposal(modifiedInput, i);
        proposals.push(proposal);
        
        const processingTime = Date.now() - startTime;
        logger.debug(`${this.agentName} generated proposal ${i + 1}/${count}`, {
          proposalId: proposal.id,
          winner: proposal.winnerId,
          confidence: proposal.confidence,
          processingTimeMs: processingTime
        });
        
      } catch (error) {
        logger.error(`${this.agentName} failed to generate proposal ${i + 1}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return proposals;
  }

  getPerformanceWeight(): number {
    return this.performanceWeight;
  }

  updatePerformanceWeight(newWeight: number): void {
    this.performanceWeight = Math.max(0.1, Math.min(1.0, newWeight));
    logger.info(`Updated performance weight for ${this.agentName}`, {
      agentId: this.agentId,
      oldWeight: this.performanceWeight,
      newWeight: newWeight
    });
  }

  protected async generateSingleProposal(
    input: AgentAnalysisInput, 
    index: number
  ): Promise<AgentProposal> {
    const startTime = Date.now();
    
    // Create the analysis prompt
    const prompt = this.createAnalysisPrompt(input);
    
    // Get AI response
    const response = await this.callAIModel(prompt, input.temperature || this.config.temperature);
    
    const processingTime = Date.now() - startTime;
    
    // Parse the response
    const parsedResponse = this.parseAIResponse(response, input);
    
    // Create metadata
    const metadata = new ProposalMetadata(
      input.temperature || this.config.temperature,
      input.maxTokens || this.config.maxTokens,
      response.tokenUsage,
      processingTime,
      this.getModelName(),
      prompt,
      'committee_deliberation',
      {
        topP: this.config.topP,
        frequencyPenalty: this.config.frequencyPenalty,
        presencePenalty: this.config.presencePenalty
      },
      response.rawResponse
    );

    // Create proposal
    const proposalId = `${this.agentId}_${input.contractId}_${Date.now()}_${index}`;
    
    return new AgentProposal(
      proposalId,
      this.agentId,
      this.agentName,
      input.contractId,
      parsedResponse.winnerId,
      parsedResponse.confidence,
      parsedResponse.rationale,
      parsedResponse.evidence,
      metadata
    );
  }

  protected createAnalysisPrompt(input: AgentAnalysisInput): string {
    const userPrompt = this.config.userPromptTemplate
      .replace('{CONTRACT_ID}', input.contractId)
      .replace('{PARTY_A_NAME}', input.partyA.name)
      .replace('{PARTY_A_ADDRESS}', input.partyA.address)
      .replace('{PARTY_A_DESCRIPTION}', input.partyA.description)
      .replace('{PARTY_B_NAME}', input.partyB.name)
      .replace('{PARTY_B_ADDRESS}', input.partyB.address)
      .replace('{PARTY_B_DESCRIPTION}', input.partyB.description)
      .replace('{CONTEXT}', JSON.stringify(input.context || {}));

    return `${this.config.systemPrompt}\n\nUser: ${userPrompt}`;
  }

  protected parseAIResponse(response: any, input: AgentAnalysisInput): {
    winnerId: string;
    confidence: number;
    rationale: string;
    evidence: string[];
  } {
    try {
      // Try to parse as JSON first
      let parsedContent: any;
      
      if (typeof response.content === 'string') {
        // Look for JSON in the response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } else {
        parsedContent = response.content;
      }

      // Map winner to actual party ID
      let winnerId = parsedContent.winner || parsedContent.winnerId;
      if (winnerId === 'partyA' || winnerId === 'A') {
        winnerId = input.partyA.id;
      } else if (winnerId === 'partyB' || winnerId === 'B') {
        winnerId = input.partyB.id;
      } else if (!winnerId) {
        winnerId = input.partyA.id; // Default to party A if no winner specified
      }
      
      return {
        winnerId,
        confidence: parsedContent.confidence || 0.5,
        rationale: parsedContent.rationale || parsedContent.reasoning || 'No rationale provided',
        evidence: Array.isArray(parsedContent.evidence) ? parsedContent.evidence : 
                 Array.isArray(parsedContent.citations) ? parsedContent.citations :
                 []
      };
      
    } catch (error) {
      logger.warn(`Failed to parse structured response from ${this.agentName}, using fallback`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback parsing
      return this.fallbackResponseParsing(response.content, input);
    }
  }

  protected fallbackResponseParsing(content: string, input: AgentAnalysisInput): {
    winnerId: string;
    confidence: number;
    rationale: string;
    evidence: string[];
  } {
    // Simple fallback parsing logic
    const isPartyA = content.toLowerCase().includes('party a') || content.toLowerCase().includes('partya');
    const isPartyB = content.toLowerCase().includes('party b') || content.toLowerCase().includes('partyb');
    
    let winnerId = input.partyA.id; // Default to party A
    if (isPartyB && !isPartyA) {
      winnerId = input.partyB.id;
    }
    
    // Extract confidence if mentioned
    const confidenceMatch = content.match(/confidence[:\s]+([0-9.]+)/i);
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.6;
    
    return {
      winnerId,
      confidence: Math.min(Math.max(confidence, 0), 1),
      rationale: content.slice(0, 1000), // Take first 1000 chars as rationale
      evidence: []
    };
  }

  // Abstract methods to be implemented by subclasses
  protected abstract callAIModel(prompt: string, temperature: number): Promise<{
    content: any;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    rawResponse: any;
  }>;

  protected abstract getModelName(): string;
  protected abstract getDefaultConfig(): ProposerConfig;
}