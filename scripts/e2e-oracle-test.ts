import 'reflect-metadata';
import dotenv from 'dotenv';
import { InMemoryContractRepository } from '../src/infrastructure/repositories/InMemoryContractRepository';
import { InMemoryOracleDecisionRepository } from '../src/infrastructure/repositories/InMemoryOracleDecisionRepository';
import { EthereumService } from '../src/infrastructure/blockchain/EthereumService';
import { OpenAIService } from '../src/infrastructure/ai/OpenAIService';
import { CryptoService } from '../src/infrastructure/auth/CryptoService';
import { DecideWinnerUseCase } from '../src/application/useCases/DecideWinnerUseCase';
import { Contract, ContractStatus } from '../src/domain/entities/Contract';
import { Party } from '../src/domain/entities/Party';
import { ContractEventData } from '../src/domain/entities/BettingStats';
import { logger } from '../src/infrastructure/logging/Logger';
import readline from 'readline';

interface TestConfig {
  useRealBlockchain: boolean;
  useCommitteeMode: boolean;
  useMockAI: boolean;
  contractScenario: string;
}

interface TestResults {
  success: boolean;
  contractId: string;
  winnerId?: string;
  transactionHash?: string;
  error?: string;
  duration: number;
  metadata?: any;
}

class E2EOracleTest {
  private testConfig: TestConfig;
  private contractRepository: InMemoryContractRepository;
  private decisionRepository: InMemoryOracleDecisionRepository;
  private decideWinnerUseCase: DecideWinnerUseCase;
  private ethereumService: EthereumService;
  private aiService: OpenAIService;
  private cryptoService: CryptoService;
  
  constructor(testConfig: TestConfig) {
    this.testConfig = testConfig;
    this.setupEnvironment();
    
    this.contractRepository = new InMemoryContractRepository();
    this.decisionRepository = new InMemoryOracleDecisionRepository();
    this.cryptoService = new CryptoService();
    this.ethereumService = new EthereumService(this.cryptoService);
    this.aiService = new OpenAIService();
    
    this.decideWinnerUseCase = new DecideWinnerUseCase(
      this.contractRepository,
      this.decisionRepository,
      this.aiService,
      {} as any, // Skip committee service for now
      this.ethereumService
    );
  }

  private setupEnvironment(): void {
    // Load appropriate environment configuration
    const envFile = this.testConfig.useRealBlockchain ? '.env' : '.env.test';
    dotenv.config({ path: envFile });
    
    // Override specific settings based on test config
    if (this.testConfig.useMockAI) {
      process.env.OPENAI_FALLBACK_TO_MOCK = 'true';
    }
    
    if (!this.testConfig.useRealBlockchain) {
      process.env.BLOCKCHAIN_MOCK_MODE = 'true';
    }
    
    process.env.USE_COMMITTEE = this.testConfig.useCommitteeMode ? 'true' : 'false';
    
    logger.info('🔧 Test environment configured', {
      useRealBlockchain: this.testConfig.useRealBlockchain,
      useCommitteeMode: this.testConfig.useCommitteeMode,
      useMockAI: this.testConfig.useMockAI,
      contractScenario: this.testConfig.contractScenario
    });
  }


  async runTest(): Promise<TestResults> {
    const startTime = Date.now();
    let testContractId: string = '';
    
    try {
      logger.info('🚀 Starting End-to-End Oracle Test', {
        config: this.testConfig
      });

      // Step 1: Database already initialized (using in-memory repositories)

      // Step 2: Create test contract
      logger.info('📝 Creating test contract...');
      const testContract = await this.createTestContract();
      testContractId = testContract.id;
      
      // Step 3: Save contract to repository
      logger.info('💾 Saving contract to repository...');
      await this.contractRepository.save(testContract);
      
      // Step 4: Verify contract is ready for decision
      logger.info('🔍 Verifying contract is ready for decision...');
      const readyContracts = await this.contractRepository.findContractsReadyForDecision();
      const foundContract = readyContracts.find(c => c.id === testContractId);
      
      if (!foundContract) {
        throw new Error('Test contract not found in ready contracts list');
      }
      
      logger.info('✅ Contract verified as ready for decision', {
        contractId: testContractId,
        status: foundContract.status,
        bettingEndTime: foundContract.bettingEndTime
      });

      // Step 5: Execute oracle decision process
      logger.info('🤖 Triggering oracle decision process...');
      const decisionResult = await this.decideWinnerUseCase.execute({
        contractId: testContractId,
        forceCommitteeMode: this.testConfig.useCommitteeMode,
        committeeConfig: {
          minProposals: 3,
          maxProposalsPerAgent: 2,
          consensusThreshold: 0.6,
          enableEarlyExit: true
        }
      });

      if (!decisionResult.success) {
        throw new Error(`Decision failed: ${decisionResult.error}`);
      }

      logger.info('🎉 Oracle decision completed successfully!', {
        decisionId: decisionResult.decisionId,
        winnerId: decisionResult.winnerId,
        transactionHash: decisionResult.transactionHash,
        deliberationMode: decisionResult.deliberationMode
      });

      // Step 6: Verify final state
      logger.info('🔍 Verifying final state...');
      const updatedContract = await this.contractRepository.findById(testContractId);
      const decision = await this.decisionRepository.findByContractId(testContractId);
      
      if (!updatedContract || !decision) {
        throw new Error('Failed to verify final state - contract or decision not found');
      }

      logger.info('✅ Final verification completed', {
        contractStatus: updatedContract.status,
        winnerId: updatedContract.winnerId,
        decisionId: decision.id,
        confidence: decision.metadata.confidence
      });

      const duration = Date.now() - startTime;
      
      return {
        success: true,
        contractId: testContractId,
        winnerId: decisionResult.winnerId,
        transactionHash: decisionResult.transactionHash,
        duration,
        metadata: {
          deliberationMode: decisionResult.deliberationMode,
          committeeMetrics: decisionResult.committeeMetrics,
          contractFinalStatus: updatedContract.status,
          decisionConfidence: decision.metadata.confidence
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('❌ End-to-end test failed', {
        error: errorMessage,
        contractId: testContractId,
        duration
      });

      return {
        success: false,
        contractId: testContractId,
        error: errorMessage,
        duration
      };
    } finally {
      // Cleanup
      if (this.ethereumService.cleanup) {
        this.ethereumService.cleanup();
      }
    }
  }

  private async createTestContract(): Promise<Contract> {
    const contractId = `test_${this.testConfig.contractScenario}_${Date.now()}`;
    
    // Create test contract event data
    const eventData: ContractEventData = {
      contractId,
      creator: '0x1234567890123456789012345678901234567890',
      topic: this.getTestTopic(),
      description: this.getTestDescription(),
      partyA: this.getTestPartyA(),
      partyB: this.getTestPartyB(),
      bettingEndTime: Math.floor((Date.now() - 3600000) / 1000), // 1 hour ago
      blockNumber: 12345678,
      transactionHash: `0xtest${Date.now().toString(16)}`
    };

    // Create Party entities
    const partyA = new Party(
      `${contractId}:1`,
      '',
      eventData.partyA,
      `Detailed description for ${eventData.partyA}`
    );

    const partyB = new Party(
      `${contractId}:2`,
      '',
      eventData.partyB,
      `Detailed description for ${eventData.partyB}`
    );

    // Create Contract entity with BETTING_CLOSED status
    const contract = new Contract(
      contractId,
      eventData.transactionHash,
      partyA,
      partyB,
      new Date(eventData.bettingEndTime * 1000),
      10, // 10% winner reward percentage
      ContractStatus.BETTING_CLOSED, // Ready for decision
      undefined, // no winner yet
      eventData.creator,
      eventData.topic,
      eventData.description
    );

    logger.info('📋 Test contract created', {
      contractId,
      topic: eventData.topic,
      partyA: eventData.partyA,
      partyB: eventData.partyB,
      bettingEndTime: contract.bettingEndTime,
      status: contract.status
    });

    return contract;
  }

  private getTestTopic(): string {
    switch (this.testConfig.contractScenario) {
      case 'sports':
        return 'NBA Finals 2024 Championship Winner';
      case 'election':
        return '2024 US Presidential Election Winner';
      case 'crypto':
        return 'Bitcoin Price Prediction - Will BTC reach $100k in 2024?';
      case 'climate':
        return '2024 Global Temperature Record';
      case 'oscars':
        return '2024 Academy Awards Best Picture Winner';
      default:
        return 'Test Agreement Topic';
    }
  }

  private getTestDescription(): string {
    switch (this.testConfig.contractScenario) {
      case 'sports':
        return 'Prediction market for the NBA Finals 2024 championship winner between the top two teams.';
      case 'election':
        return 'Prediction market for the 2024 US Presidential Election outcome.';
      case 'crypto':
        return 'Prediction on whether Bitcoin will reach $100,000 USD by the end of 2024.';
      case 'climate':
        return 'Prediction on whether 2024 will set a new global temperature record.';
      case 'oscars':
        return 'Prediction market for the Best Picture winner at the 2024 Academy Awards.';
      default:
        return 'Test agreement description';
    }
  }

  private getTestPartyA(): string {
    switch (this.testConfig.contractScenario) {
      case 'sports':
        return 'Los Angeles Lakers';
      case 'election':
        return 'Democratic Candidate';
      case 'crypto':
        return 'Yes - BTC reaches $100k';
      case 'climate':
        return 'Yes - New record set';
      case 'oscars':
        return 'Oppenheimer';
      default:
        return 'Test Option A';
    }
  }

  private getTestPartyB(): string {
    switch (this.testConfig.contractScenario) {
      case 'sports':
        return 'Boston Celtics';
      case 'election':
        return 'Republican Candidate';
      case 'crypto':
        return 'No - BTC does not reach $100k';
      case 'climate':
        return 'No - No new record';
      case 'oscars':
        return 'Barbie';
      default:
        return 'Test Option B';
    }
  }
}

// CLI Interface
async function main() {
  console.log('🎯 Agora Oracle End-to-End Test Suite\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  try {
    // Get test configuration from user
    console.log('📋 Test Configuration:');
    
    const blockchainMode = await question('Use real blockchain? (y/N): ');
    const useRealBlockchain = blockchainMode.toLowerCase() === 'y';
    
    const committeeMode = await question('Use committee mode? (y/N): ');
    const useCommitteeMode = committeeMode.toLowerCase() === 'y';
    
    const aiMode = await question('Use mock AI responses? (Y/n): ');
    const useMockAI = aiMode.toLowerCase() !== 'n';
    
    console.log('\n📊 Available test scenarios:');
    console.log('1. sports - NBA Finals prediction');
    console.log('2. election - Presidential election prediction'); 
    console.log('3. crypto - Bitcoin price prediction');
    console.log('4. climate - Global temperature record');
    console.log('5. oscars - Academy Awards prediction');
    console.log('6. default - Simple test case');
    
    const scenarioChoice = await question('Choose scenario (1-6, default: 6): ');
    const scenarios = ['sports', 'election', 'crypto', 'climate', 'oscars', 'default'];
    const contractScenario = scenarios[parseInt(scenarioChoice) - 1] || 'default';
    
    rl.close();
    
    const testConfig: TestConfig = {
      useRealBlockchain,
      useCommitteeMode,
      useMockAI,
      contractScenario
    };

    console.log('\n🚀 Starting test with configuration:', testConfig);
    
    // Run the test
    const test = new E2EOracleTest(testConfig);
    const result = await test.runTest();
    
    // Display results
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
        
        if (result.metadata.committeeMetrics) {
          const metrics = result.metadata.committeeMetrics;
          console.log(`👥 Committee Proposals: ${metrics.totalProposals}`);
          console.log(`🤝 Consensus Level: ${metrics.consensusLevel}`);
          console.log(`💰 Total Cost: $${metrics.costBreakdown.totalCostUSD}`);
        }
      }
    } else {
      console.log('❌ Test Status: FAILED');
      console.log(`📝 Contract ID: ${result.contractId || 'N/A'}`);
      console.log(`❗ Error: ${result.error}`);
      console.log(`⏱️ Duration: ${result.duration}ms`);
    }
    
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { E2EOracleTest, TestConfig, TestResults };