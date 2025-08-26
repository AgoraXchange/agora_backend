import { injectable, inject } from 'inversify';
import { ethers } from 'ethers';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { CryptoService } from '../auth/CryptoService';
import { logger } from '../logging/Logger';

@injectable()
export class EthereumService implements IBlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet | null = null;
  private contractABI: any[];
  private eventListeners: Map<string, ethers.Contract> = new Map();
  private mockMode: boolean;

  constructor(
    @inject('CryptoService') private cryptoService: CryptoService
  ) {
    const rpcUrl = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
    this.mockMode = process.env.BLOCKCHAIN_MOCK_MODE === 'true' || process.env.NODE_ENV === 'development';
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
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
        logger.error('Failed to initialize Ethereum wallet', { error: error.message });
        throw error;
      }
    }
    
    this.contractABI = [
      "function submitWinnerDecision(string winnerId, string proof) external",
      "function getContractState() external view returns (string partyAId, string partyBId, uint256 bettingEndTime, uint8 status)",
      "event WinnerDecided(string winnerId, string proof)"
    ];
  }

  async submitWinnerDecision(
    contractAddress: string,
    winnerId: string,
    proof: string
  ): Promise<string> {
    if (this.mockMode) {
      logger.info('🎭 MOCK: Simulating blockchain submission', { contractAddress, winnerId });
      // Simulate successful transaction
      return `0xmock${Date.now().toString(16)}`;
    }

    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    try {
      const contract = new ethers.Contract(contractAddress, this.contractABI, this.wallet);
      const tx = await contract.submitWinnerDecision(winnerId, proof);
      const receipt = await tx.wait();
      
      return receipt.hash;
    } catch (error) {
      logger.error('Blockchain submission error', { error: error.message, contractAddress, winnerId });
      throw new Error('Failed to submit winner decision to blockchain');
    }
  }

  async getContractState(contractAddress: string): Promise<{
    partyAId: string;
    partyBId: string;
    bettingEndTime: number;
    status: number;
  }> {
    if (this.mockMode) {
      logger.info('🎭 MOCK: Returning simulated contract state', { contractAddress });
      // Return mock contract state for testing
      return {
        partyAId: 'Lakers',
        partyBId: 'Celtics',
        bettingEndTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        status: 1 // Active
      };
    }

    try {
      const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
      const state = await contract.getContractState();
      
      return {
        partyAId: state.partyAId,
        partyBId: state.partyBId,
        bettingEndTime: Number(state.bettingEndTime),
        status: Number(state.status)
      };
    } catch (error) {
      logger.error('Blockchain read error', { error: error.message, contractAddress });
      throw new Error('Failed to get contract state from blockchain');
    }
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
  }

  cleanup(): void {
    logger.info('Cleaning up Ethereum service event listeners');
    
    for (const [key, contract] of this.eventListeners) {
      contract.removeAllListeners();
    }
    
    this.eventListeners.clear();
  }
}