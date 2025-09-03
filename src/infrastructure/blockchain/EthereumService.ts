import { injectable, inject } from 'inversify';
import { ethers } from 'ethers';
import fs from 'fs';
import { IBlockchainService, ContractData } from '../../domain/services/IBlockchainService';
import { Choice } from '../../domain/entities/Choice';
import { BettingStats, ContractEventData, BetPlacedEvent, BetRevealedEvent } from '../../domain/entities/BettingStats';
import { CryptoService } from '../auth/CryptoService';
import { logger } from '../logging/Logger';

@injectable()
export class EthereumService implements IBlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wsProvider?: ethers.WebSocketProvider;
  private wsUrl?: string;
  private wsReconnectAttempt: number = 0;
  private wsReconnectTimer?: NodeJS.Timeout;
  private wsHealthTimer?: NodeJS.Timeout;
  private wsHealthFailures: number = 0;
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
    const useReal = process.env.USE_REAL_BLOCKCHAIN === 'true';
    this.mockMode = process.env.BLOCKCHAIN_MOCK_MODE === 'true' || !useReal || process.env.NODE_ENV === 'development';
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    // Enable polling to avoid WebSocket filter errors
    this.provider.pollingInterval = 4000; // 4 seconds
    
    // Initialize WebSocket provider for event subscriptions when available
    const wsUrl = process.env.ETHEREUM_WS_URL;
    this.wsUrl = wsUrl;
    if (wsUrl && wsUrl.trim().length > 0) {
      try {
        this.wsProvider = new ethers.WebSocketProvider(wsUrl);
        logger.info('WebSocket provider initialized for event subscriptions');
        this.attachWsReconnectHandlers();
        this.startWsHealthMonitor();
      } catch (err) {
        logger.warn('Failed to initialize WebSocket provider; falling back to HTTP polling', {
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }
    
    
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
    
    // Default minimal ABI (overridable via env)
    this.contractABI = [
      "function declareWinner(uint256 _contractId, uint8 _winner) external",
      "function closeBetting(uint256 _contractId) external",
      // Split views per deployed contract
      "function getContractBasic(uint256 _contractId) external view returns (address creator, string topic, string partyA, string partyB, uint256 bettingEndTime, uint8 status)",
      "function getContractBetting(uint256 _contractId) external view returns (uint8 winner, uint256 totalPoolA, uint256 totalPoolB, uint256 partyRewardPercentage, uint256 minBetAmount, uint256 maxBetAmount, uint256 totalBettors)",
      // Fallback: full struct return (if available)
      "function getContract(uint256 _contractId) external view returns ((address creator, string topic, string description, string partyA, string partyB, uint256 bettingEndTime, uint8 status, uint8 winner, uint256 totalPoolA, uint256 totalPoolB, uint256 partyRewardPercentage, uint256 minBetAmount, uint256 maxBetAmount, uint256 totalBettors, uint256 totalComments))",
      "function placeBet(uint256 _contractId, uint8 _choice) external payable",
      "function getUserBets(uint256 _contractId, address _user) external view returns (uint256[] memory amounts, uint8[] memory choices, bool[] memory claimed)",
      "event ContractCreated(uint256 indexed contractId, address indexed creator, string topic, string description, string partyA, string partyB, uint256 bettingEndTime)",
      "event BetPlaced(uint256 indexed contractId, address indexed bettor, uint8 choice, uint256 amount)",
      "event WinnerDeclared(uint256 indexed contractId, uint8 winner)",
      "event RewardsDistributed(uint256 indexed contractId, uint256 partyReward, uint256 totalDistributed)",
      "event RewardClaimed(uint256 indexed contractId, address indexed bettor, uint256 amount)"
    ];

    // Optional: override ABI from env (path or inline JSON)
    try {
      const abiJsonInline = process.env.MAIN_CONTRACT_ABI_JSON;
      const abiJsonPath = process.env.MAIN_CONTRACT_ABI_PATH;
      if (abiJsonInline && abiJsonInline.trim().length > 0) {
        this.contractABI = JSON.parse(abiJsonInline);
        logger.info('Loaded main contract ABI from MAIN_CONTRACT_ABI_JSON');
      } else if (abiJsonPath && fs.existsSync(abiJsonPath)) {
        const content = fs.readFileSync(abiJsonPath, 'utf-8');
        this.contractABI = JSON.parse(content);
        logger.info('Loaded main contract ABI from MAIN_CONTRACT_ABI_PATH', { abiPath: abiJsonPath });
      }
    } catch (abiErr) {
      logger.warn('Failed to load ABI override; falling back to default minimal ABI', {
        error: abiErr instanceof Error ? abiErr.message : 'Unknown error'
      });
    }
  }

  getSignerAddress(): string {
    if (!this.wallet) throw new Error('Wallet not initialized');
    return this.wallet.address;
  }

  private async getOnChainOracleAddress(): Promise<string> {
    const mainContractAddress = process.env.MAIN_CONTRACT_ADDRESS;
    if (!mainContractAddress) throw new Error('Main contract address not configured');
    const contract = new ethers.Contract(mainContractAddress, [
      "function oracle() view returns (address)"
    ], this.provider);
    return await contract.oracle();
  }

  async getOracleAddress(): Promise<string> {
    return await this.getOnChainOracleAddress();
  }

  async isAuthorizedOracle(): Promise<boolean> {
    try {
      const signer = this.getSignerAddress().toLowerCase();
      const onchain = (await this.getOnChainOracleAddress()).toLowerCase();
      return signer === onchain;
    } catch {
      // If we cannot verify, allow to proceed to avoid false negatives
      return true;
    }
  }

  async closeBetting(contractId: string): Promise<string> {
    if (this.mockMode) {
      logger.info('🎭 MOCK: Simulating closeBetting on blockchain', { contractId });
      return `0xmockclose${Date.now().toString(16)}`;
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
      const tx = await contract.closeBetting(contractId);
      const receipt = await tx.wait();

      logger.info('Betting closed on blockchain', {
        contractId,
        transactionHash: receipt.hash
      });

      return receipt.hash;
    } catch (error) {
      let onchainOracle: string | undefined;
      try { onchainOracle = await this.getOnChainOracleAddress(); } catch {}
      logger.error('Blockchain closeBetting error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        contractId,
        signer: this.wallet?.address,
        oracle: onchainOracle
      });
      throw new Error('Failed to close betting on blockchain');
    }
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
      let onchainOracle: string | undefined;
      try { onchainOracle = await this.getOnChainOracleAddress(); } catch {}
      logger.error('Blockchain declareWinner error', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        contractId, 
        winner,
        signer: this.wallet?.address,
        oracle: onchainOracle 
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

      // First try the split view functions which are present in the provided Solidity
      try {
        const basic: any = await (contract as any)[process.env.GET_CONTRACT_BASIC_METHOD || 'getContractBasic'](contractId);
        const betting: any = await (contract as any)[process.env.GET_CONTRACT_BETTING_METHOD || 'getContractBetting'](contractId);

        const creator = basic.creator ?? basic[0];
        // basic[1] is topic, we don't need it for our DTO
        const partyA = basic.partyA ?? basic[2];
        const partyB = basic.partyB ?? basic[3];
        const bettingEndTime = Number(basic.bettingEndTime ?? basic[4]);
        const status = Number(basic.status ?? basic[5]);

        const winner = Number(betting.winner ?? betting[0]);
        const totalPoolA = (betting.totalPoolA ?? betting[1])?.toString?.() ?? '0';
        const totalPoolB = (betting.totalPoolB ?? betting[2])?.toString?.() ?? '0';
        const partyRewardPercentage = Number(betting.partyRewardPercentage ?? betting[3] ?? 0);

        return {
          contractId,
          creator,
          partyA,
          partyB,
          bettingEndTime,
          status,
          winner,
          totalPoolA,
          totalPoolB,
          partyRewardPercentage
        };
      } catch (splitErr) {
        logger.debug('Split views not available or failed; falling back to single getContract', {
          error: splitErr instanceof Error ? splitErr.message : 'Unknown error'
        });
      }

      // Fallback to a single getContract result (struct or tuple)
      const method = process.env.GET_CONTRACT_METHOD || 'getContract';
      const result: any = await (contract as any)[method](contractId);

      const creator = result.creator ?? result[0];
      const partyA = result.partyA ?? result[3] ?? result[1]; // struct layout vs older tuple
      const partyB = result.partyB ?? result[4] ?? result[2];
      const bettingEndTime = Number(result.bettingEndTime ?? result[5] ?? result[3]);
      const status = Number(result.status ?? result[6] ?? result[4]);
      const winner = Number(result.winner ?? result[7] ?? result[5]);
      const totalPoolA = (result.totalPoolA ?? result[8] ?? result[6])?.toString?.() ?? '0';
      const totalPoolB = (result.totalPoolB ?? result[9] ?? result[7])?.toString?.() ?? '0';
      const partyRewardPercentage = Number(result.partyRewardPercentage ?? result[10] ?? result[8] ?? 0);

      return {
        contractId,
        creator,
        partyA,
        partyB,
        bettingEndTime,
        status,
        winner,
        totalPoolA,
        totalPoolB,
        partyRewardPercentage
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      // Likely ABI mismatch (BAD_DATA). Downgrade to warn with guidance and rethrow.
      logger.warn('Failed to get contract data (verify ABI/method/address).', { 
        error: message,
        contractId,
        address: process.env.MAIN_CONTRACT_ADDRESS,
        method: process.env.GET_CONTRACT_METHOD || 'getContract',
        abiSource: process.env.MAIN_CONTRACT_ABI_PATH ? 'path' : (process.env.MAIN_CONTRACT_ABI_JSON ? 'inline' : 'default')
      });
      throw new Error('Failed to get contract data from blockchain: ' + message);
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

    // Use WebSocket provider for events when available; otherwise fall back to polling HTTP provider
    const eventProvider = this.wsProvider ?? this.provider;
    const pollingContract = new ethers.Contract(contractAddress, this.contractABI, eventProvider);
    
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

    // Use WebSocket provider for events when available; otherwise fall back to polling HTTP provider
    const eventProvider = this.wsProvider ?? this.provider;
    const pollingContract = new ethers.Contract(contractAddress, this.contractABI, eventProvider);
    
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

    const eventProvider = this.wsProvider ?? this.provider;
    const contract = new ethers.Contract(contractAddress, this.contractABI, eventProvider);
    const key = `${contractAddress}-${eventName}`;
    
    if (this.eventListeners.has(key)) {
      logger.warn('Event listener already exists, removing old listener', { contractAddress, eventName });
      this.removeEventListener(contractAddress, eventName);
    }
    
    // Store callback so we can re-subscribe on WS reconnect
    this.eventCallbacks.set(key, callback);

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
  
  // Attach WS reconnect handlers for robustness in ephemeral environments
  private attachWsReconnectHandlers(): void {
    if (!this.wsProvider) return;

    const providerAny: any = this.wsProvider as any;

    // Only use low-level websocket events; ethers v6 ProviderEvent does not include 'close'/'error'
    const ws: any = providerAny._websocket ?? providerAny._ws ?? providerAny._socket;
    if (ws && typeof ws.on === 'function') {
      try { ws.on('error', (err: any) => this.handleWsError(err)); } catch {}
      try { ws.on('close', (code: any) => this.handleWsClose(code)); } catch {}
    } else {
      logger.info('WebSocket underlying socket not accessible; relying on health monitor for reconnects');
    }
  }

  private handleWsClose(code: any): void {
    logger.warn('WebSocket provider closed; scheduling reconnect', { code });
    this.scheduleWsReconnect();
  }

  private handleWsError(error: any): void {
    logger.warn('WebSocket provider error; scheduling reconnect', { error: error?.message || String(error) });
    this.scheduleWsReconnect();
  }

  // Health monitoring for WS provider when underlying socket is not accessible
  private async pingWsProvider(timeoutMs: number = 5000): Promise<boolean> {
    if (!this.wsProvider) return false;
    const prov = this.wsProvider;
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);

      prov.getBlockNumber().then(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      }).catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      });
    });
  }

  private startWsHealthMonitor(): void {
    // Clear existing
    if (this.wsHealthTimer) {
      clearInterval(this.wsHealthTimer);
      this.wsHealthTimer = undefined;
    }
    this.wsHealthFailures = 0;
    if (!this.wsProvider) return;

    // Check every 15s with 5s timeout
    this.wsHealthTimer = setInterval(async () => {
      try {
        if (!this.wsProvider) return;
        const ok = await this.pingWsProvider(5000);
        if (!ok) {
          this.wsHealthFailures++;
          logger.warn('WebSocket health check failed', { failures: this.wsHealthFailures });
          if (this.wsHealthFailures >= 3) {
            logger.warn('WebSocket unhealthy; forcing reconnect');
            try { (this.wsProvider as any).destroy?.(); } catch {}
            this.scheduleWsReconnect();
            this.wsHealthFailures = 0;
          }
        } else if (this.wsHealthFailures > 0) {
          logger.info('WebSocket health check recovered');
          this.wsHealthFailures = 0;
        }
      } catch (err) {
        logger.warn('WebSocket health monitor error', { error: err instanceof Error ? err.message : String(err) });
      }
    }, 15000);
  }

  private stopWsHealthMonitor(): void {
    if (this.wsHealthTimer) {
      clearInterval(this.wsHealthTimer);
      this.wsHealthTimer = undefined;
    }
    this.wsHealthFailures = 0;
  }

  private scheduleWsReconnect(): void {
    if (this.wsReconnectTimer) return; // already scheduled

    const attempt = this.wsReconnectAttempt++;
    const delay = Math.min(30000, 1000 * Math.pow(2, attempt)); // capped exponential backoff
    logger.info('Scheduling WebSocket reconnect', { attempt, delay });

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = undefined;
      this.reconnectWsProvider().catch((err) => {
        logger.error('WebSocket reconnect failed', { error: err?.message || String(err) });
        // Schedule next attempt
        this.scheduleWsReconnect();
      });
    }, delay);
  }

  private async reconnectWsProvider(): Promise<void> {
    if (!this.wsUrl) return; // WS not configured

    try {
      // Dispose old provider listeners
      if (this.wsProvider) {
        try { (this.wsProvider as any).removeAllListeners?.(); } catch {}
      }

      // Create new provider
      this.wsProvider = new ethers.WebSocketProvider(this.wsUrl);
      this.wsReconnectAttempt = 0; // reset backoff on success
      logger.info('WebSocket provider reconnected');

      // Attach handlers again
      this.attachWsReconnectHandlers();
      this.startWsHealthMonitor();

      // Re-subscribe all event listeners on the new provider
      this.resubscribeAllListeners();
    } catch (err) {
      logger.error('Failed to reconnect WebSocket provider', { error: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  }

  private resubscribeAllListeners(): void {
    // For each registered callback key, rebuild the listener using the new provider
    for (const [key, cb] of this.eventCallbacks.entries()) {
      const lastDash = key.lastIndexOf('-');
      if (lastDash <= 0) continue;
      const contractAddress = key.substring(0, lastDash);
      const eventName = key.substring(lastDash + 1);

      try {
        if (eventName === 'ContractCreated') {
          this.setupContractCreatedListener(contractAddress, key, cb as (ev: ContractEventData) => void);
        } else if (eventName === 'BetPlaced') {
          this.setupBetPlacedListener(contractAddress, key, cb as (ev: BetPlacedEvent) => void);
        } else {
          // Generic rebind
          const eventProvider = this.wsProvider ?? this.provider;
          const contract = new ethers.Contract(contractAddress, this.contractABI, eventProvider);
          contract.on(eventName, (...args: any[]) => {
            const event = args[args.length - 1];
            (cb as (ev: any) => void)(event);
          });
          this.eventListeners.set(key, contract);
        }
        logger.info('Re-subscribed event listener after WS reconnect', { contractAddress, eventName });
      } catch (err) {
        logger.error('Failed to re-subscribe listener after WS reconnect', {
          key,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }
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

    // Stop WS health monitor and reconnect attempts
    this.stopWsHealthMonitor();
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = undefined;
    }
    // Try to close/destroy ws provider
    if (this.wsProvider) {
      try { (this.wsProvider as any).removeAllListeners?.(); } catch {}
      try { (this.wsProvider as any)._websocket?.terminate?.(); } catch {}
      try { (this.wsProvider as any)._websocket?.close?.(); } catch {}
      this.wsProvider = undefined;
    }
  }
}
