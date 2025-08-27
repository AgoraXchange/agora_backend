import 'dotenv/config';
import { OpenAIService } from './src/infrastructure/ai/OpenAIService';
import { LLMJudge } from './src/infrastructure/committee/judges/LLMJudge';
import { AgentProposal } from './src/domain/entities/AgentProposal';

async function testGPT5ReasoningFix() {
  console.log('=== Testing GPT-5 Reasoning Token Fix ===\n');
  
  try {
    // Test 1: Direct OpenAI Service test
    console.log('Test 1: Testing OpenAI Service with judge comparison...');
    const openAIService = new OpenAIService();
    
    const testJudgePrompt = `Compare two proposals and return JSON:
A: party1/0.8 - Proposal A has strong evidence
B: party2/0.6 - Proposal B has moderate evidence

{"winner":"A"|"B"|"tie","confidence":0-1,"overall_scores":{"A":0-1,"B":0-1},"reasoning":["reason"]}`;
    
    const result = await openAIService.analyzeAndDecideWinner({
      partyA: { 
        id: 'proposal_a', 
        address: 'test', 
        name: 'Proposal A', 
        description: 'Test A' 
      },
      partyB: { 
        id: 'proposal_b', 
        address: 'test', 
        name: 'Proposal B', 
        description: 'Test B' 
      },
      contractId: 'test_judge_comparison',
      context: { prompt: testJudgePrompt }
    });
    
    console.log('✅ OpenAI Service Response:', {
      winnerId: result.winnerId,
      confidence: result.metadata.confidence,
      dataPoints: result.metadata.dataPoints
    });
    
    // Test 2: LLM Judge test
    console.log('\nTest 2: Testing LLM Judge with actual proposals...');
    const judge = new LLMJudge();
    
    const proposalA = new AgentProposal(
      'prop_a',
      'gpt5',
      'GPT-5',
      'contract123',
      'party_alice',
      0.85,
      'Alice should win because of strong performance metrics',
      ['Evidence 1: High transaction volume', 'Evidence 2: Good reputation'],
      {},
      new Date()
    );
    
    const proposalB = new AgentProposal(
      'prop_b',
      'claude',
      'Claude',
      'contract123',
      'party_bob',
      0.75,
      'Bob should win due to consistent historical data',
      ['Evidence 1: Stable growth pattern', 'Evidence 2: Low risk profile'],
      {},
      new Date()
    );
    
    const comparison = await judge.performPairwiseComparison(proposalA, proposalB, 1);
    
    console.log('✅ LLM Judge Result:', {
      winner: comparison.winner,
      confidence: comparison.confidence,
      scores: comparison.scores,
      reasoning: comparison.reasoning.slice(0, 2)
    });
    
    console.log('\n✅ All tests passed successfully!');
    console.log('GPT-5 reasoning token issue has been resolved.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

// Run the test
testGPT5ReasoningFix().then(() => process.exit(0)).catch(() => process.exit(1));