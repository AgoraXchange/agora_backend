import { injectable } from 'inversify';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { OracleDecision } from '../../domain/entities/OracleDecision';
import { WinnerJuryArguments } from '../../domain/valueObjects/WinnerJuryArguments';

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

  async saveWinnerArguments(contractId: string, args: WinnerJuryArguments): Promise<void> {
    for (const [id, decision] of this.decisions.entries()) {
      if (decision.contractId === contractId) {
        (decision.metadata as any).dataPoints = {
          ...(decision.metadata?.dataPoints || {}),
          winnerArguments: args
        };
        this.decisions.set(id, decision);
        break;
      }
    }
  }
}
