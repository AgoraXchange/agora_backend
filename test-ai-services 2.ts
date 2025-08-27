import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { container } from './src/container';
import { IAgentService } from './src/domain/services/IAgentService';
import { Party } from './src/domain/entities/Party';

async function testAIServices() {
  console.log('\n🔍 Testing AI Services Integration\n');
  console.log('═══════════════════════════════════════════════════\n');

  // Test data
  const testInput = {
    contractId: 'test_contract_001',
    partyA: new Party('lakers', 'Lakers', '0x001', 'Los Angeles Lakers basketball team'),
    partyB: new Party('celtics', 'Celtics', '0x002', 'Boston Celtics basketball team'),
    context: { 
      scenario: 'Testing real AI API integration',
      purpose: 'Verify AI services are using real APIs'
    }
  };

  // Test each proposer
  const proposers = [
    { name: 'GPT5Proposer', displayName: 'OpenAI GPT-5' },
    { name: 'ClaudeProposer', displayName: 'Anthropic Claude' },
    { name: 'GeminiProposer', displayName: 'Google Gemini' }
  ];

  for (const proposer of proposers) {
    try {
      console.log(`\n📝 Testing ${proposer.displayName}...`);
      console.log('───────────────────────────────────────────────────');
      
      const agent = container.get<IAgentService>(proposer.name);
      
      const startTime = Date.now();
      const proposals = await agent.generateProposals(testInput, 1);
      const elapsedTime = Date.now() - startTime;
      
      if (proposals && proposals.length > 0) {
        const proposal = proposals[0];
        console.log(`✅ ${proposer.displayName} Response:`);
        console.log(`   Agent: ${proposal.agentName} (${proposal.agentId})`);
        console.log(`   Winner: ${proposal.winnerId}`);
        console.log(`   Confidence: ${proposal.confidence}`);
        console.log(`   Response Time: ${elapsedTime}ms`);
        console.log(`   Rationale: ${proposal.rationale.substring(0, 100)}...`);
        console.log(`   Evidence Points: ${proposal.evidence.length}`);
        
        // Check if it's using real API or mock
        if (proposal.metadata?.rawResponse?.mock) {
          console.log(`   ⚠️  Using MOCK response`);
        } else {
          console.log(`   ✨ Using REAL API response`);
        }
        
        // Display token usage if available
        if (proposal.metadata?.tokenUsage) {
          const usage = proposal.metadata.tokenUsage;
          console.log(`   📊 Token Usage:`);
          console.log(`      - Prompt Tokens: ${usage.promptTokens}`);
          console.log(`      - Completion Tokens: ${usage.completionTokens}`);
          console.log(`      - Total Tokens: ${usage.totalTokens}`);
        }
      } else {
        console.log(`⚠️  No proposals generated`);
      }
      
    } catch (error: any) {
      console.error(`❌ ${proposer.displayName} Error:`, error.message);
      if (error.stack) {
        console.error(`   Stack:`, error.stack.split('\n')[1]?.trim());
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('✨ AI Services Test Complete\n');
}

// Run the test
testAIServices()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });