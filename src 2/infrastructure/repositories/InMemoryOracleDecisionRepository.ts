import { injectable } from 'inversify';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { OracleDecision } from '../../domain/entities/OracleDecision';

@injectable()
export class InMemoryOracleDecisionRepository implements IOracleDecisionRepository {
  private decisions: Map<string, OracleDecision> = new Map();

  async findById(id: string): Promise<OracleDecision | null> {
    return this.decisions.get(id) || null;
  }

  async findByContractId(contractId: string): Promise<OracleDecision | null> {
    for (const decision of this.decisions.values()) {
      if (decision.contractId === contractId) {
        return decision;
      }
    }
    return null;
  }

  async save(decision: OracleDecision): Promise<void> {
    this.decisions.set(decision.id, decision);
  }
}