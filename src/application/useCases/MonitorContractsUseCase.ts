import { injectable, inject } from 'inversify';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { DecideWinnerUseCase } from './DecideWinnerUseCase';
import { Contract, ContractStatus } from '../../domain/entities/Contract';
import { Party } from '../../domain/entities/Party';
import { ContractEventData, BetPlacedEvent } from '../../domain/entities/BettingStats';
import { logger } from '../../infrastructure/logging/Logger';
import { DecisionCoordinator } from '../../infrastructure/coordination/DecisionCoordinator';

@injectable()
export class MonitorContractsUseCase {
  private isEventListenerInitialized = false;

  constructor(
    @inject('IContractRepository') private contractRepository: IContractRepository,
    @inject('IBlockchainService') private blockchainService: IBlockchainService,
    @inject('DecideWinnerUseCase') private decideWinnerUseCase: DecideWinnerUseCase,
    @inject('IOracleDecisionRepository') private decisionRepository: IOracleDecisionRepository,
    @inject('DecisionCoordinator') private coordinator: DecisionCoordinator
  ) {}

  async execute(): Promise<void> {
    // Initialize event listeners on first execution
    if (!this.isEventListenerInitialized) {
      this.initializeEventListeners();
      this.isEventListenerInitialized = true;
    }

    // Step 1: Close betting on contracts whose deadline has passed (status 0 -> 1 on-chain)
    try {
      const contractsToClose = await this.contractRepository.findContractsToClose();
      for (const contract of contractsToClose) {
        let onchainStatus: number | null = null;
        try {
          // Try to read on-chain status (best effort)
          const onchain = await this.blockchainService.getContract(contract.id);
          onchainStatus = onchain.status;
        } catch (readError) {
          logger.warn('Could not read on-chain contract for close check, proceeding to close (best effort)', {
            contractId: contract.id,
            error: readError instanceof Error ? readError.message : 'Unknown error'
          });
        }

        try {
          if (onchainStatus === null || onchainStatus === 0) {
            logger.info('Closing betting for contract (deadline passed)', { contractId: contract.id });
            await this.blockchainService.closeBetting(contract.id);
          } else {
            logger.info('On-chain already closed, syncing local status', { contractId: contract.id, onchainStatus });
          }
        } catch (closeError) {
          logger.error('Failed to submit closeBetting on-chain', {
            contractId: contract.id,
            error: closeError instanceof Error ? closeError.message : 'Unknown error'
          });
        }

        // Update local status so server-side logic advances; FE still relies on chain state
        try {
          contract.status = ContractStatus.BETTING_CLOSED;
          await this.contractRepository.update(contract);
        } catch (updateError) {
          logger.error('Failed to update local status to BETTING_CLOSED', {
            contractId: contract.id,
            error: updateError instanceof Error ? updateError.message : 'Unknown error'
          });
        }
      }
    } catch (error) {
      logger.error('Error while scanning contracts to close betting', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Step 2: Monitor existing contracts ready for decision
    const contractsReadyForDecision = await this.contractRepository.findContractsReadyForDecision();
    for (const contract of contractsReadyForDecision) {
      // Skip if a decision already exists (avoids noisy repeated attempts)
      const existingDecision = await this.decisionRepository.findByContractId(contract.id);
      if (existingDecision) {
        logger.debug('Skipping contract already decided', { contractId: contract.id });
        continue;
      }

      // Prevent duplicate work if an event/endpoint already started processing
      if (!this.coordinator.tryStart(contract.id)) {
        continue;
      }

      logger.info(`Processing contract ${contract.id} for winner decision`);
      const result = await this.decideWinnerUseCase.execute({ contractId: contract.id });
      if (result.success) {
        logger.info(`Winner decided for contract ${contract.id}: ${result.winnerId}`, {
          contractId: contract.id,
          winnerId: result.winnerId,
          transactionHash: result.transactionHash
        });
      } else {
        // Downgrade to debug for already-decided noise
        const isAlreadyDecided = result.error === 'Winner already decided for this contract';
        const logFn = isAlreadyDecided ? logger.debug.bind(logger) : logger.error.bind(logger);
        logFn(`Failed to decide winner for contract ${contract.id}: ${result.error}`, {
          contractId: contract.id,
          error: result.error
        });
      }

      // Always finish with cooldown to absorb flapping
      this.coordinator.finish(contract.id);
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
