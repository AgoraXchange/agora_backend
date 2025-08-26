import { injectable, inject } from 'inversify';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { DecideWinnerUseCase } from './DecideWinnerUseCase';
import { Contract, ContractStatus } from '../../domain/entities/Contract';
import { Party } from '../../domain/entities/Party';
import { ContractEventData, BetRevealedEvent } from '../../domain/entities/BettingStats';
import { logger } from '../../infrastructure/logging/Logger';

@injectable()
export class MonitorContractsUseCase {
  private isEventListenerInitialized = false;

  constructor(
    @inject('IContractRepository') private contractRepository: IContractRepository,
    @inject('IBlockchainService') private blockchainService: IBlockchainService,
    @inject('DecideWinnerUseCase') private decideWinnerUseCase: DecideWinnerUseCase
  ) {}

  async execute(): Promise<void> {
    // Initialize event listeners on first execution
    if (!this.isEventListenerInitialized) {
      this.initializeEventListeners();
      this.isEventListenerInitialized = true;
    }

    // Monitor existing contracts ready for decision
    const contractsReadyForDecision = await this.contractRepository.findContractsReadyForDecision();
    
    for (const contract of contractsReadyForDecision) {
      logger.info(`Processing contract ${contract.id} for winner decision`);
      
      const result = await this.decideWinnerUseCase.execute({
        contractId: contract.id
      });
      
      if (result.success) {
        logger.info(`Winner decided for contract ${contract.id}: ${result.winnerId}`, {
          contractId: contract.id,
          winnerId: result.winnerId,
          transactionHash: result.transactionHash
        });
      } else {
        logger.error(`Failed to decide winner for contract ${contract.id}: ${result.error}`, {
          contractId: contract.id,
          error: result.error
        });
      }
    }
  }

  private initializeEventListeners(): void {
    logger.info('Initializing blockchain event listeners');
    
    // Listen for new contract creation events
    this.blockchainService.listenToContractCreated((event: ContractEventData) => {
      this.handleContractCreated(event);
    });

    logger.info('Blockchain event listeners initialized');
  }

  private async handleContractCreated(event: ContractEventData): Promise<void> {
    try {
      logger.info('Processing ContractCreated event', { 
        contractId: event.contractId,
        topic: event.topic 
      });

      // Create Party entities
      const partyA = new Party(
        event.partyAInfo.id,
        '', // address will be retrieved from blockchain if needed
        event.partyAInfo.name,
        event.partyAInfo.description
      );

      const partyB = new Party(
        event.partyBInfo.id,
        '', // address will be retrieved from blockchain if needed
        event.partyBInfo.name,
        event.partyBInfo.description
      );

      // Create Contract entity
      const contract = new Contract(
        event.contractId,
        event.transactionHash, // Using transaction hash as contract address for now
        partyA,
        partyB,
        new Date(event.bettingEndTime * 1000), // Convert Unix timestamp to Date
        100, // Default winner reward percentage, should be retrieved from blockchain
        ContractStatus.CREATED,
        undefined, // no winner yet
        event.creator,
        event.topic,
        event.description
      );

      // Save contract to repository
      await this.contractRepository.save(contract);
      
      logger.info('Contract saved from blockchain event', { 
        contractId: event.contractId,
        creator: event.creator,
        topic: event.topic
      });

      // Start listening for bet revealed events for this contract
      this.blockchainService.listenToBetRevealed(
        event.transactionHash, // Using transaction hash as contract address
        (betEvent: BetRevealedEvent) => {
          this.handleBetRevealed(betEvent);
        }
      );

    } catch (error) {
      logger.error('Error processing ContractCreated event', {
        contractId: event.contractId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private handleBetRevealed(event: BetRevealedEvent): void {
    logger.info('Bet revealed event received', {
      contractId: event.contractId,
      bettor: event.bettor,
      choice: event.choice,
      amount: event.amount
    });

    // Here you could update betting statistics or trigger other business logic
    // For now, we'll just log the event
  }
}