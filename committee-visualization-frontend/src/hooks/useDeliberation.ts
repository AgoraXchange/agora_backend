import { useState, useCallback, useRef } from 'react';
import { oracleService } from '@/services/api/oracle.service';
import { deliberationService } from '@/services/api/deliberation.service';
import { useSSE } from './useSSE';
import type { 
  DeliberationMessage, 
  DeliberationPhase, 
  DeliberationVisualization,
  DeliberationEventPayload 
} from '@/types/deliberation';
import type { 
  AgentStatus 
} from '@/types/agent';
import type { 
  CommitteeConfig, 
  OracleDecisionResponse 
} from '@/types/api';

interface UseDeliberationOptions {
  onComplete?: (result: OracleDecisionResponse, visualization?: DeliberationVisualization) => void;
  onError?: (error: string) => void;
  onPhaseChange?: (phase: DeliberationPhase) => void;
}

interface UseDeliberationReturn {
  // State
  isDeliberating: boolean;
  currentPhase: DeliberationPhase;
  messages: DeliberationMessage[];
  agentStatuses: AgentStatus[];
  deliberationId: string | null;
  error: string | null;
  result: OracleDecisionResponse | null;
  visualization: DeliberationVisualization | null;
  
  // Actions
  startDeliberation: (contractId: string, config?: CommitteeConfig) => Promise<void>;
  stopDeliberation: () => void;
  clearMessages: () => void;
  
  // SSE Status
  isConnected: boolean;
  reconnect: () => void;
}

export function useDeliberation(options: UseDeliberationOptions = {}): UseDeliberationReturn {
  const { onComplete, onError, onPhaseChange } = options;
  
  const [isDeliberating, setIsDeliberating] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<DeliberationPhase>('proposing');
  const [messages, setMessages] = useState<DeliberationMessage[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [deliberationId, setDeliberationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OracleDecisionResponse | null>(null);
  const [visualization, setVisualization] = useState<DeliberationVisualization | null>(null);
  
  const isDeliberatingRef = useRef(false);

  // Handle SSE messages
  const handleSSEMessage = useCallback((event: DeliberationEventPayload) => {
    console.log('📨 Deliberation event received:', {
      type: event.type,
      hasData: !!event.data,
      timestamp: new Date().toISOString()
    });
    
    // Handle message type from SSE stream
    if (event.type === 'message' && event.data) {
      const messageData = event.data as DeliberationMessage;
      console.log('📬 Processing message:', {
        messageType: messageData.messageType,
        phase: messageData.phase,
        agentName: messageData.agentName,
        hasContent: !!messageData.content
      });
      
      // Add message to list
      setMessages(prev => [...prev, messageData]);
      
      // Update phase based on message
      if (messageData.phase && messageData.phase !== currentPhase) {
        setCurrentPhase(messageData.phase);
        onPhaseChange?.(messageData.phase);
      }
      
      // Update agent status based on message type
      if (messageData.messageType === 'proposal' && messageData.agentName) {
        setAgentStatuses(prev => prev.map(status => {
          if (status.agentId.includes(messageData.agentName?.toLowerCase() || '')) {
            return { ...status, status: 'completed', currentTask: 'Proposal submitted' };
          }
          return status;
        }));
      }
      
      // Check for synthesis/completion
      if (messageData.messageType === 'synthesis') {
        setCurrentPhase('completed');
        setIsDeliberating(false);
        isDeliberatingRef.current = false;
        
        // Create result from synthesis message
        const synthResult = {
          decisionId: deliberationId || '',
          winnerId: messageData.content.winner,
          transactionHash: '0xmock',
          metadata: {
            confidence: messageData.content.confidence || 0.85,
            reasoning: messageData.content.reasoning || '',
            dataPoints: {},
            timestamp: new Date()
          }
        };
        
        setResult(synthResult);
        onPhaseChange?.('completed');
        onComplete?.(synthResult);
      }
      
      return;
    }
    
    // Handle info and connection messages
    if (event.type === 'info' || event.type === 'connection') {
      console.log('ℹ️ Info message:', event.message);
      return;
    }
    
    // Handle other event types
    switch (event.type) {
      case 'connection':
        console.log('✅ SSE Connection established:', event.message);
        break;
        
      case 'info':
        console.log('ℹ️ SSE Info:', event.message, 'Contract:', event.contractId);
        break;
        
      case 'event':
        if (event.data && 'eventType' in event.data) {
          console.log('📡 Event:', event.data.eventType);
          // Handle different event types if needed
        }
        break;
        
      case 'error':
        const errorMessage = event.data?.message || 'An error occurred during deliberation';
        setError(errorMessage);
        setIsDeliberating(false);
        isDeliberatingRef.current = false;
        onError?.(errorMessage);
        break;

      default:
        console.log('🤷 Unhandled event type:', event.type, event);
    }
  }, [deliberationId, onComplete, onError, onPhaseChange]);

  // SSE connection
  const { isConnected, reconnect } = useSSE(deliberationId, {
    onMessage: handleSSEMessage,
    onError: (error) => {
      console.error('SSE Error:', error);
      if (isDeliberatingRef.current) {
        setError('Connection lost during deliberation');
      }
    },
    onOpen: () => {
      console.log('SSE Connected for deliberation:', deliberationId);
      setError(null);
    }
  });

  const startDeliberation = useCallback(async (
    contractId: string, 
    config?: CommitteeConfig
  ) => {
    if (isDeliberating) {
      console.warn('Deliberation already in progress');
      return;
    }

    try {
      setIsDeliberating(true);
      isDeliberatingRef.current = true;
      setError(null);
      setResult(null);
      setVisualization(null);
      setCurrentPhase('proposing');
      setMessages([]);
      
      // Initialize agent statuses
      const initialStatuses: AgentStatus[] = [
        { agentId: 'gpt4-proposer', status: 'thinking', currentTask: 'Analyzing contract data...' },
        { agentId: 'claude-proposer', status: 'thinking', currentTask: 'Evaluating options...' },
        { agentId: 'gemini-proposer', status: 'thinking', currentTask: 'Processing information...' }
      ];
      setAgentStatuses(initialStatuses);

      console.log('🚀 Starting deliberation for contract:', contractId);
      
      // Use the new async start endpoint
      const response = await oracleService.startDeliberation(contractId, config);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to start deliberation');
      }

      // Extract deliberation ID from response
      if (response.data?.deliberationId) {
        setDeliberationId(response.data.deliberationId);
        console.log('📝 Deliberation started with ID:', response.data.deliberationId);
        console.log('📨 SSE connection will be established automatically');
      } else {
        throw new Error('No deliberation ID received from server');
      }

    } catch (error) {
      console.error('Failed to start deliberation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start deliberation';
      setError(errorMessage);
      setIsDeliberating(false);
      isDeliberatingRef.current = false;
      onError?.(errorMessage);
    }
  }, [isDeliberating, onError]);

  const stopDeliberation = useCallback(() => {
    setIsDeliberating(false);
    isDeliberatingRef.current = false;
    setDeliberationId(null);
    setAgentStatuses([]);
    setError(null);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setResult(null);
    setVisualization(null);
    setError(null);
  }, []);

  return {
    // State
    isDeliberating,
    currentPhase,
    messages,
    agentStatuses,
    deliberationId,
    error,
    result,
    visualization,
    
    // Actions
    startDeliberation,
    stopDeliberation,
    clearMessages,
    
    // SSE Status
    isConnected,
    reconnect
  };
}