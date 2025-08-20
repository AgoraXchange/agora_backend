import { injectable } from 'inversify';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { Contract, ContractStatus } from '../../domain/entities/Contract';

@injectable()
export class InMemoryContractRepository implements IContractRepository {
  private contracts: Map<string, Contract> = new Map();

  async findById(id: string): Promise<Contract | null> {
    return this.contracts.get(id) || null;
  }

  async findByAddress(address: string): Promise<Contract | null> {
    for (const contract of this.contracts.values()) {
      if (contract.contractAddress === address) {
        return contract;
      }
    }
    return null;
  }

  async findContractsReadyForDecision(): Promise<Contract[]> {
    const readyContracts: Contract[] = [];
    const now = new Date();
    
    for (const contract of this.contracts.values()) {
      if (contract.status === ContractStatus.BETTING_CLOSED && 
          now >= contract.bettingEndTime && 
          !contract.winnerId) {
        readyContracts.push(contract);
      }
    }
    
    return readyContracts;
  }

  async save(contract: Contract): Promise<void> {
    this.contracts.set(contract.id, contract);
  }

  async update(contract: Contract): Promise<void> {
    this.contracts.set(contract.id, contract);
  }
}