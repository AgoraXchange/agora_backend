import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from './types';
import { IContractRepository } from './domain/repositories/IContractRepository';
import { IOracleDecisionRepository } from './domain/repositories/IOracleDecisionRepository';
import { IUserRepository } from './domain/repositories/IUserRepository';
import { IActivityLogRepository } from './domain/repositories/IActivityLogRepository';
import { IAIService } from './domain/services/IAIService';
import { ICommitteeService } from './domain/services/ICommitteeService';
import { IAgentService, IJudgeService, ISynthesizerService } from './domain/services/IAgentService';
import { IBlockchainService } from './domain/services/IBlockchainService';
import { InMemoryContractRepository } from './infrastructure/repositories/InMemoryContractRepository';
import { InMemoryOracleDecisionRepository } from './infrastructure/repositories/InMemoryOracleDecisionRepository';
import { InMemoryUserRepository } from './infrastructure/repositories/InMemoryUserRepository';
import { InMemoryActivityLogRepository } from './infrastructure/repositories/InMemoryActivityLogRepository';
import { MongoContractRepository } from './infrastructure/repositories/MongoContractRepository';
import { MongoOracleDecisionRepository } from './infrastructure/repositories/MongoOracleDecisionRepository';
import { MongoUserRepository } from './infrastructure/repositories/MongoUserRepository';
import { MongoActivityLogRepository } from './infrastructure/repositories/MongoActivityLogRepository';
import { OpenAIService } from './infrastructure/ai/OpenAIService';
import { EthereumService } from './infrastructure/blockchain/EthereumService';
import { DecideWinnerUseCase } from './application/useCases/DecideWinnerUseCase';
import { MonitorContractsUseCase } from './application/useCases/MonitorContractsUseCase';
import { JwtService } from './infrastructure/auth/JwtService';
import { CryptoService } from './infrastructure/auth/CryptoService';
import { MongoDBConnection } from './infrastructure/database/MongoDBConnection';

// Admin System Imports
import { IPromptTemplateRepository } from './admin/domain/repositories/IPromptTemplateRepository';
import { IPostRepository } from './admin/domain/repositories/IPostRepository';
import { ICommentRepository } from './admin/domain/repositories/ICommentRepository';
// import { MongoPromptTemplateRepository } from './admin/infrastructure/repositories/MongoPromptTemplateRepository';
import { MongoPostRepository } from './admin/infrastructure/repositories/MongoPostRepository';
import { MongoCommentRepository } from './admin/infrastructure/repositories/MongoCommentRepository';
import { StubPromptTemplateRepository } from './admin/infrastructure/repositories/StubPromptTemplateRepository';
import { StubPostRepository } from './admin/infrastructure/repositories/StubPostRepository';
import { StubCommentRepository } from './admin/infrastructure/repositories/StubCommentRepository';
import { PromptTemplateUseCases } from './admin/application/useCases/PromptTemplateUseCases';
import { PostUseCases } from './admin/application/useCases/PostUseCases';
import { CommentUseCases } from './admin/application/useCases/CommentUseCases';
import { AdminContentController } from './admin/interfaces/controllers/AdminContentController';
import { AdminController } from './interfaces/controllers/AdminController';

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
import { IWinnerArgumentsCache } from './domain/repositories/IWinnerArgumentsCache';
import { InMemoryWinnerArgumentsCache } from './infrastructure/repositories/InMemoryWinnerArgumentsCache';
import { MongoWinnerArgumentsCache } from './infrastructure/repositories/MongoWinnerArgumentsCache';

const container = new Container();

// Database connection
container.bind<MongoDBConnection>(TYPES.MongoDBConnection).to(MongoDBConnection).inSingletonScope();

// MongoDB Database for admin repositories - Only bind when MongoDB is enabled
if (process.env.USE_MONGODB === 'true') {
  container.bind(TYPES.MongoClient).toDynamicValue((context) => {
    const mongoConnection = context.container.get<MongoDBConnection>(TYPES.MongoDBConnection);
    return mongoConnection.getDb();
  });
}

// Core Repositories - Use MongoDB in production, InMemory for testing
const useMongoDB = process.env.USE_MONGODB === 'true';
if (useMongoDB) {
  container.bind<IContractRepository>(TYPES.IContractRepository).to(MongoContractRepository).inSingletonScope();
  container.bind<IOracleDecisionRepository>(TYPES.IOracleDecisionRepository).to(MongoOracleDecisionRepository).inSingletonScope();
  container.bind<IWinnerArgumentsCache>(TYPES.IWinnerArgumentsCache).to(MongoWinnerArgumentsCache).inSingletonScope();
  container.bind<IUserRepository>(TYPES.IUserRepository).to(MongoUserRepository).inSingletonScope();
  container.bind<IActivityLogRepository>(TYPES.IActivityLogRepository).to(MongoActivityLogRepository).inSingletonScope();
} else {
  container.bind<IContractRepository>(TYPES.IContractRepository).to(InMemoryContractRepository).inSingletonScope();
  container.bind<IOracleDecisionRepository>(TYPES.IOracleDecisionRepository).to(InMemoryOracleDecisionRepository).inSingletonScope();
  container.bind<IWinnerArgumentsCache>(TYPES.IWinnerArgumentsCache).to(InMemoryWinnerArgumentsCache).inSingletonScope();
  container.bind<IUserRepository>(TYPES.IUserRepository).to(InMemoryUserRepository).inSingletonScope();
  container.bind<IActivityLogRepository>(TYPES.IActivityLogRepository).to(InMemoryActivityLogRepository).inSingletonScope();
}

// Admin Repositories - Use MongoDB when enabled, stubs when disabled
if (useMongoDB) {
  container.bind<IPromptTemplateRepository>(TYPES.IPromptTemplateRepository).to(StubPromptTemplateRepository).inSingletonScope(); // TODO: Fix MongoPromptTemplateRepository
  container.bind<IPostRepository>(TYPES.IPostRepository).to(MongoPostRepository).inSingletonScope();
  container.bind<ICommentRepository>(TYPES.ICommentRepository).to(MongoCommentRepository).inSingletonScope();
} else {
  container.bind<IPromptTemplateRepository>(TYPES.IPromptTemplateRepository).to(StubPromptTemplateRepository).inSingletonScope();
  container.bind<IPostRepository>(TYPES.IPostRepository).to(StubPostRepository).inSingletonScope();
  container.bind<ICommentRepository>(TYPES.ICommentRepository).to(StubCommentRepository).inSingletonScope();
}

// Admin Use Cases
container.bind<PromptTemplateUseCases>(TYPES.PromptTemplateUseCases).to(PromptTemplateUseCases).inSingletonScope();
container.bind<PostUseCases>(TYPES.PostUseCases).to(PostUseCases).inSingletonScope();
container.bind<CommentUseCases>(TYPES.CommentUseCases).to(CommentUseCases).inSingletonScope();

// Admin Controllers
container.bind<AdminController>(TYPES.AdminController).to(AdminController).inSingletonScope();
container.bind<AdminContentController>(TYPES.AdminContentController).to(AdminContentController).inSingletonScope();

// Core Services
container.bind<IAIService>(TYPES.IAIService).to(OpenAIService);
container.bind<IBlockchainService>(TYPES.IBlockchainService).to(EthereumService).inSingletonScope();
container.bind<JwtService>(TYPES.JwtService).to(JwtService);
container.bind<CryptoService>(TYPES.CryptoService).to(CryptoService);

// Committee System Services
container.bind<ICommitteeService>(TYPES.ICommitteeService).to(CommitteeOrchestrator);
container.bind<IJudgeService>(TYPES.IJudgeService).to(CommitteeJudgeService);
container.bind<ISynthesizerService>(TYPES.ISynthesizerService).to(ConsensusSynthesizer);

// Visualization and Event Services
container.bind<DeliberationEventEmitter>(TYPES.DeliberationEventEmitter).to(DeliberationEventEmitter).inSingletonScope();
container.bind<MessageCollector>(TYPES.MessageCollector).to(MessageCollector);
container.bind<DeliberationVisualizationController>(TYPES.DeliberationVisualizationController).to(DeliberationVisualizationController);

// Coordination
container.bind<DecisionCoordinator>(TYPES.DecisionCoordinator).to(DecisionCoordinator).inSingletonScope();

// Proposer Agents - Always bind all agents, filtering will be done at runtime
container.bind<IAgentService>(TYPES.GPT5Proposer).to(GPT5Proposer);
container.bind<IAgentService>(TYPES.ClaudeProposer).to(ClaudeProposer);
container.bind<IAgentService>(TYPES.GeminiProposer).to(GeminiProposer);

// Factory for ProposerAgents that returns enabled agents based on environment configuration
container.bind<IAgentService[]>(TYPES.ProposerAgents).toDynamicValue((context) => {
  const enabledProposers: IAgentService[] = [];

  if (process.env.PROPOSER_GPT5_ENABLED !== 'false') {
    enabledProposers.push(context.container.get<IAgentService>(TYPES.GPT5Proposer));
  }

  if (process.env.PROPOSER_CLAUDE_ENABLED !== 'false') {
    enabledProposers.push(context.container.get<IAgentService>(TYPES.ClaudeProposer));
  }

  if (process.env.PROPOSER_GEMINI_ENABLED !== 'false') {
    enabledProposers.push(context.container.get<IAgentService>(TYPES.GeminiProposer));
  }

  return enabledProposers;
}).inSingletonScope();

// Core Use Cases
container.bind<DecideWinnerUseCase>(TYPES.DecideWinnerUseCase).to(DecideWinnerUseCase);
container.bind<MonitorContractsUseCase>(TYPES.MonitorContractsUseCase).to(MonitorContractsUseCase);

export { container };
