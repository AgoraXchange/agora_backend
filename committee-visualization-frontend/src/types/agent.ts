export interface AgentProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  badge: string;
  role: 'proposer' | 'judge' | 'synthesizer';
  personality?: string;
  description?: string;
  isActive?: boolean;
}

export interface AgentMessage {
  id: string;
  agentId: string;
  content: string;
  timestamp: Date;
  type: 'proposal' | 'evaluation' | 'vote' | 'synthesis';
  metadata?: {
    confidence?: number;
    reasoning?: string[];
    evidence?: string[];
    winner?: string;
  };
}

export interface AgentStatus {
  agentId: string;
  status: 'idle' | 'thinking' | 'active' | 'completed';
  currentTask?: string;
  progress?: number;
}