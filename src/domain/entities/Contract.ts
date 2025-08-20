import { Party } from './Party';

export enum ContractStatus {
  CREATED = 'CREATED',
  BETTING_OPEN = 'BETTING_OPEN',
  BETTING_CLOSED = 'BETTING_CLOSED',
  DECIDED = 'DECIDED',
  DISTRIBUTED = 'DISTRIBUTED'
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
    public winnerId?: string
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