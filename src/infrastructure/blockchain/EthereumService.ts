import { injectable, inject } from 'inversify';
import { ethers } from 'ethers';
import { IBlockchainService, ContractData } from '../../domain/services/IBlockchainService';
import { Choice } from '../../domain/entities/Choice';
import { BettingStats, ContractEventData, BetPlacedEvent, BetRevealedEvent } from '../../domain/entities/BettingStats';
import { CryptoService } from '../auth/CryptoService';
import { logger } from '../logging/Logger';
import { getEnvVar } from '../../config/validateEnv';

@injectable()
export class EthereumService implements IBlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet | null = null;
  private contractABI: any[];
  private eventListeners: Map<string, ethers.Contract> = new Map();
  private eventCallbacks: Map<string, (...args: any[]) => void> = new Map();
  private retryCount: Map<string, number> = new Map();
  private lastCheckedBlock: Map<string, number> = new Map();
  private queryIntervals: Map<string, NodeJS.Timeout> = new Map();
  private mockMode: boolean;
  private readonly FILTER_REFRESH_INTERVAL: number;
  private readonly ETHEREUM_POLLING_INTERVAL: number;

  private initialized: boolean = false;
  private rpcUrl: string;
  private isRailway: boolean;
  private useRealBlockchain: boolean;

  constructor(
    @inject('CryptoService') private cryptoService: CryptoService
  ) {
    // Store configuration but don't initialize heavy resources yet
    this.rpcUrl = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
    this.isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
    this.useRealBlockchain = process.env.USE_REAL_BLOCKCHAIN === 'true';
    
    // Allow real blockchain usage in Railway if explicitly enabled
    this.mockMode = process.env.BLOCKCHAIN_MOCK_MODE === 'true' || 
                    process.env.NODE_ENV === 'development' || 
                    (this.isRailway && !this.useRealBlockchain);
    
    // Configure intervals from environment variables
    this.ETHEREUM_POLLING_INTERVAL = parseInt(process.env.ETHEREUM_POLLING_INTERVAL || '10000');
    this.FILTER_REFRESH_INTERVAL = parseInt(process.env.FILTER_REFRESH_INTERVAL || '240000'); // 4 minutes
    
    this.contractABI = [
      "function declareWinner(uint256 _contractId, uint8 _winner) external",
      "function getContract(uint256 _contractId) external view returns (address creator, string memory partyA, string memory partyB, uint256 bettingEndTime, uint8 status, uint8 winner, uint256 totalPoolA, uint256 totalPoolB, uint256 partyRewardPercentage)",
      "function closeBetting(uint256 _contractId) external",
      "function placeBet(uint256 _contractId, uint8 _choice) external payable",
      "function getUserBets(uint256 _contractId, address _user) external view returns (uint256[] memory amounts, uint8[] memory choices, bool[] memory claimed)",
      "event ContractCreated(uint256 indexed contractId, address indexed creator, string topic, string description, string partyA, string partyB, uint256 bettingEndTime)",
      "event BetPlaced(uint256 indexed contractId, address indexed bettor, uint8 choice, uint256 amount)",
      "event WinnerDeclared(uint256 indexed contractId, uint8 winner)",
      "event RewardsDistributed(uint256 indexed contractId, uint256 partyReward, uint256 totalDistributed)",
      "event RewardClaimed(uint256 indexed contractId, address indexed bettor, uint256 amount)"
    ];
    
    logger.debug('EthereumService constructor completed - lazy initialization mode');
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.debug('Initializing EthereumService provider and wallet...');
    
    // Create provider with polling enabled to avoid filter errors
    this.provider = new ethers.JsonRpcProvider(
      this.rpcUrl,
      undefined,
      { 
        polling: true,
        pollingInterval: this.ETHEREUM_POLLING_INTERVAL
      }
    );
    
    // Add provider error handling
    this.setupProviderErrorHandling();
    
    if (this.mockMode) {
      // Use a test wallet for development/testing/Railway (when real blockchain is not enabled)
      const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Well-known test key
      this.wallet = new ethers.Wallet(testPrivateKey, this.provider);
      if (this.isRailway && !this.useRealBlockchain) {
        logger.warn('🚂 Using Railway test wallet - blockchain functionality disabled for production safety');
        logger.info('💡 To enable real blockchain, set USE_REAL_BLOCKCHAIN=true in Railway Variables');
      } else {
        logger.warn('⚠️ Using MOCK Ethereum wallet for testing - DO NOT use in production!');
      }
    } else {
      try {
        const privateKey = this.cryptoService.getSecurePrivateKey();
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        if (this.isRailway) {
          logger.info('🚀 Railway real blockchain mode enabled - using production wallet');
        } else {
          logger.info('Ethereum wallet initialized successfully');
        }
      } catch (error) {
        logger.error('Failed to initialize Ethereum wallet', { error: error instanceof Error ? error.message : 'Unknown error' });
        // In degraded mode, fall back to test key instead of throwing
        const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        this.wallet = new ethers.Wallet(testPrivateKey, this.provider);
        logger.warn('Using test wallet due to private key initialization failure - degraded mode');
      }
    }
    
    this.initialized = true;
    logger.debug('EthereumService initialization completed');
  }

  async declareWinner(
    contractId: string,
    winner: Choice
  ): Promise<string> {
    await this.ensureInitialized();
    
    if (this.mockMode) {
      logger.info('🎭 MOCK: Simulating blockchain submission', { contractId, winner });
      // Simulate successful transaction
      return `0xmock${Date.now().toString(16)}`;
    }

    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    try {
      const contractAddress = getEnvVar(['MAIN_CONTRACT_ADDRESS', 'ORACLE_CONTRACT_ADDRESS']);
      if (!contractAddress) {
        throw new Error('Main contract address not configured');
      }
      
      const contract = new ethers.Contract(contractAddress, this.contractABI, this.wallet);
      const tx = await contract.declareWinner(contractId, winner);
      const receipt = await tx.wait();
      
      logger.info('Winner declared on blockchain', { 
        contractId, 
        winner, 
        transactionHash: receipt.hash 
      });
      
      return receipt.hash;
    } catch (error) {
      logger.error('Blockchain declareWinner error', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        contractId, 
        winner 
      });
      throw new Error('Failed to declare winner on blockchain');
    }
  }

  async getContract(contractId: string): Promise<ContractData> {
    await this.ensureInitialized();
    
    try {
      // Note: We need to get the main contract address to call getContract
      const mainContractAddress = getEnvVar(['MAIN_CONTRACT_ADDRESS', 'ORACLE_CONTRACT_ADDRESS']);
      if (!mainContractAddress) {
        throw new Error('Main contract address not configured');
      }
      
      const contract = new ethers.Contract(mainContractAddress, this.contractABI, this.provider);
      // Call getContract with contractId (uint256), not contract address
      const result = await contract.getContract(contractId);
      
      // Parse the returned tuple in the correct order
      // Returns: (creator, partyA, partyB, bettingEndTime, status, winner, totalPoolA, totalPoolB, partyRewardPercentage)
      return {
        contractId: contractId,
        creator: result[0],  // address
        partyA: result[1],   // string
        partyB: result[2],   // string
        bettingEndTime: Number(result[3]),  // uint256
        status: Number(result[4]),  // ContractStatus enum
        winner: Number(result[5]),  // Choice enum
        totalPoolA: result[6].toString(),  // uint256 as string
        totalPoolB: result[7].toString(),  // uint256 as string
        partyRewardPercentage: Number(result[8])  // uint256
      };
    } catch (error) {
      logger.error('Failed to get contract data', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        contractId 
      });
      throw new Error('Failed to get contract data from blockchain');
    }
  }

  // getContractStats removed - not available in smart contract
  // Use getContract() and extract totalPoolA/totalPoolB for betting statistics

  listenToContractCreated(
    callback: (event: ContractEventData) => void
  ): void {
    const contractAddress = getEnvVar(['MAIN_CONTRACT_ADDRESS', 'ORACLE_CONTRACT_ADDRESS']);
    if (!contractAddress) {
      logger.error('Main contract address not configured for event listening');
      return;
    }

    const key = `${contractAddress}-ContractCreated`;
    
    // Store callback for cleanup
    this.eventCallbacks.set(key, callback);
    
    // Setup polling listener (async but not awaited to keep interface synchronous)
    this.setupContractCreatedListener(contractAddress, key, callback).catch(error => {
      logger.error('Failed to setup ContractCreated listener', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        contractAddress 
      });
    });
    
    logger.info('ContractCreated event listener registered with queryFilter polling', { 
      contractAddress,
      pollingInterval: this.ETHEREUM_POLLING_INTERVAL
    });
  }

  private async setupContractCreatedListener(
    contractAddress: string,
    key: string,
    callback: (event: ContractEventData) => void
  ): Promise<void> {
    await this.ensureInitialized();
    
    // Stop existing interval if any
    if (this.queryIntervals.has(key)) {
      clearInterval(this.queryIntervals.get(key));
    }

    // Create contract instance for querying
    const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
    this.eventListeners.set(key, contract);
    
    // Start polling for events
    const pollEvents = async () => {
      try {
        logger.debug(`Polling for ContractCreated events...`);
        
        const currentBlock = await this.provider.getBlockNumber();
        const lastBlock = this.lastCheckedBlock.get(key) || (currentBlock - 100); // Start from 100 blocks ago on first run
        
        if (lastBlock >= currentBlock) {
          logger.debug(`No new blocks since ${lastBlock} (current: ${currentBlock})`);
          return; // No new blocks to check
        }

        logger.debug(`Checking blocks ${lastBlock + 1} to ${currentBlock} for ContractCreated events`);
        
        // Query for ContractCreated events
        const filter = contract.filters.ContractCreated();
        const events = await contract.queryFilter(filter, lastBlock + 1, currentBlock);
        
        // Process each event
        for (const event of events) {
          try {
            // TypeScript guard: ensure this is an EventLog with args
            if (!('args' in event) || !event.args) continue;
            const args = event.args;
            
            const eventData: ContractEventData = {
              contractId: args[0].toString(),
              creator: args[1],
              topic: args[2],
              description: args[3],
              partyA: args[4],
              partyB: args[5],
              bettingEndTime: Number(args[6]),
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash
            };
            
            logger.info('ContractCreated event found via polling', { 
              contractId: eventData.contractId,
              topic: eventData.topic,
              partyA: eventData.partyA,
              partyB: eventData.partyB,
              blockNumber: eventData.blockNumber
            });
            
            callback(eventData);
          } catch (error) {
            logger.error('Error processing ContractCreated event', { 
              error: error instanceof Error ? error.message : 'Unknown error',
              transactionHash: event.transactionHash
            });
          }
        }
        
        // Update last checked block
        this.lastCheckedBlock.set(key, currentBlock);
        
      } catch (error) {
        logger.error('Error polling for ContractCreated events', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          key
        });
        // Continue polling despite errors
      }
    };
    
    // Initial poll
    pollEvents().catch(error => {
      logger.error('Initial event poll failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    });
    
    // Start polling interval
    const interval = setInterval(pollEvents, this.ETHEREUM_POLLING_INTERVAL);
    this.queryIntervals.set(key, interval);
  }

  listenToBetPlaced(
    contractAddress: string,
    callback: (event: BetPlacedEvent) => void
  ): void {
    const key = `${contractAddress}-BetPlaced`;
    
    // Store callback for cleanup
    this.eventCallbacks.set(key, callback);
    
    // Setup polling listener (async but not awaited to keep interface synchronous)
    this.setupBetPlacedListener(contractAddress, key, callback).catch(error => {
      logger.error('Failed to setup BetPlaced listener', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        contractAddress 
      });
    });
    
    logger.info('BetPlaced event listener registered with queryFilter polling', { 
      contractAddress,
      pollingInterval: this.ETHEREUM_POLLING_INTERVAL
    });
  }

  private async setupBetPlacedListener(
    contractAddress: string,
    key: string,
    callback: (event: BetPlacedEvent) => void
  ): Promise<void> {
    await this.ensureInitialized();
    
    // Stop existing interval if any
    if (this.queryIntervals.has(key)) {
      clearInterval(this.queryIntervals.get(key));
    }

    // Create contract instance for querying
    const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
    this.eventListeners.set(key, contract);
    
    // Start polling for events
    const pollEvents = async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        const lastBlock = this.lastCheckedBlock.get(key) || (currentBlock - 100); // Start from 100 blocks ago on first run
        
        if (lastBlock >= currentBlock) {
          return; // No new blocks to check
        }
        
        // Query for BetPlaced events
        const filter = contract.filters.BetPlaced();
        const events = await contract.queryFilter(filter, lastBlock + 1, currentBlock);
        
        // Process each event
        for (const event of events) {
          try {
            // TypeScript guard: ensure this is an EventLog with args
            if (!('args' in event) || !event.args) continue;
            const args = event.args;
            
            const eventData: BetPlacedEvent = {
              contractId: args[0].toString(),
              bettor: args[1],
              choice: Number(args[2]),
              amount: args[3].toString(),
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash
            };
            
            logger.info('BetPlaced event found via polling', { 
              contractId: eventData.contractId,
              bettor: eventData.bettor,
              choice: eventData.choice,
              blockNumber: eventData.blockNumber
            });
            
            callback(eventData);
          } catch (error) {
            logger.error('Error processing BetPlaced event', { 
              error: error instanceof Error ? error.message : 'Unknown error',
              transactionHash: event.transactionHash
            });
          }
        }
        
        // Update last checked block
        this.lastCheckedBlock.set(key, currentBlock);
        
      } catch (error) {
        logger.error('Error polling for BetPlaced events', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          key
        });
        // Continue polling despite errors
      }
    };
    
    // Initial poll
    pollEvents().catch(error => {
      logger.error('Initial BetPlaced poll failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    });
    
    // Start polling interval
    const interval = setInterval(pollEvents, this.ETHEREUM_POLLING_INTERVAL);
    this.queryIntervals.set(key, interval);
  }
  
  // Keep old method for backward compatibility
  listenToBetRevealed(
    contractAddress: string,
    callback: (event: BetRevealedEvent) => void  
  ): void {
    // Redirect to new method name
    this.listenToBetPlaced(contractAddress, callback);
  }

  listenToContractEvents(
    contractAddress: string,
    eventName: string,
    callback: (event: any) => void
  ): void {
    if (this.mockMode) {
      logger.info('🎭 MOCK: Event listener registered (no-op)', { contractAddress, eventName });
      // In mock mode, don't actually listen to events
      return;
    }

    const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
    const key = `${contractAddress}-${eventName}`;
    
    if (this.eventListeners.has(key)) {
      logger.warn('Event listener already exists, removing old listener', { contractAddress, eventName });
      this.removeEventListener(contractAddress, eventName);
    }
    
    contract.on(eventName, (...args) => {
      const event = args[args.length - 1];
      callback(event);
    });
    
    this.eventListeners.set(key, contract);
    logger.info('Event listener registered', { contractAddress, eventName });
  }


  removeEventListener(contractAddress: string, eventName: string): void {
    const key = `${contractAddress}-${eventName}`;
    const contract = this.eventListeners.get(key);
    
    if (contract) {
      contract.removeAllListeners(eventName);
      this.eventListeners.delete(key);
      logger.info('Event listener removed', { contractAddress, eventName });
    }


    // Clear query interval
    if (this.queryIntervals.has(key)) {
      clearInterval(this.queryIntervals.get(key)!);
      this.queryIntervals.delete(key);
    }

    // Clear callback and other data
    this.eventCallbacks.delete(key);
    this.retryCount.delete(key);
    this.lastCheckedBlock.delete(key);
  }

  private setupProviderErrorHandling(): void {
    // Since we're using queryFilter instead of eth_newFilter/eth_getFilterChanges,
    // we don't need complex filter error handling. Just log provider errors.
    this.provider.on('error', (error: any) => {
      logger.warn('Provider error occurred (continuing with queryFilter polling)', { 
        error: error.message || error.toString(),
        code: error.code
      });
    });

    // Handle unhandled rejections at the provider level
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      if (reason && reason.toString && reason.toString().includes('filter not found')) {
        logger.info('Ignoring filter-related unhandled rejection (using queryFilter polling)', {
          reason: reason.toString()
        });
        return; // Don't exit the process for these errors
      }
      
      // For other unhandled rejections, let the global handler deal with it
      logger.error('Unhandled rejection in EthereumService', { reason, promise });
    });
  }


  cleanup(): void {
    logger.info('Cleaning up Ethereum service event listeners');
    
    // Clear event listeners (no longer needed with queryFilter approach)
    for (const [key, contract] of this.eventListeners) {
      contract.removeAllListeners();
    }
    this.eventListeners.clear();


    // Clear all query intervals
    for (const [key, interval] of this.queryIntervals) {
      clearInterval(interval);
    }
    this.queryIntervals.clear();

    // Clear all callbacks, retry counts, and last checked blocks
    this.eventCallbacks.clear();
    this.retryCount.clear();
    this.lastCheckedBlock.clear();
  }
}