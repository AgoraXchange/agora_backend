export enum UserRole {
  ADMIN = 'ADMIN',
  ORACLE_NODE = 'ORACLE_NODE',
  CLIENT = 'CLIENT'
}

export interface ApiKey {
  key: string;
  createdAt: Date;
  lastUsedAt?: Date;
  name?: string;
  active?: boolean;
}

export class User {
  constructor(
    public readonly id: string,
    public readonly username: string,
    public readonly passwordHash: string,
    public readonly role: UserRole,
    public readonly apiKey?: string,
    public readonly createdAt: Date = new Date(),
    public readonly lastLoginAt?: Date,
    public readonly email?: string,
    public readonly active: boolean = true,
    public readonly apiKeys: ApiKey[] = [],
    public readonly updatedAt?: Date
  ) {}

  canDecideWinner(): boolean {
    return this.role === UserRole.ADMIN || this.role === UserRole.ORACLE_NODE;
  }

  hasApiKey(key?: string): boolean {
    if (key) {
      return this.apiKey === key || this.apiKeys.some(k => k.key === key);
    }
    return !!this.apiKey || this.apiKeys.length > 0;
  }

  updateLastApiKeyUsage(key?: string): void {
    if (key) {
      const foundKey = this.apiKeys.find(k => k.key === key);
      if (foundKey) {
        foundKey.lastUsedAt = new Date();
      }
    } else if (this.apiKeys.length > 0) {
      this.apiKeys[0].lastUsedAt = new Date();
    }
  }
}