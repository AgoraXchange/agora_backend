import { injectable } from 'inversify';
import { logger } from '../logging/Logger';

@injectable()
export class DecisionCoordinator {
  private inFlight: Set<string> = new Set();
  private cooldownUntil: Map<string, number> = new Map();
  private readonly defaultCooldownMs: number = 15000; // 15s default

  /**
   * Attempt to start work for a contract. Returns true if started, false if blocked
   * by an in-flight job or cooldown window.
   */
  tryStart(contractId: string): boolean {
    const now = Date.now();
    const cd = this.cooldownUntil.get(contractId) || 0;
    if (now < cd) {
      logger.debug('DecisionCoordinator: cooldown active, skipping', { contractId, msRemaining: cd - now });
      return false;
    }
    if (this.inFlight.has(contractId)) {
      logger.debug('DecisionCoordinator: in-flight job exists, skipping', { contractId });
      return false;
    }
    this.inFlight.add(contractId);
    return true;
  }

  /**
   * Mark work finished and start a cooldown window (defaults to 15s).
   */
  finish(contractId: string, cooldownMs?: number): void {
    this.inFlight.delete(contractId);
    const until = Date.now() + (cooldownMs ?? this.defaultCooldownMs);
    this.cooldownUntil.set(contractId, until);
  }

  /**
   * Explicitly set a cooldown (e.g., on hard errors) without marking in-flight.
   */
  setCooldown(contractId: string, cooldownMs: number): void {
    const until = Date.now() + cooldownMs;
    this.cooldownUntil.set(contractId, until);
  }

  isInFlight(contractId: string): boolean {
    return this.inFlight.has(contractId);
  }
}
