export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    role: string;
  };
}

export interface CommitteeConfig {
  forceCommitteeMode?: boolean;
  committeeConfig?: {
    minProposals?: number;
    maxProposalsPerAgent?: number;
    consensusThreshold?: number;
    enableEarlyExit?: boolean;
  };
}

export interface ContractInfo {
  contractId: string;
  question: string;
  options: string[];
  metadata?: Record<string, any>;
}

export interface OracleDecisionRequest {
  contractId: string;
  config?: CommitteeConfig;
}

export interface OracleDecisionResponse {
  winnerId: string;
  metadata: {
    confidence: number;
    reasoning: string;
    dataPoints: string[];
    timestamp: Date;
  };
  deliberationId?: string;
}

export interface DeliberationStreamEvent {
  type: string;
  data: any;
  timestamp: string;
}