export class Party {
  constructor(
    public readonly id: string,
    public readonly address: string,
    public readonly name: string,
    public readonly description: string
  ) {}

  equals(other: Party): boolean {
    return this.id === other.id;
  }
}