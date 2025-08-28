import 'reflect-metadata';
import dotenv from 'dotenv';
import { E2EOracleTest, TestConfig } from './e2e-oracle-test';

// Load test environment
dotenv.config({ path: '.env.test' });

async function runAutomatedTest() {
  const testConfig: TestConfig = {
    useRealBlockchain: false,
    useCommitteeMode: false,
    useMockAI: true,
    contractScenario: 'sports'
  };

  console.log('🎯 Running Automated E2E Oracle Test');
  console.log('Configuration:', testConfig);
  console.log('==================================\n');

  try {
    const test = new E2EOracleTest(testConfig);
    const result = await test.runTest();

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(60));

    if (result.success) {
      console.log('✅ Test Status: PASSED');
      console.log(`📝 Contract ID: ${result.contractId}`);
      console.log(`🏆 Winner ID: ${result.winnerId}`);
      console.log(`🔗 Transaction Hash: ${result.transactionHash}`);
      console.log(`⏱️ Duration: ${result.duration}ms`);

      if (result.metadata) {
        console.log(`🤖 Deliberation Mode: ${result.metadata.deliberationMode}`);
        console.log(`📊 Final Contract Status: ${result.metadata.contractFinalStatus}`);
        console.log(`🎯 Decision Confidence: ${result.metadata.decisionConfidence}`);
      }
    } else {
      console.log('❌ Test Status: FAILED');
      console.log(`📝 Contract ID: ${result.contractId || 'N/A'}`);
      console.log(`❗ Error: ${result.error}`);
      console.log(`⏱️ Duration: ${result.duration}ms`);
    }

    console.log('='.repeat(60));
    
    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

runAutomatedTest();