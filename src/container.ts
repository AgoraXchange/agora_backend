import 'reflect-metadata';
import { Container } from 'inversify';
import { IContractRepository } from './domain/repositories/IContractRepository';
import { IOracleDecisionRepository } from './domain/repositories/IOracleDecisionRepository';
import { IAIService } from './domain/services/IAIService';
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

const container = new Container();

// Database connection
container.bind<MongoDBConnection>('MongoDBConnection').to(MongoDBConnection).inSingletonScope();

// Repositories - Use MongoDB in production, InMemory for testing
const useMongoDB = process.env.USE_MONGODB === 'true';
if (useMongoDB) {
  container.bind<IContractRepository>('IContractRepository').to(MongoContractRepository);
  container.bind<IOracleDecisionRepository>('IOracleDecisionRepository').to(MongoOracleDecisionRepository);
} else {
  container.bind<IContractRepository>('IContractRepository').to(InMemoryContractRepository);
  container.bind<IOracleDecisionRepository>('IOracleDecisionRepository').to(InMemoryOracleDecisionRepository);
}

// Services
container.bind<IAIService>('IAIService').to(OpenAIService);
container.bind<IBlockchainService>('IBlockchainService').to(EthereumService);
container.bind<JwtService>('JwtService').to(JwtService);
container.bind<CryptoService>('CryptoService').to(CryptoService);

// Use Cases
container.bind<DecideWinnerUseCase>('DecideWinnerUseCase').to(DecideWinnerUseCase);
container.bind<MonitorContractsUseCase>('MonitorContractsUseCase').to(MonitorContractsUseCase);

export { container };