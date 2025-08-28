import { Contract } from '../entities/Contract';

export interface IContractRepository {
  findById(id: string): Promise<Contract | null>;
  findByAddress(address: string): Promise<Contract | null>;
  findAll(): Promise<Contract[]>;
  findContractsReadyForDecision(): Promise<Contract[]>;
  save(contract: Contract): Promise<void>;
  update(contract: Contract): Promise<void>;
}