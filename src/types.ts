export const TYPES = {
  // Database
  MongoDBConnection: Symbol.for('MongoDBConnection'),
  MongoClient: Symbol.for('MongoClient'),

  // Core Repositories
  IContractRepository: Symbol.for('IContractRepository'),
  IOracleDecisionRepository: Symbol.for('IOracleDecisionRepository'),
  IWinnerArgumentsCache: Symbol.for('IWinnerArgumentsCache'),
  IUserRepository: Symbol.for('IUserRepository'),
  IActivityLogRepository: Symbol.for('IActivityLogRepository'),

  // Admin Repositories
  IPromptTemplateRepository: Symbol.for('IPromptTemplateRepository'),
  IPostRepository: Symbol.for('IPostRepository'),
  ICommentRepository: Symbol.for('ICommentRepository'),

  // Core Services
  IAIService: Symbol.for('IAIService'),
  IBlockchainService: Symbol.for('IBlockchainService'),
  ICommitteeService: Symbol.for('ICommitteeService'),
  IJudgeService: Symbol.for('IJudgeService'),
  ISynthesizerService: Symbol.for('ISynthesizerService'),
  IAgentService: Symbol.for('IAgentService'),

  // Authentication & Security
  JwtService: Symbol.for('JwtService'),
  CryptoService: Symbol.for('CryptoService'),

  // Admin Use Cases
  PromptTemplateUseCases: Symbol.for('PromptTemplateUseCases'),
  PostUseCases: Symbol.for('PostUseCases'),
  CommentUseCases: Symbol.for('CommentUseCases'),

  // Admin Controllers
  AdminController: Symbol.for('AdminController'),
  AdminContentController: Symbol.for('AdminContentController'),

  // Core Use Cases
  DecideWinnerUseCase: Symbol.for('DecideWinnerUseCase'),
  MonitorContractsUseCase: Symbol.for('MonitorContractsUseCase'),

  // Committee System
  DeliberationEventEmitter: Symbol.for('DeliberationEventEmitter'),
  MessageCollector: Symbol.for('MessageCollector'),
  DeliberationVisualizationController: Symbol.for('DeliberationVisualizationController'),
  DecisionCoordinator: Symbol.for('DecisionCoordinator'),

  // Proposer Agents
  GPT5Proposer: Symbol.for('GPT5Proposer'),
  ClaudeProposer: Symbol.for('ClaudeProposer'),
  GeminiProposer: Symbol.for('GeminiProposer'),
  ProposerAgents: Symbol.for('ProposerAgents')
};