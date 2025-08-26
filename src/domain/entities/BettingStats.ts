export interface BettingStats {
  totalBets: number;
  totalAmount: string; // BigInt as string for JSON serialization
  uniqueParticipants: number;
  partyABets: number;
  partyBBets: number;
  partyAAmount: string;
  partyBAmount: string;
  averageBetAmount: string;
}

export interface ContractEventData {
  contractId: string;
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
  bettingEndTime: number; // Unix timestamp
  blockNumber: number;
  transactionHash: string;
}

export interface BetRevealedEvent {
  contractId: string;
  bettor: string;
  choice: number; // 1=A, 2=B
  amount: string;
  blockNumber: number;
  transactionHash: string;
}