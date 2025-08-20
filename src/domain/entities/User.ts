export enum UserRole {
  ADMIN = 'ADMIN',
  ORACLE_NODE = 'ORACLE_NODE',
  CLIENT = 'CLIENT'
}

export class User {
  constructor(
    public readonly id: string,
    public readonly username: string,
    public readonly passwordHash: string,
    public readonly role: UserRole,
    public readonly apiKey?: string,
    public readonly createdAt: Date = new Date(),
    public readonly lastLoginAt?: Date
  ) {}

  canDecideWinner(): boolean {
    return this.role === UserRole.ADMIN || this.role === UserRole.ORACLE_NODE;
  }
}