import { injectable, inject } from 'inversify';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { DecideWinnerUseCase } from './DecideWinnerUseCase';
import { Contract, ContractStatus, mapChainStatusToContractStatus } from '../../domain/entities/Contract';
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

    logger.debug('Running monitoring cycle...');

    try {
      // 1. Update contract statuses from blockchain
      await this.updateContractStatuses();

      // 2. Monitor existing contracts ready for decision
      const contractsReadyForDecision = await this.contractRepository.findContractsReadyForDecision();
      
      if (contractsReadyForDecision.length > 0) {
        logger.info(`Found ${contractsReadyForDecision.length} contracts ready for decision`);
      }
      
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

      logger.debug('Monitoring cycle completed');

    } catch (error) {
      logger.error('Error during monitoring cycle', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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
        topic: event.topic,
        description: event.description,
        partyA: event.partyA,
        partyB: event.partyB
      });

      // Create Party entities with simplified data
      // Use contractId:choice format for clean blockchain integration
      const partyA = new Party(
        `${event.contractId}:1`,  // contractId:1 for Choice.A
        '', // address will be retrieved from blockchain if needed
        event.partyA,  // Simple string name from contract
        event.partyA   // Using name as description for now
      );

      const partyB = new Party(
        `${event.contractId}:2`,  // contractId:2 for Choice.B
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
        event.topic,        // topic from smart contract event
        event.description   // description from smart contract event
      );

      // Save contract to repository
      await this.contractRepository.save(contract);
      
      logger.info('Contract saved from blockchain event', { 
        contractId: event.contractId,
        creator: event.creator,
        topic: event.topic,
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

  /**
   * Updates contract statuses by querying the blockchain
   */
  private async updateContractStatuses(): Promise<void> {
    try {
      const contracts = await this.contractRepository.findAll();
      
      if (contracts.length === 0) {
        logger.debug('No contracts to update');
        return;
      }

      logger.debug(`Checking status of ${contracts.length} contracts`);

      let updatedCount = 0;
      for (const contract of contracts) {
        try {
          // Skip contracts that are already decided or distributed
          if (contract.status === ContractStatus.DECIDED || contract.status === ContractStatus.DISTRIBUTED) {
            continue;
          }

          // Get current status from blockchain
          const chainData = await this.blockchainService.getContract(contract.id);
          const newStatus = mapChainStatusToContractStatus(chainData.status);

          // Check if status has changed
          if (contract.status !== newStatus) {
            const oldStatus = contract.status;
            contract.status = newStatus;
            
            await this.contractRepository.update(contract);
            updatedCount++;

            logger.info(`Contract ${contract.id} status updated`, {
              contractId: contract.id,
              oldStatus,
              newStatus,
              chainStatus: chainData.status
            });

            // If betting just closed, trigger winner decision in next cycle
            if (newStatus === ContractStatus.BETTING_CLOSED) {
              logger.info(`Contract ${contract.id} betting closed - will be processed for winner decision`);
            }
          }

        } catch (error) {
          // Log individual contract errors but continue with others
          logger.warn(`Failed to update status for contract ${contract.id}`, {
            contractId: contract.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      if (updatedCount > 0) {
        logger.info(`Updated status for ${updatedCount} contracts`);
      } else {
        logger.debug('No contract status updates needed');
      }

    } catch (error) {
      logger.error('Error updating contract statuses', {
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