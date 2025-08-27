export interface IBlockchainService {
  submitWinnerDecision(
    contractAddress: string,
    winnerId: string,
    proof: string
  ): Promise<string>;
  
  getContractState(contractAddress: string): Promise<{
    partyAId: string;
    partyBId: string;
    bettingEndTime: number;
    status: number;
  }>;
  
  listenToContractEvents(
    contractAddress: string,
    eventName: string,
    callback: (event: any) => void
  ): void;
}