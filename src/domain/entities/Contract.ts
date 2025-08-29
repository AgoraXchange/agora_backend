import { Party } from './Party';
import { BettingStats } from './BettingStats';

export enum ContractStatus {
  CREATED = 'CREATED',
  BETTING_OPEN = 'BETTING_OPEN',
  BETTING_CLOSED = 'BETTING_CLOSED',
  DECIDED = 'DECIDED',
  DISTRIBUTED = 'DISTRIBUTED'
}

/**
 * Maps smart contract status (0-3) to ContractStatus enum
 */
export function mapChainStatusToContractStatus(chainStatus: number): ContractStatus {
  switch (chainStatus) {
    case 0: return ContractStatus.BETTING_OPEN;     // Active
    case 1: return ContractStatus.BETTING_CLOSED;   // Closed
    case 2: return ContractStatus.DECIDED;          // Resolved
    case 3: return ContractStatus.DISTRIBUTED;      // Distributed
    case 4: return ContractStatus.DISTRIBUTED;      // Cancelled -> terminal state
    default: return ContractStatus.CREATED;         // Fallback for unknown status
  }
}

export class Contract {
  constructor(
    public readonly id: string,
    public readonly contractAddress: string,
    public readonly partyA: Party,
    public readonly partyB: Party,
    public readonly bettingEndTime: Date,
    public readonly winnerRewardPercentage: number,
    public status: ContractStatus,
    public winnerId?: string,
    public readonly creator?: string,
    public readonly topic?: string,
    public readonly description?: string,
    public bettingStats?: BettingStats
  ) {}

  isBettingOpen(): boolean {
    return this.status === ContractStatus.BETTING_OPEN && 
           new Date() < this.bettingEndTime;
  }

  canDecideWinner(): boolean {
    return this.status === ContractStatus.BETTING_CLOSED &&
           new Date() >= this.bettingEndTime;
  }

  setWinner(winnerId: string): void {
    if (!this.canDecideWinner()) {
      throw new Error('Cannot decide winner at this stage');
    }
    
    if (winnerId !== this.partyA.id && winnerId !== this.partyB.id) {
      throw new Error('Winner must be either party A or party B');
    }
    
    this.winnerId = winnerId;
    this.status = ContractStatus.DECIDED;
  }
}
