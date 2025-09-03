import { EventEmitter } from 'events';
import { injectable } from 'inversify';
import { 
  DeliberationEventType,
  DeliberationStartedEvent,
  ProposalGeneratedEvent,
  ProposalPhaseCompletedEvent,
  EvaluationStartedEvent,
  PairwiseComparisonEvent,
  JudgmentPhaseCompletedEvent,
  VotingStartedEvent,
  VoteCastEvent,
  ConsensusReachedEvent,
  DeliberationCompletedEvent,
  DeliberationErrorEvent,
  IDeliberationEventListener
} from '../../../domain/events/DeliberationEvent';
import { DeliberationMessage } from '../../../domain/valueObjects/DeliberationMessage';
import { logger } from '../../logging/Logger';

@injectable()
export class DeliberationEventEmitter extends EventEmitter {
  private listenersMap: Map<string, IDeliberationEventListener[]> = new Map();
  private messageHistory: Map<string, DeliberationMessage[]> = new Map();

  constructor() {
    super();
    this.setMaxListeners(50); // Increase limit for multiple clients
  }

  /**
   * Registers a listener for a specific contract's deliberation
   */
  registerListener(contractId: string, listener: IDeliberationEventListener): void {
    if (!this.listenersMap.has(contractId)) {
      this.listenersMap.set(contractId, []);
    }
    this.listenersMap.get(contractId)!.push(listener);
    
    logger.debug('Deliberation listener registered', { contractId });
  }

  /**
   * Unregisters a listener
   */
  unregisterListener(contractId: string, listener: IDeliberationEventListener): void {
    const contractListeners = this.listenersMap.get(contractId);
    if (contractListeners) {
      const index = contractListeners.indexOf(listener);
      if (index > -1) {
        contractListeners.splice(index, 1);
      }
      
      if (contractListeners.length === 0) {
        this.listenersMap.delete(contractId);
      }
    }
    
    logger.debug('Deliberation listener unregistered', { contractId });
  }

  /**
   * Emits a deliberation event and calls appropriate listeners
   */
  emitDeliberationEvent(event: DeliberationEventType): void {
    const contractId = event.contractId;
    const eventName = event.constructor.name;
    
    // Emit generic event for EventEmitter subscribers
    this.emit('deliberation-event', event);
    this.emit(`deliberation-event:${contractId}`, event);
    
    // Call specific listeners
    const contractListeners = this.listenersMap.get(contractId) || [];
    contractListeners.forEach(listener => {
      try {
        this.callSpecificListener(listener, event);
      } catch (error) {
        logger.error('Error calling deliberation listener', {
          contractId,
          eventName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
    
    logger.debug('Deliberation event emitted', {
      contractId,
      eventName,
      listenersCount: contractListeners.length
    });
  }

  /**
   * Emits a deliberation message for real-time streaming
   */
  emitMessage(contractId: string, message: DeliberationMessage): void {
    // Store message in history
    if (!this.messageHistory.has(contractId)) {
      this.messageHistory.set(contractId, []);
    }
    this.messageHistory.get(contractId)!.push(message);
    
    // Emit for SSE streaming
    this.emit('message', contractId, message);
    this.emit(`message:${contractId}`, message);
    
    logger.debug('Deliberation message emitted', {
      contractId,
      messageType: message.messageType,
      messageId: message.id
    });
  }

  /**
   * Gets message history for a contract
   */
  getMessageHistory(contractId: string): DeliberationMessage[] {
    return this.messageHistory.get(contractId) || [];
  }

  /**
   * Clears message history for a contract (cleanup)
   */
  clearMessageHistory(contractId: string): void {
    this.messageHistory.delete(contractId);
    logger.debug('Message history cleared', { contractId });
  }

  /**
   * Gets active listener count
   */
  getListenerCount(contractId: string): number {
    return (this.listenersMap.get(contractId) || []).length + this.listenerCount(`message:${contractId}`);
  }

  /**
   * Helper method to call specific listener methods
   */
  private callSpecificListener(listener: IDeliberationEventListener, event: DeliberationEventType): void {
    if (event instanceof DeliberationStartedEvent && listener.onDeliberationStarted) {
      listener.onDeliberationStarted(event);
    } else if (event instanceof ProposalGeneratedEvent && listener.onProposalGenerated) {
      listener.onProposalGenerated(event);
    } else if (event instanceof ProposalPhaseCompletedEvent && listener.onProposalPhaseCompleted) {
      listener.onProposalPhaseCompleted(event);
    } else if (event instanceof EvaluationStartedEvent && listener.onEvaluationStarted) {
      listener.onEvaluationStarted(event);
    } else if (event instanceof PairwiseComparisonEvent && listener.onPairwiseComparison) {
      listener.onPairwiseComparison(event);
    } else if (event instanceof JudgmentPhaseCompletedEvent && listener.onJudgmentPhaseCompleted) {
      listener.onJudgmentPhaseCompleted(event);
    } else if (event instanceof VotingStartedEvent && listener.onVotingStarted) {
      listener.onVotingStarted(event);
    } else if (event instanceof VoteCastEvent && listener.onVoteCast) {
      listener.onVoteCast(event);
    } else if (event instanceof ConsensusReachedEvent && listener.onConsensusReached) {
      listener.onConsensusReached(event);
    } else if (event instanceof DeliberationCompletedEvent && listener.onDeliberationCompleted) {
      listener.onDeliberationCompleted(event);
    } else if (event instanceof DeliberationErrorEvent && listener.onDeliberationError) {
      listener.onDeliberationError(event);
    }
  }

  /**
   * Cleanup method to remove old message histories
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): void { // Default: 24 hours
    const now = new Date().getTime();
    let cleanedCount = 0;
    
    for (const [contractId, messages] of this.messageHistory.entries()) {
      if (messages.length > 0) {
        const lastMessageTime = messages[messages.length - 1].metadata.timestamp.getTime();
        if (now - lastMessageTime > maxAge) {
          this.messageHistory.delete(contractId);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      logger.info('Deliberation message history cleanup completed', {
        cleanedContracts: cleanedCount,
        remainingContracts: this.messageHistory.size
      });
    }
  }
}
