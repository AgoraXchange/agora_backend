import { Choice } from '../entities/Choice';
import { BettingStats, ContractEventData, BetRevealedEvent } from '../entities/BettingStats';

export interface ContractData {
  id: string;
  creator: string;
  topic: string;
  description: string;
  partyAInfo: {
    id: string;
    name: string;
    description: string;
  };
  partyBInfo: {
    id: string;
    name: string;
    description: string;
  };
  bettingEndTime: number;
  winnerRewardPercentage: number;
  status: number;
  winnerId?: string;
}

export interface IBlockchainService {
  declareWinner(
    contractId: string,
    winner: Choice
  ): Promise<string>;

  getContract(contractAddress: string): Promise<ContractData>;
  
  getContractStats(contractAddress: string): Promise<BettingStats>;
  
  getContractState(contractAddress: string): Promise<{
    partyAId: string;
    partyBId: string;
    bettingEndTime: number;
    status: number;
  }>;
  
  listenToContractCreated(
    callback: (event: ContractEventData) => void
  ): void;

  listenToBetRevealed(
    contractAddress: string,
    callback: (event: BetRevealedEvent) => void
  ): void;
  
  listenToContractEvents(
    contractAddress: string,
    eventName: string,
    callback: (event: any) => void
  ): void;

  removeEventListener(contractAddress: string, eventName: string): void;
  
  cleanup(): void;
}