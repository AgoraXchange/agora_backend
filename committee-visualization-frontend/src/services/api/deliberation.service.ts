import { apiClient } from './client';
import { API_ENDPOINTS } from '@/config/api.config';
import type { 
  ApiResponse,
  DeliberationStreamEvent 
} from '@/types/api';
import type { 
  DeliberationVisualization, 
  DeliberationMessage,
  DeliberationEventPayload 
} from '@/types/deliberation';

class DeliberationService {
  async getDeliberationVisualization(
    deliberationId: string
  ): Promise<ApiResponse<DeliberationVisualization>> {
    return await apiClient.get<DeliberationVisualization>(
      API_ENDPOINTS.GET_DELIBERATION(deliberationId)
    );
  }

  async getDeliberationMessages(
    deliberationId: string,
    options?: {
      page?: number;
      limit?: number;
      phase?: string;
      agentId?: string;
    }
  ): Promise<ApiResponse<{ messages: DeliberationMessage[], total: number }>> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.phase) params.append('phase', options.phase);
    if (options?.agentId) params.append('agentId', options.agentId);

    const url = `${API_ENDPOINTS.GET_MESSAGES(deliberationId)}?${params.toString()}`;
    return await apiClient.get(url);
  }

  async exportDeliberationReport(
    deliberationId: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<ApiResponse<any>> {
    const url = `${API_ENDPOINTS.EXPORT_DELIBERATION(deliberationId)}?format=${format}`;
    return await apiClient.get(url);
  }

  // Create EventSource for streaming deliberation updates
  createDeliberationStream(deliberationId: string): EventSource {
    return apiClient.createEventSource(
      API_ENDPOINTS.STREAM_DELIBERATION(deliberationId)
    );
  }

  // Helper method to parse SSE messages
  parseSSEMessage(data: string): DeliberationEventPayload | null {
    try {
      return JSON.parse(data) as DeliberationEventPayload;
    } catch (error) {
      console.error('Failed to parse SSE message:', error);
      return null;
    }
  }
}

export const deliberationService = new DeliberationService();