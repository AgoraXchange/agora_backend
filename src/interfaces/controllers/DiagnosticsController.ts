import { Request, Response } from 'express';
import { container } from '../../container';
import { EthereumService } from '../../infrastructure/blockchain/EthereumService';
import { readinessTracker } from '../../infrastructure/readiness/ReadinessTracker';

export class DiagnosticsController {
  async getBlockchainDiagnostics(_req: Request, res: Response): Promise<void> {
    const service = container.get<EthereumService>('IBlockchainService') as EthereumService;
    const diag = service.getDiagnostics();
    const readiness = readinessTracker.getReadinessStatus();

    res.json({
      success: true,
      data: {
        blockchain: diag,
        readiness
      }
    });
  }
}

