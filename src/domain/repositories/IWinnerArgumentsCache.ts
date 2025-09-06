import { WinnerJuryArguments } from '../../domain/valueObjects/WinnerJuryArguments';

export interface IWinnerArgumentsCache {
  getByContractId(contractId: string): Promise<WinnerJuryArguments | null>;
  save(contractId: string, data: WinnerJuryArguments): Promise<void>;
}

