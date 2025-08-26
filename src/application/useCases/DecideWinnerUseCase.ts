import { injectable, inject } from 'inversify';
import { Mutex } from 'async-mutex';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { IAIService } from '../../domain/services/IAIService';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { OracleDecision } from '../../domain/entities/OracleDecision';
import { ContractStatus } from '../../domain/entities/Contract';
import { Choice, ChoiceConverter } from '../../domain/entities/Choice';
import { logger } from '../../infrastructure/logging/Logger';

export interface DecideWinnerInput {
  contractId: string;
}

export interface DecideWinnerOutput {
  success: boolean;
  decisionId?: string;
  winnerId?: string;
  transactionHash?: string;
  error?: string;
}

@injectable()
export class DecideWinnerUseCase {
  private contractMutexes: Map<string, Mutex> = new Map();

  constructor(
    @inject('IContractRepository') private contractRepository: IContractRepository,
    @inject('IOracleDecisionRepository') private decisionRepository: IOracleDecisionRepository,
    @inject('IAIService') private aiService: IAIService,
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

      const aiResult = await this.aiService.analyzeAndDecideWinner({
        partyA: contract.partyA,
        partyB: contract.partyB,
        contractId: contract.id
      });

      const decision = new OracleDecision(
        this.generateDecisionId(),
        contract.id,
        aiResult.winnerId,
        aiResult.metadata
      );

      await this.decisionRepository.save(decision);

      // Convert winnerId to Choice enum for blockchain submission
      const winnerChoice = ChoiceConverter.fromPartyId(
        aiResult.winnerId,
        contract.partyA.id,
        contract.partyB.id
      );

      if (winnerChoice === Choice.NONE) {
        throw new Error('Invalid winner ID: must be either party A or party B');
      }

      const txHash = await this.blockchainService.declareWinner(
        contract.id,
        winnerChoice
      );

      contract.setWinner(aiResult.winnerId);
      await this.contractRepository.update(contract);

      logger.info('Winner decision completed successfully', { 
        contractId: input.contractId,
        winnerId: aiResult.winnerId,
        transactionHash: txHash
      });

      return {
        success: true,
        decisionId: decision.id,
        winnerId: aiResult.winnerId,
        transactionHash: txHash
      };
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
}