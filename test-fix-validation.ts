import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { container } from './src/container';
import { IAgentService } from './src/domain/services/IAgentService';
import { Party } from './src/domain/entities/Party';

async function testAIServicesFixed() {
  console.log('\n🔍 Testing AI Services After Fixes\n');
  console.log('═══════════════════════════════════════════════════\n');

  // Test data with longer descriptions to test token handling
  const testInput = {
    contractId: 'test_contract_validation',
    partyA: new Party('lakers', 'Lakers', '0x001', 'Los Angeles Lakers basketball team with excellent performance'),
    partyB: new Party('celtics', 'Celtics', '0x002', 'Boston Celtics basketball team with strong defense'),
    context: { 
      scenario: 'Testing optimized prompts and increased token limits',
      purpose: 'Validate fixes for truncation and parsing issues'
    }
  };

  // Test each proposer
  const proposers = [
    { name: 'GPT5Proposer', displayName: 'OpenAI GPT-5' },
    { name: 'ClaudeProposer', displayName: 'Anthropic Claude' },
    { name: 'GeminiProposer', displayName: 'Google Gemini' }
  ];

  let allSuccess = true;

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
        
        // Validate response structure
        const hasValidStructure = 
          proposal.winnerId && 
          typeof proposal.confidence === 'number' &&
          proposal.rationale &&
          Array.isArray(proposal.evidence);
        
        if (hasValidStructure) {
          console.log(`✅ ${proposer.displayName} Response VALID`);
          console.log(`   Winner: ${proposal.winnerId}`);
          console.log(`   Confidence: ${proposal.confidence}`);
          console.log(`   Response Time: ${elapsedTime}ms`);
          console.log(`   Rationale Length: ${proposal.rationale.length} chars`);
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
            console.log(`      - Prompt: ${usage.promptTokens}`);
            console.log(`      - Completion: ${usage.completionTokens}`);
            console.log(`      - Total: ${usage.totalTokens}`);
            
            // Check if we're getting close to limits
            if (usage.completionTokens > 1800) {
              console.log(`   ⚠️  WARNING: Near token limit (${usage.completionTokens}/2000)`);
            }
          }
        } else {
          console.log(`❌ ${proposer.displayName} Response INVALID - Missing required fields`);
          allSuccess = false;
        }
      } else {
        console.log(`❌ ${proposer.displayName} - No proposals generated`);
        allSuccess = false;
      }
      
    } catch (error: any) {
      console.error(`❌ ${proposer.displayName} Error:`, error.message);
      allSuccess = false;
      
      // Log specific error details for debugging
      if (error.message.includes('finish_reason')) {
        console.error(`   Token limit or truncation issue detected`);
      }
      if (error.message.includes('JSON')) {
        console.error(`   JSON parsing issue detected`);
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  if (allSuccess) {
    console.log('✨ ALL TESTS PASSED - Fixes Working!\n');
  } else {
    console.log('⚠️  Some tests failed - Review errors above\n');
  }
  
  return allSuccess;
}

// Run the test
testAIServicesFixed()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });