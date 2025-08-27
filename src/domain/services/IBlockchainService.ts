import { Choice } from '../entities/Choice';
import { BettingStats, ContractEventData, BetPlacedEvent, BetRevealedEvent } from '../entities/BettingStats';

// Matches the actual smart contract return values
export interface ContractData {
  contractId: string;
  creator: string;
  partyA: string;  // Simple string from contract
  partyB: string;  // Simple string from contract
  bettingEndTime: number;
  status: number;  // ContractStatus enum value
  winner: number;  // Choice enum value
  totalPoolA: string;  // BigInt as string
  totalPoolB: string;  // BigInt as string
  partyRewardPercentage: number;
}

export interface IBlockchainService {
  declareWinner(
    contractId: string,
    winner: Choice
  ): Promise<string>;

  getContract(contractId: string): Promise<ContractData>;
  
  // getContractStats removed - not in smart contract
  
  listenToContractCreated(
    callback: (event: ContractEventData) => void
  ): void;

  listenToBetPlaced(
    contractAddress: string,
    callback: (event: BetPlacedEvent) => void
  ): void;
  
  // Keep old name for backward compatibility
  listenToBetRevealed?(
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