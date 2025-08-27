import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { container } from './src/container';
import { OpenAIService } from './src/infrastructure/ai/OpenAIService';

async function testJudgeFix() {
  console.log('\n🔍 Testing Judge Fix for OpenAI Service\n');
  console.log('═══════════════════════════════════════════════════\n');

  const service = new OpenAIService();
  
  // Simulate a judge comparison input
  const judgeInput = {
    partyA: { 
      id: 'proposal_a', 
      address: 'judge_analysis', 
      name: 'Proposal A', 
      description: 'Analysis candidate A' 
    },
    partyB: { 
      id: 'proposal_b', 
      address: 'judge_analysis', 
      name: 'Proposal B', 
      description: 'Analysis candidate B' 
    },
    contractId: 'judge_comparison_test',
    context: { 
      prompt: `Judge two proposals. Focus on logic and evidence quality.

A (Agent Alpha):
Winner: lakers (0.8)
Reason: Strong historical performance and team cohesion
Evidence: Championship wins; Veteran leadership

B (Agent Beta):
Winner: celtics (0.7)
Reason: Defensive excellence and young talent
Evidence: Best defense rating; Rising stars

Return JSON:
{
  "winner": "A"|"B"|"tie",
  "confidence": 0.0-1.0,
  "overall_scores": {"A": 0-1, "B": 0-1},
  "criteria_scores": {
    "accuracy": {"A": 0-1, "B": 0-1},
    "reasoning": {"A": 0-1, "B": 0-1},
    "evidence": {"A": 0-1, "B": 0-1},
    "clarity": {"A": 0-1, "B": 0-1}
  },
  "reasoning": ["key point"],
  "key_differences": "main difference"
}`
    }
  };

  try {
    console.log('Testing judge analysis with optimized prompt...\n');
    
    const startTime = Date.now();
    const result = await service.analyzeAndDecideWinner(judgeInput);
    const elapsedTime = Date.now() - startTime;
    
    console.log('✅ Judge Analysis Successful!');
    console.log('───────────────────────────────────────');
    console.log(`Response Time: ${elapsedTime}ms`);
    console.log(`Winner: ${result.winnerId}`);
    console.log(`Confidence: ${result.metadata.confidence}`);
    console.log(`Reasoning: ${result.metadata.reasoning}`);
    
    if (result.metadata.dataPoints) {
      console.log('\n📊 Judgment Details:');
      console.log(JSON.stringify(result.metadata.dataPoints, null, 2));
    }
    
    return true;
    
  } catch (error: any) {
    console.error('❌ Judge Analysis Failed!');
    console.error('───────────────────────────────────────');
    console.error('Error:', error.message);
    
    if (error.message.includes('Empty response')) {
      console.error('⚠️  Still getting empty responses - token limit may need further adjustment');
    }
    
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    
    return false;
  }
}

// Test with shorter prompt
async function testWithShorterPrompt() {
  console.log('\n🔍 Testing with even shorter prompt\n');
  console.log('═══════════════════════════════════════════════════\n');
  
  const service = new OpenAIService();
  
  const shortInput = {
    partyA: { 
      id: 'proposal_a', 
      address: 'judge', 
      name: 'A', 
      description: 'Proposal A' 
    },
    partyB: { 
      id: 'proposal_b', 
      address: 'judge', 
      name: 'B', 
      description: 'Proposal B' 
    },
    contractId: 'judge_test',
    context: { 
      prompt: `Compare: A wins with 0.8 confidence. B wins with 0.7 confidence. Return JSON: {"winner": "A" or "B", "confidence": 0-1, "reasoning": "brief reason"}`
    }
  };
  
  try {
    const result = await service.analyzeAndDecideWinner(shortInput);
    console.log('✅ Short prompt successful:', result.winnerId, result.metadata.confidence);
    return true;
  } catch (error: any) {
    console.error('❌ Short prompt failed:', error.message);
    return false;
  }
}

// Run tests
async function runTests() {
  const test1 = await testJudgeFix();
  const test2 = await testWithShorterPrompt();
  
  console.log('\n═══════════════════════════════════════════════════');
  if (test1 && test2) {
    console.log('✨ All tests passed - Judge fix working!');
    return true;
  } else {
    console.log('⚠️  Some tests failed - Review errors above');
    return false;
  }
}

runTests()
  .then((success) => {
    console.log('\n');
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });