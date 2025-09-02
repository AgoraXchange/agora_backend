import { Contract } from '../entities/Contract';

export interface IContractRepository {
  findById(id: string): Promise<Contract | null>;
  findByAddress(address: string): Promise<Contract | null>;
  findContractsReadyForDecision(): Promise<Contract[]>;
  /**
   * Contracts whose betting should be closed now based on local data
   * (status CREATED or BETTING_OPEN) and bettingEndTime <= now.
   */
  findContractsToClose(): Promise<Contract[]>;
  save(contract: Contract): Promise<void>;
  update(contract: Contract): Promise<void>;
}
