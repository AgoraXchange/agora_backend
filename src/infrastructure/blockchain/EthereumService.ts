import { injectable, inject } from 'inversify';
import { ethers } from 'ethers';
import { IBlockchainService, ContractData } from '../../domain/services/IBlockchainService';
import { Choice } from '../../domain/entities/Choice';
import { BettingStats, ContractEventData, BetPlacedEvent, BetRevealedEvent } from '../../domain/entities/BettingStats';
import { CryptoService } from '../auth/CryptoService';
import { logger } from '../logging/Logger';

@injectable()
export class EthereumService implements IBlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet | null = null;
  private contractABI: any[];
  private eventListeners: Map<string, ethers.Contract> = new Map();
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventCallbacks: Map<string, (...args: any[]) => void> = new Map();
  private mockMode: boolean;
  private readonly FILTER_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(
    @inject('CryptoService') private cryptoService: CryptoService
  ) {
    const rpcUrl = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
    this.mockMode = process.env.BLOCKCHAIN_MOCK_MODE === 'true' || process.env.NODE_ENV === 'development';
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    // Enable polling to avoid WebSocket filter errors
    this.provider.pollingInterval = 4000; // 4 seconds
    
    if (this.mockMode) {
      // Use a test wallet for development/testing
      const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Well-known test key
      this.wallet = new ethers.Wallet(testPrivateKey, this.provider);
      logger.warn('⚠️ Using MOCK Ethereum wallet for testing - DO NOT use in production!');
    } else {
      try {
        const privateKey = this.cryptoService.getSecurePrivateKey();
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        logger.info('Ethereum wallet initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Ethereum wallet', { error: error instanceof Error ? error.message : 'Unknown error' });
        throw error;
      }
    }
    
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
  }

  async declareWinner(
    contractId: string,
    winner: Choice
  ): Promise<string> {
    if (this.mockMode) {
      logger.info('🎭 MOCK: Simulating blockchain submission', { contractId, winner });
      // Simulate successful transaction
      return `0xmock${Date.now().toString(16)}`;
    }

    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    try {
      const contractAddress = process.env.MAIN_CONTRACT_ADDRESS;
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
    try {
      // Note: We need to get the main contract address to call getContract
      const mainContractAddress = process.env.MAIN_CONTRACT_ADDRESS;
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
    const contractAddress = process.env.MAIN_CONTRACT_ADDRESS;
    if (!contractAddress) {
      logger.error('Main contract address not configured for event listening');
      return;
    }

    const key = `${contractAddress}-ContractCreated`;
    
    // Store callback for refresh
    this.eventCallbacks.set(key, callback);
    
    // Setup initial listener
    this.setupContractCreatedListener(contractAddress, key, callback);
    
    // Setup auto-refresh
    this.setupAutoRefresh(key, () => {
      this.setupContractCreatedListener(contractAddress, key, callback);
    });
    
    logger.info('ContractCreated event listener registered with auto-refresh', { contractAddress });
  }

  private setupContractCreatedListener(
    contractAddress: string,
    key: string,
    callback: (event: ContractEventData) => void
  ): void {
    // Remove existing listener if any
    if (this.eventListeners.has(key)) {
      this.eventListeners.get(key)?.removeAllListeners('ContractCreated');
    }

    // Use the main provider which is already configured for polling
    const pollingContract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
    
    const wrappedCallback = (contractId: any, creator: any, topic: any, description: any, partyA: any, partyB: any, bettingEndTime: any, event: any) => {
      try {
        const eventData: ContractEventData = {
          contractId: contractId.toString(),
          creator,
          topic,
          description,
          partyA,
          partyB,
          bettingEndTime: Number(bettingEndTime),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash
        };
        
        logger.info('ContractCreated event received', { 
          contractId: eventData.contractId,
          topic: eventData.topic,
          partyA: eventData.partyA,
          partyB: eventData.partyB
        });
        callback(eventData);
      } catch (error) {
        logger.error('Error processing ContractCreated event', { error: error instanceof Error ? error.message : 'Unknown error' });
        // Auto-recreate listener on error
        setTimeout(() => {
          this.setupContractCreatedListener(contractAddress, key, callback);
        }, 1000);
      }
    };
    
    pollingContract.on('ContractCreated', wrappedCallback);
    this.eventListeners.set(key, pollingContract);
  }

  listenToBetPlaced(
    contractAddress: string,
    callback: (event: BetPlacedEvent) => void
  ): void {
    const key = `${contractAddress}-BetPlaced`;
    
    // Store callback for refresh
    this.eventCallbacks.set(key, callback);
    
    // Setup initial listener
    this.setupBetPlacedListener(contractAddress, key, callback);
    
    // Setup auto-refresh
    this.setupAutoRefresh(key, () => {
      this.setupBetPlacedListener(contractAddress, key, callback);
    });
    
    logger.info('BetPlaced event listener registered with auto-refresh', { contractAddress });
  }

  private setupBetPlacedListener(
    contractAddress: string,
    key: string,
    callback: (event: BetPlacedEvent) => void
  ): void {
    // Remove existing listener if any
    if (this.eventListeners.has(key)) {
      this.eventListeners.get(key)?.removeAllListeners('BetPlaced');
    }

    // Use the main provider which is already configured for polling
    const pollingContract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
    
    const wrappedCallback = (contractId: any, bettor: any, choice: any, amount: any, event: any) => {
      try {
        const eventData: BetPlacedEvent = {
          contractId: contractId.toString(),
          bettor,
          choice: Number(choice),
          amount: amount.toString(),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash
        };
        
        logger.info('BetPlaced event received', { 
          contractId: eventData.contractId, 
          bettor: eventData.bettor,
          choice: eventData.choice 
        });
        callback(eventData);
      } catch (error) {
        logger.error('Error processing BetPlaced event', { error: error instanceof Error ? error.message : 'Unknown error' });
        // Auto-recreate listener on error
        setTimeout(() => {
          this.setupBetPlacedListener(contractAddress, key, callback);
        }, 1000);
      }
    };
    
    pollingContract.on('BetPlaced', wrappedCallback);
    this.eventListeners.set(key, pollingContract);
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

  private setupAutoRefresh(key: string, setupFunction: () => void): void {
    // Clear existing timer if any
    if (this.refreshTimers.has(key)) {
      clearInterval(this.refreshTimers.get(key)!);
    }

    // Setup new timer for periodic refresh
    const timer = setInterval(() => {
      logger.info('Auto-refreshing event listener', { key });
      setupFunction();
    }, this.FILTER_REFRESH_INTERVAL);
    
    this.refreshTimers.set(key, timer);
  }

  removeEventListener(contractAddress: string, eventName: string): void {
    const key = `${contractAddress}-${eventName}`;
    const contract = this.eventListeners.get(key);
    
    if (contract) {
      contract.removeAllListeners(eventName);
      this.eventListeners.delete(key);
      logger.info('Event listener removed', { contractAddress, eventName });
    }

    // Clear refresh timer
    if (this.refreshTimers.has(key)) {
      clearInterval(this.refreshTimers.get(key)!);
      this.refreshTimers.delete(key);
    }

    // Clear callback
    this.eventCallbacks.delete(key);
  }

  cleanup(): void {
    logger.info('Cleaning up Ethereum service event listeners');
    
    for (const [key, contract] of this.eventListeners) {
      contract.removeAllListeners();
    }
    
    this.eventListeners.clear();

    // Clear all refresh timers
    for (const [key, timer] of this.refreshTimers) {
      clearInterval(timer);
    }
    this.refreshTimers.clear();

    // Clear all callbacks
    this.eventCallbacks.clear();
  }
}