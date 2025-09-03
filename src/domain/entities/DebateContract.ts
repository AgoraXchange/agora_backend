import { DebateComment } from './DebateComment';

export enum ContractStatus {
  CREATED = 'CREATED',
  BETTING_OPEN = 'BETTING_OPEN',
  BETTING_CLOSED = 'BETTING_CLOSED',
  INVESTIGATING = 'INVESTIGATING',
  DELIBERATING = 'DELIBERATING',
  DECIDED = 'DECIDED',
  DISTRIBUTED = 'DISTRIBUTED'
}

export enum Choice {
  NONE = 'NONE',
  ARGUMENT_A = 'ARGUMENT_A',
  ARGUMENT_B = 'ARGUMENT_B',
  UNDECIDED = 'UNDECIDED'
}

export class DebateContract {
  constructor(
    public readonly id: string,
    public readonly creator: string,           // 이슈 제출자 주소
    public readonly topic: string,             // 토론 주제
    public readonly description: string,       // 주제 설명
    public readonly argumentA: string,         // A 주장
    public readonly argumentB: string,         // B 주장
    public comments: DebateComment[],          // 모든 토론 댓글
    public readonly bettingEndTime: Date,
    public status: ContractStatus,
    public readonly totalPoolA: number = 0,
    public readonly totalPoolB: number = 0,
    public readonly partyRewardPercentage: number,
    public readonly minBetAmount: number,
    public readonly maxBetAmount: number,
    public readonly totalBettors: number = 0,
    public winner?: Choice                     // 승자 선택 (optional params must be last)
  ) {}

  get totalComments(): number {
    return this.comments.length;
  }

  addComment(comment: DebateComment): void {
    this.comments.push(comment);
  }

  isBettingOpen(): boolean {
    return this.status === ContractStatus.BETTING_OPEN && 
           new Date() < this.bettingEndTime;
  }

  canInvestigate(): boolean {
    return this.status === ContractStatus.BETTING_CLOSED &&
           new Date() >= this.bettingEndTime &&
           this.comments.length > 0;
  }

  startInvestigation(): void {
    if (!this.canInvestigate()) {
      throw new Error('Cannot start investigation at this stage');
    }
    this.status = ContractStatus.INVESTIGATING;
  }

  startDeliberation(): void {
    if (this.status !== ContractStatus.INVESTIGATING) {
      throw new Error('Investigation must be completed before deliberation');
    }
    this.status = ContractStatus.DELIBERATING;
  }

  setWinner(winner: Choice): void {
    if (this.status !== ContractStatus.DELIBERATING) {
      throw new Error('Cannot decide winner outside deliberation phase');
    }
    
    if (winner !== Choice.ARGUMENT_A && 
        winner !== Choice.ARGUMENT_B && 
        winner !== Choice.UNDECIDED) {
      throw new Error('Invalid winner choice');
    }
    
    this.winner = winner;
    this.status = ContractStatus.DECIDED;
  }

  toJSON(): object {
    return {
      id: this.id,
      creator: this.creator,
      topic: this.topic,
      description: this.description,
      argumentA: this.argumentA,
      argumentB: this.argumentB,
      totalComments: this.totalComments,
      bettingEndTime: this.bettingEndTime,
      status: this.status,
      winner: this.winner,
      totalPoolA: this.totalPoolA,
      totalPoolB: this.totalPoolB,
      partyRewardPercentage: this.partyRewardPercentage,
      minBetAmount: this.minBetAmount,
      maxBetAmount: this.maxBetAmount,
      totalBettors: this.totalBettors
    };
  }
}
