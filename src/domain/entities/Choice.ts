export enum Choice {
  NONE = 0,
  A = 1,
  B = 2
}

export class ChoiceConverter {
  static fromPartyId(partyId: string, partyAId: string, partyBId: string): Choice {
    if (partyId === partyAId) return Choice.A;
    if (partyId === partyBId) return Choice.B;
    return Choice.NONE;
  }

  static toPartyId(choice: Choice, partyAId: string, partyBId: string): string | null {
    switch (choice) {
      case Choice.A:
        return partyAId;
      case Choice.B:
        return partyBId;
      default:
        return null;
    }
  }
}