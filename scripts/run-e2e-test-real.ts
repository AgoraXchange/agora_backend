import 'reflect-metadata';
import dotenv from 'dotenv';
import { E2EOracleTest, TestConfig } from './e2e-oracle-test';

// Load production environment
dotenv.config({ path: '.env' });

async function runRealBlockchainTest() {
  console.log('⚠️  REAL BLOCKCHAIN TEST - This will interact with Base Sepolia testnet');
  console.log('⚠️  Make sure you have sufficient testnet ETH for gas fees');
  console.log('⚠️  Contract address:', process.env.MAIN_CONTRACT_ADDRESS);
  console.log('⚠️  RPC URL:', process.env.ETHEREUM_RPC_URL);
  console.log('');
  
  const testConfig: TestConfig = {
    useRealBlockchain: true,
    useCommitteeMode: false,
    useMockAI: true, // Keep AI mocked to save costs
    contractScenario: 'crypto'
  };

  console.log('🎯 Running Real Blockchain E2E Oracle Test');
  console.log('Configuration:', testConfig);
  console.log('==================================\n');

  try {
    const test = new E2EOracleTest(testConfig);
    const result = await test.runTest();

    console.log('\n' + '='.repeat(60));
    console.log('📊 REAL BLOCKCHAIN TEST RESULTS');
    console.log('='.repeat(60));

    if (result.success) {
      console.log('✅ Test Status: PASSED');
      console.log(`📝 Contract ID: ${result.contractId}`);
      console.log(`🏆 Winner ID: ${result.winnerId}`);
      console.log(`🔗 Real Transaction Hash: ${result.transactionHash}`);
      console.log(`⏱️ Duration: ${result.duration}ms`);
      console.log('🔍 You can verify the transaction on Base Sepolia explorer:');
      console.log(`   https://sepolia.basescan.org/tx/${result.transactionHash}`);

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
      
      // Common error troubleshooting
      console.log('\n🔧 Troubleshooting:');
      if (result.error?.includes('insufficient funds')) {
        console.log('- Check that your wallet has sufficient Base Sepolia ETH');
      }
      if (result.error?.includes('network') || result.error?.includes('connection')) {
        console.log('- Check your RPC URL and network connection');
      }
      if (result.error?.includes('contract')) {
        console.log('- Verify the MAIN_CONTRACT_ADDRESS is correct');
        console.log('- Check that the contract is deployed on Base Sepolia');
      }
    }

    console.log('='.repeat(60));
    
    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    
    // Enhanced error information for blockchain issues
    if (error instanceof Error) {
      if (error.message.includes('private key')) {
        console.error('💡 Make sure ORACLE_PRIVATE_KEY_ENCRYPTED is set with an encrypted private key');
      }
      if (error.message.includes('RPC')) {
        console.error('💡 Check your ETHEREUM_RPC_URL setting');
      }
      if (error.message.includes('network')) {
        console.error('💡 Ensure you\'re connected to Base Sepolia network');
      }
    }
    
    process.exit(1);
  }
}

runRealBlockchainTest();