import { CommitteeOrchestrator } from '../../infrastructure/committee/CommitteeOrchestrator';
import { GPT4Proposer } from '../../infrastructure/committee/proposers/GPT4Proposer';
import { ClaudeProposer } from '../../infrastructure/committee/proposers/ClaudeProposer';
import { GeminiProposer } from '../../infrastructure/committee/proposers/GeminiProposer';
import { CommitteeJudgeService } from '../../infrastructure/committee/judges/CommitteeJudgeService';
import { ConsensusSynthesizer } from '../../infrastructure/committee/synthesizer/ConsensusSynthesizer';
import { Party } from '../../domain/entities/Party';

// Mock environment variables for testing
process.env.OPENAI_FALLBACK_TO_MOCK = 'true';
process.env.CLAUDE_API_KEY = 'mock';
process.env.GOOGLE_AI_API_KEY = 'mock';
process.env.USE_COMMITTEE = 'true';

describe('Committee System Integration', () => {
  let committeeOrchestrator: CommitteeOrchestrator;
  let proposers: any[];
  let judgeService: CommitteeJudgeService;
  let synthesizerService: ConsensusSynthesizer;

  beforeEach(() => {
    // Create mock proposers
    proposers = [
      new GPT4Proposer(),
      new ClaudeProposer(),
      new GeminiProposer()
    ];

    judgeService = new CommitteeJudgeService();
    synthesizerService = new ConsensusSynthesizer();

    // Create orchestrator with mocked dependencies
    committeeOrchestrator = new CommitteeOrchestrator(
      proposers,
      judgeService,
      synthesizerService
    );
  });

  describe('Basic Committee Configuration', () => {
    it('should initialize with default configuration', () => {
      const config = committeeOrchestrator.getCommitteeConfig();
      
      expect(config).toBeDefined();
      expect(config.enabledProposers).toBeDefined();
      expect(config.judgeConfiguration).toBeDefined();
      expect(config.consensusMethod).toBeDefined();
    });

    it('should support updating agent weights', () => {
      const initialConfig = committeeOrchestrator.getCommitteeConfig();
      
      committeeOrchestrator.updateAgentWeights('gpt4', 0.9);
      
      const updatedConfig = committeeOrchestrator.getCommitteeConfig();
      expect(updatedConfig.agentWeights['gpt4']).toBe(0.9);
    });
  });

  describe('Committee Deliberation Process', () => {
    const mockInput = {
      contractId: 'test-contract-1',
      partyA: new Party('party-a', '0x123', 'Test Party A', 'Description A'),
      partyB: new Party('party-b', '0x456', 'Test Party B', 'Description B'),
      minProposals: 2,
      maxProposalsPerAgent: 1,
      consensusThreshold: 0.7,
      enableEarlyExit: false
    };

    it('should complete full deliberation process', async () => {
      const result = await committeeOrchestrator.deliberateAndDecide(mockInput);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.winnerId).toBeDefined();
      expect(result.committeeDecision).toBeDefined();
      expect(result.deliberationMetrics).toBeDefined();
      expect(result.deliberationMetrics.totalProposals).toBeGreaterThan(0);
    }, 30000); // Increase timeout for committee deliberation

    it('should generate proposals from multiple agents', async () => {
      const result = await committeeOrchestrator.deliberateAndDecide(mockInput);
      
      expect(result.committeeDecision.proposals.length).toBeGreaterThanOrEqual(2);
      
      // Check that proposals come from different agents
      const agentIds = result.committeeDecision.proposals.map(p => p.agentId);
      const uniqueAgents = [...new Set(agentIds)];
      expect(uniqueAgents.length).toBeGreaterThanOrEqual(2);
    }, 30000);

    it('should produce consensus with confidence level', async () => {
      const result = await committeeOrchestrator.deliberateAndDecide(mockInput);
      
      expect(result.committeeDecision.consensus.confidenceLevel).toBeGreaterThan(0);
      expect(result.committeeDecision.consensus.confidenceLevel).toBeLessThanOrEqualTo(1);
      expect(result.committeeDecision.consensus.residualUncertainty).toBeGreaterThanOrEqual(0);
      expect(result.committeeDecision.consensus.residualUncertainty).toBeLessThanOrEqualTo(1);
    }, 30000);

    it('should handle different consensus methods', async () => {
      const methods = ['majority', 'borda', 'weighted_voting', 'approval'];
      
      for (const method of methods) {
        // Update synthesizer config for this test
        synthesizerService.updateConfig({ consensusMethod: method as any });
        
        const result = await committeeOrchestrator.deliberateAndDecide(mockInput);
        
        expect(result.success).toBe(true);
        expect(result.winnerId).toBeDefined();
      }
    }, 60000); // Longer timeout for multiple methods
  });

  describe('Error Handling', () => {
    it('should handle insufficient proposals gracefully', async () => {
      const invalidInput = {
        ...mockInput,
        minProposals: 10, // More than available agents
        maxProposalsPerAgent: 1
      };

      try {
        const result = await committeeOrchestrator.deliberateAndDecide(invalidInput);
        expect(result.success).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('Insufficient proposals');
      }
    }, 30000);

    it('should validate input parameters', async () => {
      const invalidInput = {
        contractId: '',
      } as any;

      try {
        await committeeOrchestrator.deliberateAndDecide(invalidInput);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Performance and Metrics', () => {
    it('should track deliberation metrics', async () => {
      const result = await committeeOrchestrator.deliberateAndDecide(mockInput);
      
      expect(result.deliberationMetrics.deliberationTimeMs).toBeGreaterThan(0);
      expect(result.deliberationMetrics.totalProposals).toBeGreaterThan(0);
      expect(result.deliberationMetrics.consensusLevel).toBeBetween(0, 1);
      expect(result.deliberationMetrics.costBreakdown).toBeDefined();
      expect(result.deliberationMetrics.costBreakdown.totalCostUSD).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should maintain reasonable response time', async () => {
      const startTime = Date.now();
      
      await committeeOrchestrator.deliberateAndDecide({
        ...mockInput,
        maxProposalsPerAgent: 1 // Minimize proposals for speed
      });
      
      const endTime = Date.now();
      const elapsed = endTime - startTime;
      
      // Committee deliberation should complete within reasonable time
      expect(elapsed).toBeLessThan(45000); // 45 seconds max
    }, 50000);
  });
});

// Jest custom matchers
expect.extend({
  toBeBetween(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be between ${floor} and ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be between ${floor} and ${ceiling}`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeBetween(floor: number, ceiling: number): R;
    }
  }
}