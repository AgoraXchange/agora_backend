import { EventEmitter } from 'events';
import { ContractEventData, BetPlacedEvent } from '../../src/domain/entities/BettingStats';
import { Contract } from '../../src/domain/entities/Contract';
import { Choice } from '../../src/domain/entities/Choice';
import { logger } from '../../src/infrastructure/logging/Logger';

export interface SimulatedTransaction {
  hash: string;
  blockNumber: number;
  gasUsed: number;
  status: 'success' | 'failed';
  timestamp: Date;
}

export interface BettingActivity {
  contractId: string;
  totalBets: number;
  totalAmount: bigint;
  partyABets: number;
  partyBBets: number;
  partyAAmount: bigint;
  partyBAmount: bigint;
}

export interface SimulationOptions {
  networkDelay?: number; // milliseconds
  failureRate?: number; // 0-1, probability of transaction failure
  gasPrice?: number; // gwei
  blockTime?: number; // seconds between blocks
  enableLogs?: boolean;
}

export class BlockchainSimulator extends EventEmitter {
  private currentBlockNumber: number = 12000000;
  private simulatedContracts: Map<string, Contract> = new Map();
  private bettingActivities: Map<string, BettingActivity> = new Map();
  private transactionHistory: SimulatedTransaction[] = [];
  private options: SimulationOptions;
  private blockTimer?: NodeJS.Timeout;

  constructor(options: SimulationOptions = {}) {
    super();
    this.options = {
      networkDelay: 2000,
      failureRate: 0.01,
      gasPrice: 20,
      blockTime: 12,
      enableLogs: true,
      ...options
    };

    if (this.options.enableLogs) {
      logger.info('🔧 Blockchain Simulator initialized', this.options);
    }

    this.startBlockProduction();
  }

  private startBlockProduction(): void {
    if (this.blockTimer) {
      clearInterval(this.blockTimer);
    }

    this.blockTimer = setInterval(() => {
      this.currentBlockNumber++;
      this.emit('newBlock', {
        blockNumber: this.currentBlockNumber,
        timestamp: new Date(),
        transactionCount: Math.floor(Math.random() * 100) + 50
      });
    }, (this.options.blockTime || 12) * 1000);
  }

  // Simulate contract creation event
  async simulateContractCreation(contract: Contract): Promise<ContractEventData> {
    await this.simulateNetworkDelay();
    
    const eventData: ContractEventData = {
      contractId: contract.id,
      creator: contract.creator || '0x1234567890123456789012345678901234567890',
      topic: contract.topic || 'Test Topic',
      description: contract.description || 'Test Description',
      partyA: contract.partyA.name,
      partyB: contract.partyB.name,
      bettingEndTime: Math.floor(contract.bettingEndTime.getTime() / 1000),
      blockNumber: this.currentBlockNumber,
      transactionHash: this.generateTransactionHash()
    };

    this.simulatedContracts.set(contract.id, contract);
    
    if (this.options.enableLogs) {
      logger.info('📋 Simulated ContractCreated event', {
        contractId: eventData.contractId,
        topic: eventData.topic
      });
    }

    // Emit event with delay to simulate blockchain confirmation time
    setTimeout(() => {
      this.emit('ContractCreated', eventData);
    }, this.options.networkDelay);

    return eventData;
  }

  // Simulate betting activity
  async simulateBetting(
    contractId: string, 
    numberOfBets: number = 10,
    betDistribution: { partyA: number; partyB: number } = { partyA: 0.5, partyB: 0.5 }
  ): Promise<BetPlacedEvent[]> {
    if (!this.simulatedContracts.has(contractId)) {
      throw new Error(`Contract ${contractId} not found in simulator`);
    }

    const events: BetPlacedEvent[] = [];
    let totalAmount = BigInt(0);
    let partyAAmount = BigInt(0);
    let partyBAmount = BigInt(0);
    let partyABets = 0;
    let partyBBets = 0;

    for (let i = 0; i < numberOfBets; i++) {
      await this.simulateNetworkDelay(100); // Shorter delay for individual bets

      const isPartyA = Math.random() < betDistribution.partyA;
      const choice = isPartyA ? 1 : 2;
      const amount = BigInt(Math.floor(Math.random() * 1000000000000000000)); // Random ETH amount in wei
      
      const event: BetPlacedEvent = {
        contractId,
        bettor: this.generateRandomAddress(),
        choice,
        amount: amount.toString(),
        blockNumber: this.currentBlockNumber + Math.floor(i / 10), // Some bets in same block
        transactionHash: this.generateTransactionHash()
      };

      events.push(event);
      totalAmount += amount;

      if (isPartyA) {
        partyAAmount += amount;
        partyABets++;
      } else {
        partyBAmount += amount;
        partyBBets++;
      }

      if (this.options.enableLogs && i % 5 === 0) {
        logger.debug('💰 Simulated bet placed', {
          contractId,
          betNumber: i + 1,
          choice: isPartyA ? 'A' : 'B',
          amount: amount.toString()
        });
      }

      // Emit event
      setTimeout(() => {
        this.emit('BetPlaced', event);
      }, i * 100); // Stagger bet events
    }

    // Store betting activity
    this.bettingActivities.set(contractId, {
      contractId,
      totalBets: numberOfBets,
      totalAmount,
      partyABets,
      partyBBets,
      partyAAmount,
      partyBAmount
    });

    if (this.options.enableLogs) {
      logger.info('🎲 Betting simulation completed', {
        contractId,
        totalBets: numberOfBets,
        partyABets,
        partyBBets,
        totalAmount: totalAmount.toString()
      });
    }

    return events;
  }

  // Simulate winner declaration transaction
  async simulateWinnerDeclaration(
    contractId: string, 
    winner: Choice,
    gasLimit: number = 150000
  ): Promise<SimulatedTransaction> {
    await this.simulateNetworkDelay();

    const transaction: SimulatedTransaction = {
      hash: this.generateTransactionHash(),
      blockNumber: this.currentBlockNumber + 1,
      gasUsed: Math.floor(gasLimit * (0.7 + Math.random() * 0.3)), // 70-100% of gas limit
      status: Math.random() < this.options.failureRate! ? 'failed' : 'success',
      timestamp: new Date()
    };

    this.transactionHistory.push(transaction);

    if (this.options.enableLogs) {
      logger.info('🏆 Simulated winner declaration', {
        contractId,
        winner: winner === Choice.A ? 'Party A' : winner === Choice.B ? 'Party B' : 'None',
        transactionHash: transaction.hash,
        status: transaction.status
      });
    }

    // Emit transaction confirmation
    setTimeout(() => {
      this.emit('TransactionConfirmed', {
        contractId,
        winner,
        transaction
      });
    }, this.options.networkDelay);

    return transaction;
  }

  // Simulate reward distribution
  async simulateRewardDistribution(contractId: string): Promise<SimulatedTransaction[]> {
    const bettingActivity = this.bettingActivities.get(contractId);
    if (!bettingActivity) {
      throw new Error(`No betting activity found for contract ${contractId}`);
    }

    const transactions: SimulatedTransaction[] = [];
    
    // Simulate multiple reward transactions to different addresses
    const numberOfRecipients = Math.min(bettingActivity.totalBets, 20); // Cap at 20 for simulation
    
    for (let i = 0; i < numberOfRecipients; i++) {
      await this.simulateNetworkDelay(50);

      const transaction: SimulatedTransaction = {
        hash: this.generateTransactionHash(),
        blockNumber: this.currentBlockNumber + Math.floor(i / 5),
        gasUsed: 21000 + Math.floor(Math.random() * 30000), // Base gas + extra for contract calls
        status: Math.random() < this.options.failureRate! ? 'failed' : 'success',
        timestamp: new Date()
      };

      transactions.push(transaction);
    }

    this.transactionHistory.push(...transactions);

    if (this.options.enableLogs) {
      logger.info('💸 Simulated reward distribution', {
        contractId,
        recipients: numberOfRecipients,
        transactions: transactions.length
      });
    }

    return transactions;
  }

  // Get contract statistics
  getContractStats(contractId: string): BettingActivity | null {
    return this.bettingActivities.get(contractId) || null;
  }

  // Get transaction history
  getTransactionHistory(limit?: number): SimulatedTransaction[] {
    return limit ? this.transactionHistory.slice(-limit) : [...this.transactionHistory];
  }

  // Get current block number
  getCurrentBlockNumber(): number {
    return this.currentBlockNumber;
  }

  // Simulate network conditions
  async simulateNetworkCongestion(durationMs: number, delayMultiplier: number = 3): Promise<void> {
    const originalDelay = this.options.networkDelay;
    this.options.networkDelay = (originalDelay || 2000) * delayMultiplier;

    if (this.options.enableLogs) {
      logger.warn('🚦 Simulating network congestion', {
        originalDelay: originalDelay,
        newDelay: this.options.networkDelay,
        duration: durationMs
      });
    }

    setTimeout(() => {
      this.options.networkDelay = originalDelay;
      if (this.options.enableLogs) {
        logger.info('✅ Network congestion simulation ended');
      }
    }, durationMs);
  }

  // Generate test scenarios
  async generateComplexScenario(
    contract: Contract,
    scenario: 'heavy_betting' | 'close_race' | 'last_minute_surge' | 'whale_bets'
  ): Promise<void> {
    const contractId = contract.id;
    await this.simulateContractCreation(contract);

    switch (scenario) {
      case 'heavy_betting':
        await this.simulateBetting(contractId, 100, { partyA: 0.6, partyB: 0.4 });
        break;

      case 'close_race':
        await this.simulateBetting(contractId, 50, { partyA: 0.48, partyB: 0.52 });
        break;

      case 'last_minute_surge':
        await this.simulateBetting(contractId, 20, { partyA: 0.3, partyB: 0.7 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.simulateBetting(contractId, 30, { partyA: 0.9, partyB: 0.1 });
        break;

      case 'whale_bets':
        // Simulate a few very large bets
        for (let i = 0; i < 5; i++) {
          const event: BetPlacedEvent = {
            contractId,
            bettor: this.generateRandomAddress(),
            choice: Math.random() > 0.5 ? 1 : 2,
            amount: (BigInt(10) ** BigInt(19)).toString(), // 10 ETH
            blockNumber: this.currentBlockNumber,
            transactionHash: this.generateTransactionHash()
          };
          this.emit('BetPlaced', event);
          await this.simulateNetworkDelay(200);
        }
        break;
    }

    if (this.options.enableLogs) {
      logger.info('🎭 Complex scenario simulation completed', {
        contractId,
        scenario
      });
    }
  }

  // Clean up
  cleanup(): void {
    if (this.blockTimer) {
      clearInterval(this.blockTimer);
    }
    this.removeAllListeners();
    
    if (this.options.enableLogs) {
      logger.info('🧹 Blockchain simulator cleaned up');
    }
  }

  // Private helper methods
  private async simulateNetworkDelay(customDelay?: number): Promise<void> {
    const delay = customDelay || this.options.networkDelay || 0;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  private generateTransactionHash(): string {
    return '0x' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private generateRandomAddress(): string {
    return '0x' + Array.from({ length: 40 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}

// Utility functions for testing
export class BlockchainTestHelper {
  static async waitForConfirmation(
    simulator: BlockchainSimulator, 
    eventName: string, 
    timeoutMs: number = 10000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${eventName} event`));
      }, timeoutMs);

      simulator.once(eventName, (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

  static async simulateFullContractLifecycle(
    simulator: BlockchainSimulator,
    contract: Contract,
    winner: Choice
  ): Promise<{
    creationEvent: ContractEventData;
    bettingEvents: BetPlacedEvent[];
    winnerTransaction: SimulatedTransaction;
    rewardTransactions: SimulatedTransaction[];
  }> {
    // 1. Create contract
    const creationEvent = await simulator.simulateContractCreation(contract);
    
    // 2. Simulate betting activity
    const bettingEvents = await simulator.simulateBetting(contract.id, 25);
    
    // 3. Declare winner
    const winnerTransaction = await simulator.simulateWinnerDeclaration(contract.id, winner);
    
    // 4. Distribute rewards
    const rewardTransactions = await simulator.simulateRewardDistribution(contract.id);

    return {
      creationEvent,
      bettingEvents,
      winnerTransaction,
      rewardTransactions
    };
  }

  static generateMockBlockchainState(numberOfContracts: number = 5): {
    contracts: string[];
    totalTransactions: number;
    currentBlock: number;
  } {
    const contracts = Array.from({ length: numberOfContracts }, (_, i) => 
      `test_contract_${i}_${Date.now()}`
    );

    return {
      contracts,
      totalTransactions: Math.floor(Math.random() * 1000) + 500,
      currentBlock: 12000000 + Math.floor(Math.random() * 100000)
    };
  }
}

export default BlockchainSimulator;