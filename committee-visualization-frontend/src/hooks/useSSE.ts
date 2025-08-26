import { useEffect, useRef, useState } from 'react';
import { deliberationService } from '@/services/api/deliberation.service';
import { API_CONFIG } from '@/config/api.config';
import type { DeliberationEventPayload } from '@/types/deliberation';

interface UseSSEOptions {
  onMessage?: (event: DeliberationEventPayload) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

interface UseSSEReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectCount: number;
  disconnect: () => void;
  reconnect: () => void;
}

export function useSSE(
  deliberationId: string | null,
  options: UseSSEOptions = {}
): UseSSEReturn {
  const {
    onMessage,
    onError,
    onOpen,
    onClose,
    autoReconnect = true,
    maxReconnectAttempts = 5
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldConnectRef = useRef(true);

  const disconnect = () => {
    shouldConnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
  };

  const connect = () => {
    if (!deliberationId || eventSourceRef.current) return;

    setIsConnecting(true);
    setError(null);

    try {
      const eventSource = deliberationService.createDeliberationStream(deliberationId);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('🔌 SSE connection opened for deliberation:', deliberationId);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        setReconnectCount(0);
        onOpen?.();
      };

      eventSource.onmessage = (event) => {
        try {
          console.log('📥 Raw SSE message received:', event.data.substring(0, 100));
          const parsedData = deliberationService.parseSSEMessage(event.data);
          if (parsedData) {
            console.log('📨 Parsed deliberation event:', {
              type: parsedData.type,
              hasData: !!parsedData.data,
              dataKeys: parsedData.data ? Object.keys(parsedData.data) : []
            });
            onMessage?.(parsedData);
          }
        } catch (error) {
          console.error('Failed to process SSE message:', error);
        }
      };

      eventSource.onerror = (event) => {
        console.error('❌ SSE connection error:', event);
        
        setIsConnected(false);
        setIsConnecting(false);
        setError('Connection lost');
        
        onError?.(event);

        // Auto-reconnect logic
        if (
          autoReconnect && 
          shouldConnectRef.current && 
          reconnectCount < maxReconnectAttempts
        ) {
          console.log(`🔄 Attempting to reconnect (${reconnectCount + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectCount(prev => prev + 1);
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
            if (shouldConnectRef.current) {
              connect();
            }
          }, API_CONFIG.SSE_RETRY_INTERVAL * Math.pow(2, reconnectCount)); // Exponential backoff
        } else if (reconnectCount >= maxReconnectAttempts) {
          setError('Maximum reconnection attempts reached');
          onClose?.();
        }
      };

    } catch (error) {
      console.error('Failed to create SSE connection:', error);
      setError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnecting(false);
    }
  };

  const reconnect = () => {
    disconnect();
    shouldConnectRef.current = true;
    setReconnectCount(0);
    setTimeout(connect, 100); // Small delay before reconnecting
  };

  // Effect to manage connection lifecycle
  useEffect(() => {
    shouldConnectRef.current = true;
    
    if (deliberationId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [deliberationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    error,
    reconnectCount,
    disconnect,
    reconnect
  };
}