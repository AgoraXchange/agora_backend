export enum Choice {
  NONE = 0,
  A = 1,
  B = 2
}

export class ChoiceConverter {
  static fromPartyId(partyId: string, partyAId: string, partyBId: string): Choice {
    // First try to parse contractId:choice format (e.g., "0:1" or "0:2")
    const parts = partyId.split(':');
    if (parts.length === 2) {
      const choiceValue = parseInt(parts[1]);
      if (choiceValue === 1) return Choice.A;
      if (choiceValue === 2) return Choice.B;
    }
    
    // Fallback to direct comparison for backward compatibility
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