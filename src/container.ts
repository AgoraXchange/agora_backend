import 'reflect-metadata';
import { Container } from 'inversify';
import { IContractRepository } from './domain/repositories/IContractRepository';
import { IOracleDecisionRepository } from './domain/repositories/IOracleDecisionRepository';
import { IAIService } from './domain/services/IAIService';
import { ICommitteeService } from './domain/services/ICommitteeService';
import { IAgentService, IJudgeService, ISynthesizerService } from './domain/services/IAgentService';
import { IBlockchainService } from './domain/services/IBlockchainService';
import { InMemoryContractRepository } from './infrastructure/repositories/InMemoryContractRepository';
import { InMemoryOracleDecisionRepository } from './infrastructure/repositories/InMemoryOracleDecisionRepository';
import { MongoContractRepository } from './infrastructure/repositories/MongoContractRepository';
import { MongoOracleDecisionRepository } from './infrastructure/repositories/MongoOracleDecisionRepository';
import { OpenAIService } from './infrastructure/ai/OpenAIService';
import { EthereumService } from './infrastructure/blockchain/EthereumService';
import { DecideWinnerUseCase } from './application/useCases/DecideWinnerUseCase';
import { MonitorContractsUseCase } from './application/useCases/MonitorContractsUseCase';
import { JwtService } from './infrastructure/auth/JwtService';
import { CryptoService } from './infrastructure/auth/CryptoService';
import { MongoDBConnection } from './infrastructure/database/MongoDBConnection';

// Committee System Imports
import { CommitteeOrchestrator } from './infrastructure/committee/CommitteeOrchestrator';
import { GPT5Proposer } from './infrastructure/committee/proposers/GPT5Proposer';
import { ClaudeProposer } from './infrastructure/committee/proposers/ClaudeProposer';
import { GeminiProposer } from './infrastructure/committee/proposers/GeminiProposer';
import { CommitteeJudgeService } from './infrastructure/committee/judges/CommitteeJudgeService';
import { ConsensusSynthesizer } from './infrastructure/committee/synthesizer/ConsensusSynthesizer';
import { MessageCollector } from './infrastructure/committee/MessageCollector';
import { DeliberationEventEmitter } from './infrastructure/committee/events/DeliberationEventEmitter';
import { DeliberationVisualizationController } from './interfaces/controllers/DeliberationVisualizationController';
import { DecisionCoordinator } from './infrastructure/coordination/DecisionCoordinator';

const container = new Container();

// Database connection
container.bind<MongoDBConnection>('MongoDBConnection').to(MongoDBConnection).inSingletonScope();

// Repositories - Use MongoDB in production, InMemory for testing
const useMongoDB = process.env.USE_MONGODB === 'true';
if (useMongoDB) {
  container.bind<IContractRepository>('IContractRepository').to(MongoContractRepository).inSingletonScope();
  container.bind<IOracleDecisionRepository>('IOracleDecisionRepository').to(MongoOracleDecisionRepository).inSingletonScope();
} else {
  container.bind<IContractRepository>('IContractRepository').to(InMemoryContractRepository).inSingletonScope();
  container.bind<IOracleDecisionRepository>('IOracleDecisionRepository').to(InMemoryOracleDecisionRepository).inSingletonScope();
}

// Services
container.bind<IAIService>('IAIService').to(OpenAIService);
container.bind<IBlockchainService>('IBlockchainService').to(EthereumService).inSingletonScope();
container.bind<JwtService>('JwtService').to(JwtService);
container.bind<CryptoService>('CryptoService').to(CryptoService);

// Committee System Services
container.bind<ICommitteeService>('ICommitteeService').to(CommitteeOrchestrator);
container.bind<IJudgeService>('JudgeService').to(CommitteeJudgeService);
container.bind<ISynthesizerService>('SynthesizerService').to(ConsensusSynthesizer);

// Visualization and Event Services
container.bind<DeliberationEventEmitter>('DeliberationEventEmitter').to(DeliberationEventEmitter).inSingletonScope();
container.bind<MessageCollector>('MessageCollector').to(MessageCollector);
container.bind<DeliberationVisualizationController>('DeliberationVisualizationController').to(DeliberationVisualizationController);

// Coordination
container.bind<DecisionCoordinator>('DecisionCoordinator').to(DecisionCoordinator).inSingletonScope();

// Proposer Agents - Always bind all agents, filtering will be done at runtime
container.bind<IAgentService>('GPT5Proposer').to(GPT5Proposer);
container.bind<IAgentService>('ClaudeProposer').to(ClaudeProposer);
container.bind<IAgentService>('GeminiProposer').to(GeminiProposer);

// Factory for ProposerAgents that returns enabled agents based on environment configuration
container.bind<IAgentService[]>('ProposerAgents').toDynamicValue((context) => {
  const enabledProposers: IAgentService[] = [];
  
  if (process.env.PROPOSER_GPT5_ENABLED !== 'false') {
    enabledProposers.push(context.container.get<IAgentService>('GPT5Proposer'));
  }
  
  if (process.env.PROPOSER_CLAUDE_ENABLED !== 'false') {
    enabledProposers.push(context.container.get<IAgentService>('ClaudeProposer'));
  }
  
  if (process.env.PROPOSER_GEMINI_ENABLED !== 'false') {
    enabledProposers.push(context.container.get<IAgentService>('GeminiProposer'));
  }
  
  return enabledProposers;
}).inSingletonScope();

// Use Cases
container.bind<DecideWinnerUseCase>('DecideWinnerUseCase').to(DecideWinnerUseCase);
container.bind<MonitorContractsUseCase>('MonitorContractsUseCase').to(MonitorContractsUseCase);

export { container };
