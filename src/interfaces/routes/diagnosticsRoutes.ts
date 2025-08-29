import { Router } from 'express';
import { DiagnosticsController } from '../controllers/DiagnosticsController';

export function createDiagnosticsRoutes(): Router {
  const router = Router();
  const controller = new DiagnosticsController();

  // No auth to allow platform verification; keep lightweight
  router.get('/blockchain', (req, res) => controller.getBlockchainDiagnostics(req, res));

  return router;
}

