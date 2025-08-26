import { injectable, inject } from 'inversify';
import { ethers } from 'ethers';
import { IBlockchainService, ContractData } from '../../domain/services/IBlockchainService';
import { Choice } from '../../domain/entities/Choice';
import { BettingStats, ContractEventData, BetRevealedEvent } from '../../domain/entities/BettingStats';
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
      "function declareWinner(uint256 _contractId, uint8 _winner) external",
      "function getContract(address contractAddress) external view returns (string id, address creator, string topic, string description, string partyAId, string partyAName, string partyADescription, string partyBId, string partyBName, string partyBDescription, uint256 bettingEndTime, uint256 winnerRewardPercentage, uint8 status, uint8 winnerId)",
      "function getContractStats(address contractAddress) external view returns (uint256 totalBets, uint256 totalAmount, uint256 uniqueParticipants, uint256 partyABets, uint256 partyBBets, uint256 partyAAmount, uint256 partyBAmount, uint256 averageBetAmount)",
      "function getContractState() external view returns (string partyAId, string partyBId, uint256 bettingEndTime, uint8 status)",
      "event ContractCreated(uint256 indexed contractId, address indexed creator, string topic, string description, string partyAId, string partyAName, string partyADescription, string partyBId, string partyBName, string partyBDescription, uint256 bettingEndTime)",
      "event BetRevealed(uint256 indexed contractId, address indexed bettor, uint8 choice, uint256 amount)",
      "event WinnerDeclared(uint256 indexed contractId, uint8 winner)"
    ];
  }

  async declareWinner(
    contractId: string,
    winner: Choice
  ): Promise<string> {
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
        error: error.message, 
        contractId, 
        winner 
      });
      throw new Error('Failed to declare winner on blockchain');
    }
  }

  async getContract(contractAddress: string): Promise<ContractData> {
    try {
      const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
      const contractData = await contract.getContract(contractAddress);
      
      return {
        id: contractData.id,
        creator: contractData.creator,
        topic: contractData.topic,
        description: contractData.description,
        partyAInfo: {
          id: contractData.partyAId,
          name: contractData.partyAName,
          description: contractData.partyADescription
        },
        partyBInfo: {
          id: contractData.partyBId,
          name: contractData.partyBName,
          description: contractData.partyBDescription
        },
        bettingEndTime: Number(contractData.bettingEndTime),
        winnerRewardPercentage: Number(contractData.winnerRewardPercentage),
        status: Number(contractData.status),
        winnerId: contractData.winnerId ? contractData.winnerId.toString() : undefined
      };
    } catch (error) {
      logger.error('Failed to get contract data', { error: error.message, contractAddress });
      throw new Error('Failed to get contract data from blockchain');
    }
  }

  async getContractStats(contractAddress: string): Promise<BettingStats> {
    try {
      const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
      const stats = await contract.getContractStats(contractAddress);
      
      return {
        totalBets: Number(stats.totalBets),
        totalAmount: stats.totalAmount.toString(),
        uniqueParticipants: Number(stats.uniqueParticipants),
        partyABets: Number(stats.partyABets),
        partyBBets: Number(stats.partyBBets),
        partyAAmount: stats.partyAAmount.toString(),
        partyBAmount: stats.partyBAmount.toString(),
        averageBetAmount: stats.averageBetAmount.toString()
      };
    } catch (error) {
      logger.error('Failed to get contract stats', { error: error.message, contractAddress });
      throw new Error('Failed to get contract stats from blockchain');
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

  listenToContractCreated(
    callback: (event: ContractEventData) => void
  ): void {
    const contractAddress = process.env.MAIN_CONTRACT_ADDRESS;
    if (!contractAddress) {
      logger.error('Main contract address not configured for event listening');
      return;
    }

    const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
    const key = `${contractAddress}-ContractCreated`;
    
    if (this.eventListeners.has(key)) {
      logger.warn('ContractCreated event listener already exists, removing old listener');
      this.removeEventListener(contractAddress, 'ContractCreated');
    }
    
    contract.on('ContractCreated', (contractId, creator, topic, description, partyAId, partyAName, partyADescription, partyBId, partyBName, partyBDescription, bettingEndTime, event) => {
      const eventData: ContractEventData = {
        contractId: contractId.toString(),
        creator,
        topic,
        description,
        partyAInfo: {
          id: partyAId,
          name: partyAName,
          description: partyADescription
        },
        partyBInfo: {
          id: partyBId,
          name: partyBName,
          description: partyBDescription
        },
        bettingEndTime: Number(bettingEndTime),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      };
      
      logger.info('ContractCreated event received', { contractId: eventData.contractId });
      callback(eventData);
    });
    
    this.eventListeners.set(key, contract);
    logger.info('ContractCreated event listener registered', { contractAddress });
  }

  listenToBetRevealed(
    contractAddress: string,
    callback: (event: BetRevealedEvent) => void
  ): void {
    const contract = new ethers.Contract(contractAddress, this.contractABI, this.provider);
    const key = `${contractAddress}-BetRevealed`;
    
    if (this.eventListeners.has(key)) {
      logger.warn('BetRevealed event listener already exists, removing old listener', { contractAddress });
      this.removeEventListener(contractAddress, 'BetRevealed');
    }
    
    contract.on('BetRevealed', (contractId, bettor, choice, amount, event) => {
      const eventData: BetRevealedEvent = {
        contractId: contractId.toString(),
        bettor,
        choice: Number(choice),
        amount: amount.toString(),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      };
      
      logger.info('BetRevealed event received', { 
        contractId: eventData.contractId, 
        bettor: eventData.bettor,
        choice: eventData.choice 
      });
      callback(eventData);
    });
    
    this.eventListeners.set(key, contract);
    logger.info('BetRevealed event listener registered', { contractAddress });
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