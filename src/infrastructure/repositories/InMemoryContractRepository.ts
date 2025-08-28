import { injectable } from 'inversify';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { Contract, ContractStatus } from '../../domain/entities/Contract';
import { Party } from '../../domain/entities/Party';

@injectable()
export class InMemoryContractRepository implements IContractRepository {
  private contracts: Map<string, Contract> = new Map();

  async findById(id: string): Promise<Contract | null> {
    // Check if it's a test contract and create it if it doesn't exist
    if (id.startsWith('test_contract_') && !this.contracts.has(id)) {
      this.createTestContract(id);
    }
    return this.contracts.get(id) || null;
  }
  
  private createTestContract(id: string): void {
    // Create test contracts based on the ID pattern
    console.log(`📝 Creating test contract: ${id}`);
    let partyA: Party;
    let partyB: Party;
    let question: string;
    
    if (id.includes('nba')) {
      partyA = new Party('Lakers', '0xlakers', 'Los Angeles Lakers', 'NBA basketball team based in Los Angeles');
      partyB = new Party('Celtics', '0xceltics', 'Boston Celtics', 'NBA basketball team based in Boston');
      question = 'Who won the NBA Finals Game 7?';
    } else if (id.includes('election')) {
      partyA = new Party('Democratic', '0xdemocratic', 'Democratic Candidate', 'Democratic Party candidate for 2024 election');
      partyB = new Party('Republican', '0xrepublican', 'Republican Candidate', 'Republican Party candidate for 2024 election');
      question = 'Who won the 2024 US Presidential Election?';
    } else if (id.includes('market')) {
      partyA = new Party('Yes', '0xabove5000', 'Above 5000', 'S&P 500 index closed above 5000 points');
      partyB = new Party('No', '0xbelow5000', 'Below 5000', 'S&P 500 index closed below 5000 points');
      question = 'Did the S&P 500 close above 5000 points today?';
    } else if (id.includes('worldcup')) {
      partyA = new Party('Argentina', '0xargentina', 'Argentina National Team', 'Argentina football national team');
      partyB = new Party('France', '0xfrance', 'France National Team', 'France football national team');
      question = 'Who won the FIFA World Cup Final?';
    } else if (id.includes('crypto')) {
      partyA = new Party('Yes', '0xreached100k', 'Reached $100k', 'Bitcoin reached $100,000 USD this month');
      partyB = new Party('No', '0xnotreached100k', 'Did not reach $100k', 'Bitcoin did not reach $100,000 USD this month');
      question = 'Did Bitcoin reach $100,000 USD this month?';
    } else if (id.includes('oscars')) {
      partyA = new Party('Oppenheimer', '0xoppenheimer', 'Oppenheimer Film', 'Christopher Nolan biographical thriller film');
      partyB = new Party('Barbie', '0xbarbie', 'Barbie Film', 'Greta Gerwig fantasy comedy film');
      question = 'Which film won Best Picture at the Academy Awards?';
    } else if (id.includes('climate')) {
      partyA = new Party('Yes', '0x2024hottest', '2024 Hottest', '2024 was the hottest year on record globally');
      partyB = new Party('No', '0xnothottest', 'Not Hottest', '2024 was not the hottest year on record globally');
      question = 'Was 2024 the hottest year on record globally?';
    } else {
      // Default test contract
      partyA = new Party('OptionA', '0xoptiona', 'Test Option A', 'Default test option A');
      partyB = new Party('OptionB', '0xoptionb', 'Test Option B', 'Default test option B');
      question = 'Test Question';
    }
    
    const testContract = new Contract(
      id,
      `0xtest${id.substring(0, 10)}`, // Mock contract address
      partyA,
      partyB,
      new Date(Date.now() - 3600000), // Betting ended 1 hour ago
      50, // 50% winner reward
      ContractStatus.BETTING_CLOSED // Set status directly in constructor
    );
    
    this.contracts.set(id, testContract);
  }

  async findByAddress(address: string): Promise<Contract | null> {
    for (const contract of this.contracts.values()) {
      if (contract.contractAddress === address) {
        return contract;
      }
    }
    return null;
  }

  async findAll(): Promise<Contract[]> {
    return Array.from(this.contracts.values());
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