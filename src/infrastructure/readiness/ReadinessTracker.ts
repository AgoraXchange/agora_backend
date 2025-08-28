import { logger } from '../logging/Logger';

export interface ReadinessState {
  component: string;
  ready: boolean;
  error?: string;
  timestamp: Date;
}

export class ReadinessTracker {
  private states = new Map<string, ReadinessState>();
  private startTime = new Date();

  constructor() {
    logger.info('ReadinessTracker initialized');
  }

  /**
   * Mark a component as ready
   */
  markReady(component: string): void {
    this.states.set(component, {
      component,
      ready: true,
      timestamp: new Date()
    });
    logger.info(`Component ready: ${component}`);
  }

  /**
   * Mark a component as not ready with optional error
   */
  markNotReady(component: string, error?: string): void {
    this.states.set(component, {
      component,
      ready: false,
      error,
      timestamp: new Date()
    });
    logger.warn(`Component not ready: ${component}${error ? ` - ${error}` : ''}`);
  }

  /**
   * Check if a specific component is ready
   */
  isComponentReady(component: string): boolean {
    const state = this.states.get(component);
    return state?.ready ?? false;
  }

  /**
   * Check if all registered components are ready
   */
  isAllReady(): boolean {
    if (this.states.size === 0) {
      return false; // No components registered yet
    }
    
    for (const state of this.states.values()) {
      if (!state.ready) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get detailed readiness status
   */
  getReadinessStatus() {
    const components = Array.from(this.states.values());
    const readyCount = components.filter(c => c.ready).length;
    const totalCount = components.length;
    
    return {
      overall: this.isAllReady(),
      uptime: Date.now() - this.startTime.getTime(),
      components: {
        total: totalCount,
        ready: readyCount,
        details: components.map(c => ({
          name: c.component,
          ready: c.ready,
          error: c.error,
          timestamp: c.timestamp
        }))
      }
    };
  }

  /**
   * Get components that are not ready
   */
  getNotReadyComponents(): string[] {
    return Array.from(this.states.values())
      .filter(state => !state.ready)
      .map(state => state.component);
  }

  /**
   * Reset all component states
   */
  reset(): void {
    this.states.clear();
    logger.info('ReadinessTracker reset');
  }
}

// Global singleton instance
export const readinessTracker = new ReadinessTracker();