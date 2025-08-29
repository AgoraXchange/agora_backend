export interface WinnerJuryArguments {
  Jury1: string;
  Jury2: string;
  Jury3: string;
  Conclusion: string;
}

export function isWinnerJuryArguments(obj: any): obj is WinnerJuryArguments {
  return obj && typeof obj === 'object'
    && typeof obj.Jury1 === 'string'
    && typeof obj.Jury2 === 'string'
    && typeof obj.Jury3 === 'string'
    && typeof obj.Conclusion === 'string';
}
