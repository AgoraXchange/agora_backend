import { injectable, inject } from 'inversify';
import { ethers } from 'ethers';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { CryptoService } from '../auth/CryptoService';
import { logger } from '../logging/Logger';

@injectable()
export class EthereumService implements IBlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contractABI: any[];
  private eventListeners: Map<string, ethers.Contract> = new Map();

  constructor(
    @inject('CryptoService') private cryptoService: CryptoService
  ) {
    const rpcUrl = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    try {
      const privateKey = this.cryptoService.getSecurePrivateKey();
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      logger.info('Ethereum wallet initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Ethereum wallet', { error: error.message });
      throw error;
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