import { injectable, inject } from 'inversify';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { DecideWinnerUseCase } from './DecideWinnerUseCase';

@injectable()
export class MonitorContractsUseCase {
  constructor(
    @inject('IContractRepository') private contractRepository: IContractRepository,
    @inject('DecideWinnerUseCase') private decideWinnerUseCase: DecideWinnerUseCase
  ) {}

  async execute(): Promise<void> {
    const contractsReadyForDecision = await this.contractRepository.findContractsReadyForDecision();
    
    for (const contract of contractsReadyForDecision) {
      console.log(`Processing contract ${contract.id} for winner decision`);
      
      const result = await this.decideWinnerUseCase.execute({
        contractId: contract.id
      });
      
      if (result.success) {
        console.log(`Winner decided for contract ${contract.id}: ${result.winnerId}`);
      } else {
        console.error(`Failed to decide winner for contract ${contract.id}: ${result.error}`);
      }
    }
  }
}