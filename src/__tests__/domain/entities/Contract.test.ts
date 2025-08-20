import { Contract, ContractStatus } from '../../../domain/entities/Contract';
import { Party } from '../../../domain/entities/Party';

describe('Contract Entity', () => {
  let partyA: Party;
  let partyB: Party;
  let contract: Contract;

  beforeEach(() => {
    partyA = new Party('party-a', '0x123', 'Party A', 'Description A');
    partyB = new Party('party-b', '0x456', 'Party B', 'Description B');
    
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);
    
    contract = new Contract(
      'contract-1',
      '0x789',
      partyA,
      partyB,
      futureDate,
      10,
      ContractStatus.BETTING_OPEN
    );
  });

  describe('isBettingOpen', () => {
    it('should return true when status is BETTING_OPEN and before end time', () => {
      expect(contract.isBettingOpen()).toBe(true);
    });

    it('should return false when status is not BETTING_OPEN', () => {
      contract.status = ContractStatus.BETTING_CLOSED;
      expect(contract.isBettingOpen()).toBe(false);
    });

    it('should return false when past betting end time', () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);
      contract = new Contract(
        'contract-2',
        '0x789',
        partyA,
        partyB,
        pastDate,
        10,
        ContractStatus.BETTING_OPEN
      );
      expect(contract.isBettingOpen()).toBe(false);
    });
  });

  describe('setWinner', () => {
    beforeEach(() => {
      contract.status = ContractStatus.BETTING_CLOSED;
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);
      contract = new Contract(
        'contract-3',
        '0x789',
        partyA,
        partyB,
        pastDate,
        10,
        ContractStatus.BETTING_CLOSED
      );
    });

    it('should set winner when valid party ID', () => {
      contract.setWinner(partyA.id);
      expect(contract.winnerId).toBe(partyA.id);
      expect(contract.status).toBe(ContractStatus.DECIDED);
    });

    it('should throw error when invalid party ID', () => {
      expect(() => contract.setWinner('invalid-id')).toThrow(
        'Winner must be either party A or party B'
      );
    });

    it('should throw error when cannot decide winner', () => {
      contract.status = ContractStatus.BETTING_OPEN;
      expect(() => contract.setWinner(partyA.id)).toThrow(
        'Cannot decide winner at this stage'
      );
    });
  });
});