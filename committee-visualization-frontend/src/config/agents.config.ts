import type { AgentProfile } from '@/types/agent';

export const AGENT_PROFILES: Record<string, AgentProfile> = {
  'gpt4-proposer': {
    id: 'gpt4-proposer',
    name: 'GPT-4',
    avatar: '🤖',
    color: '#7C3AED', // Purple like Cloie
    badge: 'c.ai',
    role: 'proposer',
    personality: 'analytical',
    description: 'Advanced reasoning and analysis capabilities',
    isActive: true
  },
  'claude-proposer': {
    id: 'claude-proposer',
    name: 'Claude',
    avatar: '🎭',
    color: '#3B82F6', // Blue
    badge: 'c.ai',
    role: 'proposer',
    personality: 'thoughtful',
    description: 'Careful consideration and nuanced thinking',
    isActive: true
  },
  'gemini-proposer': {
    id: 'gemini-proposer',
    name: 'Gemini',
    avatar: '✨',
    color: '#10B981', // Green
    badge: 'c.ai',
    role: 'proposer',
    personality: 'creative',
    description: 'Creative problem-solving and innovative approaches',
    isActive: true
  },
  'judge': {
    id: 'judge',
    name: 'Judge AI',
    avatar: '⚖️',
    color: '#F59E0B', // Amber
    badge: 'judge',
    role: 'judge',
    description: 'Impartial evaluation and scoring',
    isActive: true
  },
  'synthesizer': {
    id: 'synthesizer',
    name: 'Synthesizer',
    avatar: '🎯',
    color: '#EF4444', // Red
    badge: 'sync',
    role: 'synthesizer',
    description: 'Consensus building and final decision synthesis',
    isActive: true
  }
};

export const AGENT_ROLES = {
  proposer: 'Proposer',
  judge: 'Judge',
  synthesizer: 'Synthesizer'
} as const;

export const getAgentProfile = (agentId: string): AgentProfile | null => {
  return AGENT_PROFILES[agentId] || null;
};

export const getAgentsByRole = (role: AgentProfile['role']): AgentProfile[] => {
  return Object.values(AGENT_PROFILES).filter(agent => agent.role === role);
};

export const getActiveAgents = (): AgentProfile[] => {
  return Object.values(AGENT_PROFILES).filter(agent => agent.isActive);
};