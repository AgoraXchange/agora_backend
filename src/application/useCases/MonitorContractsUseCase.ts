import { injectable, inject } from 'inversify';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { DecideWinnerUseCase } from './DecideWinnerUseCase';
import { Contract, ContractStatus } from '../../domain/entities/Contract';
import { Party } from '../../domain/entities/Party';
import { ContractEventData, BetPlacedEvent } from '../../domain/entities/BettingStats';
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
        partyA: event.partyA,
        partyB: event.partyB
      });

      // Create Party entities with simplified data
      const partyA = new Party(
        `party_a_${event.contractId}`,
        '', // address will be retrieved from blockchain if needed
        event.partyA,  // Simple string name from contract
        event.partyA   // Using name as description for now
      );

      const partyB = new Party(
        `party_b_${event.contractId}`,
        '', // address will be retrieved from blockchain if needed  
        event.partyB,  // Simple string name from contract
        event.partyB   // Using name as description for now
      );

      // Create Contract entity
      const contract = new Contract(
        event.contractId,
        event.transactionHash, // Using transaction hash as contract address for now
        partyA,
        partyB,
        new Date(event.bettingEndTime * 1000), // Convert Unix timestamp to Date
        10, // Default winner reward percentage - should be retrieved from getContract()
        ContractStatus.CREATED,
        undefined, // no winner yet
        event.creator,
        undefined, // topic not in smart contract event
        undefined  // description not in smart contract event
      );

      // Save contract to repository
      await this.contractRepository.save(contract);
      
      logger.info('Contract saved from blockchain event', { 
        contractId: event.contractId,
        creator: event.creator,
        partyA: event.partyA,
        partyB: event.partyB
      });

      // Start listening for bet placed events for this contract
      this.blockchainService.listenToBetPlaced(
        event.transactionHash, // Using transaction hash as contract address
        (betEvent: BetPlacedEvent) => {
          this.handleBetPlaced(betEvent);
        }
      );

    } catch (error) {
      logger.error('Error processing ContractCreated event', {
        contractId: event.contractId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private handleBetPlaced(event: BetPlacedEvent): void {
    logger.info('Bet placed event received', {
      contractId: event.contractId,
      bettor: event.bettor,
      choice: event.choice,
      amount: event.amount
    });

    // Here you could update betting statistics or trigger other business logic
    // For now, we'll just log the event
  }
}