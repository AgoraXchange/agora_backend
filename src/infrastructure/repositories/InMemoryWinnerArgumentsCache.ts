import { injectable } from 'inversify';
import { IWinnerArgumentsCache } from '../../domain/repositories/IWinnerArgumentsCache';
import { WinnerJuryArguments } from '../../domain/valueObjects/WinnerJuryArguments';

@injectable()
export class InMemoryWinnerArgumentsCache implements IWinnerArgumentsCache {
  private store = new Map<string, { data: WinnerJuryArguments; createdAt: number }>();
  private ttlMs: number | null;

  constructor() {
    const ttl = process.env.WINNER_ARGS_CACHE_TTL_MS;
    this.ttlMs = ttl ? parseInt(ttl, 10) : null;
  }

  async getByContractId(contractId: string): Promise<WinnerJuryArguments | null> {
    const entry = this.store.get(contractId);
    if (!entry) return null;
    if (this.ttlMs && Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(contractId);
      return null;
    }
    return entry.data;
  }

  async save(contractId: string, data: WinnerJuryArguments): Promise<void> {
    this.store.set(contractId, { data, createdAt: Date.now() });
  }
}

