import { OracleDecision } from '../entities/OracleDecision';

export interface IOracleDecisionRepository {
  findById(id: string): Promise<OracleDecision | null>;
  findByContractId(contractId: string): Promise<OracleDecision | null>;
  save(decision: OracleDecision): Promise<void>;
}