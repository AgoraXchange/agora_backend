import { injectable, inject } from 'inversify';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
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
    @inject('DecideWinnerUseCase') private decideWinnerUseCase: DecideWinnerUseCase,
    @inject('IOracleDecisionRepository') private decisionRepository: IOracleDecisionRepository
  ) {}

  async execute(): Promise<void> {
    // Initialize event listeners on first execution
    if (!this.isEventListenerInitialized) {
      this.initializeEventListeners();
      this.isEventListenerInitialized = true;
    }

    logger.debug('Running monitoring cycle...');

    try {
      // 1. Update contract statuses from blockchain (may trigger oracle immediately)
      const triggeredThisCycle = await this.updateContractStatuses();
      const triggeredSet = triggeredThisCycle ?? new Set<string>();

      // 2. Monitor existing contracts ready for decision
      let contractsReadyForDecision = await this.contractRepository.findContractsReadyForDecision();
      // Avoid duplicate triggers within the same cycle (guard against undefined)
      if (triggeredSet.size > 0) {
        contractsReadyForDecision = contractsReadyForDecision.filter(c => !triggeredSet.has(c.id));
      }
      
      if (contractsReadyForDecision.length > 0) {
        logger.info(`Found ${contractsReadyForDecision.length} contracts ready for decision`);
      }
      
      for (const contract of contractsReadyForDecision) {
        // Skip if decision already exists (avoid repeated attempts within/ across cycles)
        try {
          const existing = await this.decisionRepository.findByContractId(contract.id);
          if (existing) {
            logger.debug('Skipping decision - already exists in repository', { contractId: contract.id });
            continue;
          }
        } catch (_) {}

        // Double-check on-chain status to avoid calling oracle when not closed
        try {
          const chain = await this.blockchainService.getContract(contract.id);
          if (chain.status !== 1) { // 1 = Closed (ABBetting)
            logger.debug('Skipping decision - on-chain status not closed', { contractId: contract.id, chainStatus: chain.status });
            continue;
          }
        } catch (err) {
          logger.warn('Failed to verify on-chain status before decision, proceeding cautiously', { contractId: contract.id, error: err instanceof Error ? err.message : 'Unknown error' });
        }
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

    // Listen to main contract events
    this.blockchainService.listenToBetPlacedGlobal((event: BetPlacedEvent) => {
      this.handleBetPlaced(event);
    });

    this.blockchainService.listenToWinnerDeclared((event) => {
      logger.info('WinnerDeclared event received', {
        contractId: event.contractId,
        winner: event.winner,
        blockNumber: event.blockNumber
      });
    });

    this.blockchainService.listenToRewardsDistributed((event) => {
      logger.info('RewardsDistributed event received', {
        contractId: event.contractId,
        partyReward: event.partyReward,
        platformFee: event.platformFee,
        totalDistributed: event.totalDistributed,
        blockNumber: event.blockNumber
      });
    });

    this.blockchainService.listenToRewardClaimed((event) => {
      logger.info('RewardClaimed event received', {
        contractId: event.contractId,
        bettor: event.bettor,
        amount: event.amount,
        blockNumber: event.blockNumber
      });
    });

    this.blockchainService.listenToContractCancelled((event) => {
      logger.info('ContractCancelled event received', {
        contractId: event.contractId,
        blockNumber: event.blockNumber
      });
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
  private async updateContractStatuses(): Promise<Set<string>> {
    const triggered = new Set<string>();
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

          // NOTE: We do not proactively call closeBetting on-chain here.
          // Open→Closed 전용 이벤트가 없으므로 상태는 주기적 조회로만 감지합니다.

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

            // If betting just closed, trigger oracle immediately (no dedicated event on-chain)
            if (newStatus === ContractStatus.BETTING_CLOSED) {
              logger.info(`Contract ${contract.id} betting closed - triggering oracle decision now`);
              try {
                const result = await this.decideWinnerUseCase.execute({ contractId: contract.id });
                if (result.success) {
                  logger.info('Oracle decided winner after status update', { contractId: contract.id, winnerId: result.winnerId, transactionHash: result.transactionHash });
                } else {
                  logger.warn('Oracle decision failed after status update', { contractId: contract.id, error: result.error });
                }
                triggered.add(contract.id);
              } catch (err) {
                logger.warn('Oracle execution error after status update', { contractId: contract.id, error: err instanceof Error ? err.message : 'Unknown error' });
              }
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
    return triggered;
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
