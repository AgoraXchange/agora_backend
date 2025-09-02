import { DeliberationVisualizationController } from '../../interfaces/controllers/DeliberationVisualizationController';
import { DeliberationEventEmitter } from '../../infrastructure/committee/events/DeliberationEventEmitter';
import { DeliberationMessage } from '../../domain/valueObjects/DeliberationMessage';
import { OracleDecision } from '../../domain/entities/OracleDecision';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { ICommitteeService } from '../../domain/services/ICommitteeService';
import { Request, Response } from 'express';

// Mock implementations
class MockOracleDecisionRepository implements IOracleDecisionRepository {
  private decisions: Map<string, OracleDecision> = new Map();

  async findById(id: string): Promise<OracleDecision | null> {
    return this.decisions.get(id) || null;
  }

  async findByContractId(contractId: string): Promise<OracleDecision | null> {
    for (const decision of this.decisions.values()) {
      if (decision.contractId === contractId) {
        return decision;
      }
    }
    return null;
  }

  async save(decision: OracleDecision): Promise<OracleDecision> {
    this.decisions.set(decision.id, decision);
    return decision;
  }

  // Add a method to seed test data
  addTestDecision(decision: OracleDecision): void {
    this.decisions.set(decision.id, decision);
  }
}

class MockCommitteeService implements ICommitteeService {
  async deliberateAndDecide(): Promise<any> {
    return Promise.resolve({});
  }

  getCommitteeConfig(): any {
    return {};
  }

  updateAgentWeights(): void {
    // Mock implementation
  }
}

describe('Deliberation Visualization Integration', () => {
  let controller: DeliberationVisualizationController;
  let eventEmitter: DeliberationEventEmitter;
  let mockRepository: MockOracleDecisionRepository;
  let mockCommitteeService: MockCommitteeService;

  beforeEach(() => {
    mockRepository = new MockOracleDecisionRepository();
    mockCommitteeService = new MockCommitteeService();
    eventEmitter = new DeliberationEventEmitter();
    
    controller = new DeliberationVisualizationController(
      mockRepository,
      mockCommitteeService,
      eventEmitter
    );
  });

  afterEach(() => {
    eventEmitter.removeAllListeners();
  });

  describe('DeliberationMessage Creation and Processing', () => {
    it('should create proposal messages correctly', () => {
      const message = DeliberationMessage.createProposal(
        'gpt4',
        'GPT-4 Analyst',
        'partyA',
        0.85,
        'Detailed analysis shows Party A has better performance metrics',
        ['Performance data', 'Compliance records'],
        1500,
        2300
      );

      expect(message.phase).toBe('proposing');
      expect(message.messageType).toBe('proposal');
      expect(message.agentId).toBe('gpt4');
      expect(message.agentName).toBe('GPT-4 Analyst');
      expect(message.content.winner).toBe('partyA');
      expect(message.content.confidence).toBe(0.85);
      expect(message.content.evidence).toContain('Performance data');
      expect(message.metadata.tokenUsage).toBe(1500);
      expect(message.metadata.processingTimeMs).toBe(2300);
    });

    it('should create evaluation messages correctly', () => {
      const message = DeliberationMessage.createEvaluation(
        'proposal_123',
        {
          completeness: 0.9,
          consistency: 0.8,
          evidenceQuality: 0.85,
          clarity: 0.75
        },
        ['High completeness score', 'Good consistency']
      );

      expect(message.phase).toBe('discussion');
      expect(message.messageType).toBe('evaluation');
      expect(message.content.scores?.completeness).toBe(0.9);
      expect(message.content.reasoning).toContain('High completeness score');
    });

    it('should create comparison messages correctly', () => {
      const message = DeliberationMessage.createComparison(
        'proposal_A',
        'proposal_B',
        'A',
        0.82,
        0.73,
        ['Proposal A has stronger evidence', 'Better structured argument'],
        2
      );

      expect(message.phase).toBe('discussion');
      expect(message.messageType).toBe('comparison');
      expect(message.content.winner).toBe('A');
      expect(message.content.scores?.A).toBe(0.82);
      expect(message.content.scores?.B).toBe(0.73);
      expect(message.metadata.round).toBe(2);
    });

    it('should generate correct summaries for different message types', () => {
      const proposalMessage = DeliberationMessage.createProposal(
        'gpt4', 'GPT-4', 'partyA', 0.85, 'Rationale', [], 1000, 2000
      );
      
      const voteMessage = DeliberationMessage.createVote(
        'claude', 'Claude', 'partyB', 0.78, 1.0, 0.78
      );
      
      const synthesisMessage = DeliberationMessage.createSynthesis(
        'partyA', 0.82, 'Final consensus reasoning', 'weighted_voting'
      );

      expect(proposalMessage.getSummary()).toContain('제안: partyA');
      expect(proposalMessage.getSummary()).toContain('85%');
      
      expect(voteMessage.getSummary()).toContain('투표: partyB');
      
      expect(synthesisMessage.getSummary()).toContain('최종 합의: partyA');
      expect(synthesisMessage.getSummary()).toContain('82%');
    });
  });

  describe('Event System Integration', () => {
    it('should emit and collect messages correctly', (done) => {
      const contractId = 'test-contract-123';
      const testMessage = DeliberationMessage.createProposal(
        'gpt4', 'GPT-4', 'partyA', 0.85, 'Test rationale', ['Evidence'], 1000, 2000
      );

      // Set up listener
      eventEmitter.on('message', (receivedContractId: string, message: DeliberationMessage) => {
        expect(receivedContractId).toBe(contractId);
        expect(message.id).toBe(testMessage.id);
        expect(message.agentId).toBe('gpt4');
        done();
      });

      // Emit message
      eventEmitter.emitMessage(contractId, testMessage);
    });

    it('should store message history correctly', () => {
      const contractId = 'test-contract-456';
      const messages = [
        DeliberationMessage.createProposal('gpt4', 'GPT-4', 'partyA', 0.85, 'Rationale 1', [], 1000, 2000),
        DeliberationMessage.createProposal('claude', 'Claude', 'partyB', 0.78, 'Rationale 2', [], 1200, 2500),
        DeliberationMessage.createVote('gpt4', 'GPT-4', 'partyA', 0.85, 1.0, 0.85)
      ];

      // Emit messages
      messages.forEach(message => {
        eventEmitter.emitMessage(contractId, message);
      });

      // Check history
      const history = eventEmitter.getMessageHistory(contractId);
      expect(history).toHaveLength(3);
      expect(history[0].agentId).toBe('gpt4');
      expect(history[1].agentId).toBe('claude');
      expect(history[2].messageType).toBe('vote');
    });

    it('should clean up old message histories', () => {
      const contractId = 'old-contract';
      const oldMessage = DeliberationMessage.createProposal(
        'gpt4', 'GPT-4', 'partyA', 0.85, 'Old message', [], 1000, 2000
      );
      
      // Manually set old timestamp
      oldMessage.metadata.timestamp = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      
      eventEmitter.emitMessage(contractId, oldMessage);
      
      // Should have the message
      expect(eventEmitter.getMessageHistory(contractId)).toHaveLength(1);
      
      // Clean up with 24 hour threshold
      eventEmitter.cleanup(24 * 60 * 60 * 1000);
      
      // Should be cleaned up
      expect(eventEmitter.getMessageHistory(contractId)).toHaveLength(0);
    });
  });

  describe('Controller Integration', () => {
    it('should handle deliberation visualization request correctly', async () => {
      // Setup test data
      const testDecision = new OracleDecision(
        'decision_123',
        'contract_456',
        'partyA',
        {
          confidence: 0.85,
          reasoning: 'Committee decision reasoning',
          dataPoints: ['evidence1', 'evidence2'],
          timestamp: new Date(),
          deliberationMode: 'committee',
          committeeDecisionId: 'committee_123'
        }
      );

      mockRepository.addTestDecision(testDecision);

      // Add some test messages
      const testMessages = [
        DeliberationMessage.createProposal('gpt4', 'GPT-4', 'partyA', 0.85, 'Rationale', ['Evidence'], 1000, 2000),
        DeliberationMessage.createSynthesis('partyA', 0.85, 'Final reasoning', 'weighted_voting')
      ];

      testMessages.forEach(msg => {
        eventEmitter.emitMessage(testDecision.contractId, msg);
      });

      // Mock request and response
      const mockReq = {
        params: { id: 'decision_123' }
      } as Request;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      } as unknown as Response;

      // Execute controller method
      await controller.getDeliberationVisualization(mockReq, mockRes);

      // Verify response
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                phase: 'proposing',
                agentName: 'GPT-4'
              }),
              expect.objectContaining({
                phase: 'consensus',
                messageType: 'synthesis'
              })
            ]),
            summary: expect.objectContaining({
              contractId: 'contract_456',
              finalWinner: 'partyA',
              confidence: 0.85
            })
          })
        })
      );
    });

    it('should handle missing deliberation correctly', async () => {
      const mockReq = {
        params: { id: 'nonexistent_decision' }
      } as Request;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      } as unknown as Response;

      await controller.getDeliberationVisualization(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Deliberation decision not found'
        })
      );
    });

    it('should handle non-committee decisions correctly', async () => {
      const singleAIDecision = new OracleDecision(
        'decision_single',
        'contract_single',
        'partyA',
        {
          confidence: 0.85,
          reasoning: 'Single AI decision',
          dataPoints: [],
          timestamp: new Date(),
          deliberationMode: 'single_ai'
        }
      );

      mockRepository.addTestDecision(singleAIDecision);

      const mockReq = {
        params: { id: 'decision_single' }
      } as Request;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      } as unknown as Response;

      await controller.getDeliberationVisualization(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'This decision was not made by committee deliberation'
        })
      );
    });
  });

  describe('Message Filtering and Pagination', () => {
    beforeEach(() => {
      // Setup test messages for pagination tests
      const contractId = 'pagination-test';
      const messages = [
        DeliberationMessage.createProposal('gpt4', 'GPT-4', 'partyA', 0.85, 'Proposal 1', [], 1000, 2000),
        DeliberationMessage.createProposal('claude', 'Claude', 'partyB', 0.78, 'Proposal 2', [], 1200, 2200),
        DeliberationMessage.createEvaluation('prop1', { completeness: 0.9 }, ['Good']),
        DeliberationMessage.createComparison('prop1', 'prop2', 'A', 0.8, 0.7, ['A wins'], 1),
        DeliberationMessage.createVote('gpt4', 'GPT-4', 'partyA', 0.85, 1.0, 0.85),
        DeliberationMessage.createSynthesis('partyA', 0.82, 'Final decision', 'weighted_voting')
      ];

      messages.forEach(msg => eventEmitter.emitMessage(contractId, msg));

      // Add test decision
      const testDecision = new OracleDecision(
        'pagination_decision',
        contractId,
        'partyA',
        {
          confidence: 0.82,
          reasoning: 'Test decision',
          dataPoints: [],
          timestamp: new Date(),
          deliberationMode: 'committee',
          committeeDecisionId: 'committee_pagination'
        }
      );
      mockRepository.addTestDecision(testDecision);
    });

    it('should filter messages by phase correctly', async () => {
      const mockReq = {
        params: { id: 'pagination_decision' },
        query: { phase: 'proposing' }
      } as unknown as Request;

      const mockRes = {
        json: jest.fn()
      } as unknown as Response;

      await controller.getDeliberationMessages(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                phase: 'proposing',
                messageType: 'proposal'
              })
            ])
          })
        })
      );

      const response = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(response.data.messages.every((m: any) => m.phase === 'proposing')).toBe(true);
    });
  });
});

// Custom Jest matcher extension
declare global {
  namespace jest {
    interface Matchers<R> {
      toContainMessage(messageType: string): R;
    }
  }
}
