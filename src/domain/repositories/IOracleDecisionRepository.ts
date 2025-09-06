import { OracleDecision } from '../entities/OracleDecision';
import { WinnerJuryArguments } from '../valueObjects/WinnerJuryArguments';

export interface IOracleDecisionRepository {
  findById(id: string): Promise<OracleDecision | null>;
  findByContractId(contractId: string): Promise<OracleDecision | null>;
  save(decision: OracleDecision): Promise<void>;
  saveWinnerArguments(contractId: string, args: WinnerJuryArguments): Promise<void>;
}
