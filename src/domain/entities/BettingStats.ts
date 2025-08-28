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
  topic: string;          // Agreement title/topic
  description: string;    // Agreement description
  partyA: string;         // Simplified to just string
  partyB: string;         // Simplified to just string
  bettingEndTime: number; // Unix timestamp
  blockNumber: number;
  transactionHash: string;
}

export interface BetPlacedEvent {
  contractId: string;
  bettor: string;
  choice: number; // 1=A, 2=B
  amount: string;
  blockNumber: number;
  transactionHash: string;
}

// Keep the old name as alias for backward compatibility during transition
export type BetRevealedEvent = BetPlacedEvent;