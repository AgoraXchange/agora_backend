import { apiClient } from './client';
import { API_ENDPOINTS } from '@/config/api.config';
import type { 
  ApiResponse, 
  OracleDecisionRequest, 
  OracleDecisionResponse,
  CommitteeConfig 
} from '@/types/api';

class OracleService {
  async decideWinner(
    contractId: string, 
    config?: CommitteeConfig
  ): Promise<ApiResponse<OracleDecisionResponse>> {
    return await apiClient.post<OracleDecisionResponse>(
      API_ENDPOINTS.DECIDE_WINNER(contractId),
      config || {},
      {
        // Increase timeout for deliberation requests as they can take longer
        timeout: 60000 // 60 seconds
      }
    );
  }

  async startDeliberation(
    contractId: string, 
    config?: CommitteeConfig
  ): Promise<ApiResponse<{ deliberationId: string; contractId: string; status: string; message: string }>> {
    return await apiClient.post<{ deliberationId: string; contractId: string; status: string; message: string }>(
      API_ENDPOINTS.START_DELIBERATION(contractId),
      config || {}
    );
  }

  async getDecision(contractId: string): Promise<ApiResponse<OracleDecisionResponse>> {
    return await apiClient.get<OracleDecisionResponse>(
      API_ENDPOINTS.GET_DECISION(contractId)
    );
  }

  // Test method to trigger a deliberation with mock data
  async triggerTestDeliberation(scenario: {
    contractId: string;
    question: string;
    options: string[];
    metadata?: Record<string, any>;
  }): Promise<ApiResponse<OracleDecisionResponse>> {
    // For testing, we'll use the regular decide winner endpoint
    // but with a test contract ID
    const config: CommitteeConfig = {
      forceCommitteeMode: true,
      committeeConfig: {
        minProposals: 3,
        maxProposalsPerAgent: 2,
        consensusThreshold: 0.7,
        enableEarlyExit: false
      }
    };

    return await this.decideWinner(scenario.contractId, config);
  }
}

export const oracleService = new OracleService();