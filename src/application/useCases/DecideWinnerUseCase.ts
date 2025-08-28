import { injectable, inject } from 'inversify';
import { Mutex } from 'async-mutex';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { IAIService } from '../../domain/services/IAIService';
import { ICommitteeService } from '../../domain/services/ICommitteeService';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { OracleDecision } from '../../domain/entities/OracleDecision';
import { ContractStatus } from '../../domain/entities/Contract';
import { Choice, ChoiceConverter } from '../../domain/entities/Choice';
import { logger } from '../../infrastructure/logging/Logger';

export interface DecideWinnerInput {
  contractId: string;
  deliberationId?: string; // For async execution with pre-generated ID
  forceCommitteeMode?: boolean; // Override environment setting
  committeeConfig?: {
    minProposals?: number;
    maxProposalsPerAgent?: number;
    consensusThreshold?: number;
    enableEarlyExit?: boolean;
  };
}

export interface DecideWinnerOutput {
  success: boolean;
  decisionId?: string;
  winnerId?: string;
  transactionHash?: string;
  error?: string;
  // Committee-specific fields
  deliberationMode?: 'single_ai' | 'committee';
  committeeMetrics?: {
    totalProposals: number;
    deliberationTimeMs: number;
    consensusLevel: number;
    costBreakdown: {
      proposerTokens: number;
      judgeTokens: number;
      synthesizerTokens: number;
      totalCostUSD: number;
    };
  };
  committeeDecisionId?: string;
}

@injectable()
export class DecideWinnerUseCase {
  private contractMutexes: Map<string, Mutex> = new Map();

  constructor(
    @inject('IContractRepository') private contractRepository: IContractRepository,
    @inject('IOracleDecisionRepository') private decisionRepository: IOracleDecisionRepository,
    @inject('IAIService') private aiService: IAIService,
    @inject('ICommitteeService') private committeeService: ICommitteeService,
    @inject('IBlockchainService') private blockchainService: IBlockchainService
  ) {}

  async execute(input: DecideWinnerInput): Promise<DecideWinnerOutput> {
    const mutex = this.getContractMutex(input.contractId);
    
    return await mutex.runExclusive(async () => {
      logger.info('Starting winner decision process', { contractId: input.contractId });
      try {
      const contract = await this.contractRepository.findById(input.contractId);
      
      if (!contract) {
        return { 
          success: false, 
          error: 'Contract not found' 
        };
      }

      if (!contract.canDecideWinner()) {
        return { 
          success: false, 
          error: 'Contract is not ready for winner decision' 
        };
      }

      const existingDecision = await this.decisionRepository.findByContractId(input.contractId);
      if (existingDecision) {
        return { 
          success: false, 
          error: 'Winner already decided for this contract' 
        };
      }

      // Determine whether to use committee or single AI mode
      const useCommittee = this.shouldUseCommitteeMode(input);
      const deliberationMode = useCommittee ? 'committee' : 'single_ai';

      logger.info('Decision mode determined', {
        contractId: input.contractId,
        mode: deliberationMode,
        forceCommittee: input.forceCommitteeMode
      });

      if (useCommittee) {
        // Committee deliberation mode
        return await this.executeCommitteeDecision(contract, input);
      } else {
        // Single AI mode (original implementation)
        return await this.executeSingleAIDecision(contract, input);
      }
    } catch (error) {
      logger.error('Winner decision failed', { 
        contractId: input.contractId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
    });
  }

  async executeAsync(input: DecideWinnerInput): Promise<void> {
    // Execute deliberation asynchronously without waiting for result
    this.execute(input).then(result => {
      if (result.success) {
        logger.info('Async deliberation completed successfully', {
          contractId: input.contractId,
          deliberationId: input.deliberationId,
          winnerId: result.winnerId
        });
      } else {
        logger.error('Async deliberation failed', {
          contractId: input.contractId,
          deliberationId: input.deliberationId,
          error: result.error
        });
      }
    }).catch(error => {
      logger.error('Async deliberation error', {
        contractId: input.contractId,
        deliberationId: input.deliberationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  }

  private getContractMutex(contractId: string): Mutex {
    let mutex = this.contractMutexes.get(contractId);
    if (!mutex) {
      mutex = new Mutex();
      this.contractMutexes.set(contractId, mutex);
    }
    return mutex;
  }

  private generateDecisionId(): string {
    return `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldUseCommitteeMode(input: DecideWinnerInput): boolean {
    // Force committee mode if explicitly requested
    if (input.forceCommitteeMode === true) {
      return true;
    }
    
    // Force single AI mode if explicitly requested
    if (input.forceCommitteeMode === false) {
      return false;
    }
    
    // Default to environment configuration
    return process.env.USE_COMMITTEE === 'true';
  }

  private async executeCommitteeDecision(contract: any, input: DecideWinnerInput): Promise<DecideWinnerOutput> {
    try {
      logger.info('Starting committee deliberation', { contractId: input.contractId });

      // Prepare committee input
      const committeeInput = {
        partyA: contract.partyA,
        partyB: contract.partyB,
        contractId: contract.id,
        deliberationId: input.deliberationId, // Pass through the pre-generated ID if available
        context: {
          contractAddress: contract.contractAddress,
          bettingEndTime: contract.bettingEndTime,
          status: contract.status,
          winnerRewardPercentage: contract.winnerRewardPercentage
        },
        ...input.committeeConfig
      };

      // Execute committee deliberation
      const committeeResult = await this.committeeService.deliberateAndDecide(committeeInput);

      // Create standard oracle decision for compatibility
      const decision = new OracleDecision(
        this.generateDecisionId(),
        contract.id,
        committeeResult.winnerId,
        {
          confidence: committeeResult.committeeDecision.consensus.confidenceLevel,
          reasoning: committeeResult.committeeDecision.consensus.synthesizedReasoning,
          dataPoints: {
            evidence: committeeResult.committeeDecision.consensus.mergedEvidence.map(e => e.source),
            deliberationMode: 'committee',
            totalProposals: committeeResult.deliberationMetrics.totalProposals,
            consensusLevel: committeeResult.deliberationMetrics.consensusLevel,
            committeeDecisionId: committeeResult.committeeDecision.id
          },
          timestamp: new Date()
        }
      );

      await this.decisionRepository.save(decision);

      // Create proof with committee information
      const proof = JSON.stringify({
        decisionId: decision.id,
        committeeDecisionId: committeeResult.committeeDecision.id,
        confidence: committeeResult.committeeDecision.consensus.confidenceLevel,
        reasoning: committeeResult.committeeDecision.consensus.synthesizedReasoning,
        deliberationMode: 'committee',
        totalAgents: committeeResult.deliberationMetrics.totalProposals,
        consensusMethod: committeeResult.committeeDecision.method,
        consensusLevel: committeeResult.deliberationMetrics.consensusLevel
      });

      // Convert winnerId to Choice enum for blockchain submission
      const winnerChoice = ChoiceConverter.fromPartyId(
        committeeResult.winnerId,
        contract.partyA.id,
        contract.partyB.id
      );

      if (winnerChoice === Choice.NONE) {
        throw new Error('Invalid winner ID: must be either party A or party B');
      }

      // Submit to blockchain using new declareWinner method
      const txHash = await this.blockchainService.declareWinner(
        contract.id,
        winnerChoice
      );

      // Update contract
      contract.setWinner(committeeResult.winnerId);
      await this.contractRepository.update(contract);

      logger.info('Committee decision completed successfully', { 
        contractId: input.contractId,
        winnerId: committeeResult.winnerId,
        totalProposals: committeeResult.deliberationMetrics.totalProposals,
        consensusLevel: committeeResult.deliberationMetrics.consensusLevel,
        deliberationTimeMs: committeeResult.deliberationMetrics.deliberationTimeMs,
        transactionHash: txHash
      });

      return {
        success: true,
        decisionId: decision.id,
        winnerId: committeeResult.winnerId,
        transactionHash: txHash,
        deliberationMode: 'committee',
        committeeMetrics: {
          totalProposals: committeeResult.deliberationMetrics.totalProposals,
          deliberationTimeMs: committeeResult.deliberationMetrics.deliberationTimeMs,
          consensusLevel: committeeResult.deliberationMetrics.consensusLevel,
          costBreakdown: {
            proposerTokens: committeeResult.deliberationMetrics.costBreakdown?.proposerTokens || 0,
            judgeTokens: committeeResult.deliberationMetrics.costBreakdown?.judgeTokens || 0,
            synthesizerTokens: committeeResult.deliberationMetrics.costBreakdown?.synthesizerTokens || 0,
            totalCostUSD: (committeeResult.deliberationMetrics.costBreakdown as any)?.totalCostUSD || 0
          }
        },
        committeeDecisionId: committeeResult.committeeDecision.id
      };

    } catch (error) {
      logger.error('Committee decision failed', {
        contractId: input.contractId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async executeSingleAIDecision(contract: any, input: DecideWinnerInput): Promise<DecideWinnerOutput> {
    try {
      logger.info('Starting single AI decision', { contractId: input.contractId });

      const aiResult = await this.aiService.analyzeAndDecideWinner({
        partyA: contract.partyA,
        partyB: contract.partyB,
        contractId: contract.id
      });

      const decision = new OracleDecision(
        this.generateDecisionId(),
        contract.id,
        aiResult.winnerId,
        {
          confidence: aiResult.metadata.confidence,
          reasoning: aiResult.metadata.reasoning,
          dataPoints: {
            ...aiResult.metadata.dataPoints,
            deliberationMode: 'single_ai'
          },
          timestamp: aiResult.metadata.timestamp
        }
      );

      await this.decisionRepository.save(decision);

      const proof = JSON.stringify({
        decisionId: decision.id,
        confidence: decision.metadata.confidence,
        reasoning: decision.metadata.reasoning,
        deliberationMode: 'single_ai'
      });

      // Convert winnerId to Choice enum for blockchain submission
      const winnerChoice = ChoiceConverter.fromPartyId(
        aiResult.winnerId,
        contract.partyA.id,
        contract.partyB.id
      );

      if (winnerChoice === Choice.NONE) {
        throw new Error('Invalid winner ID: must be either party A or party B');
      }

      // Submit to blockchain using new declareWinner method
      const txHash = await this.blockchainService.declareWinner(
        contract.id,
        winnerChoice
      );

      contract.setWinner(aiResult.winnerId);
      await this.contractRepository.update(contract);

      logger.info('Single AI decision completed successfully', { 
        contractId: input.contractId,
        winnerId: aiResult.winnerId,
        transactionHash: txHash
      });

      return {
        success: true,
        decisionId: decision.id,
        winnerId: aiResult.winnerId,
        transactionHash: txHash,
        deliberationMode: 'single_ai'
      };

    } catch (error) {
      logger.error('Single AI decision failed', {
        contractId: input.contractId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}