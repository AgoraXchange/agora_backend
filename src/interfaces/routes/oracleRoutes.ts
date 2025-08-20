import { Router } from 'express';
import { OracleController } from '../controllers/OracleController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { decideWinnerSchema, contractIdSchema } from '../validation/schemas';
import { oracleRateLimiter } from '../middleware/rateLimitMiddleware';
import { asyncHandler } from '../middleware/errorMiddleware';
import { UserRole } from '../../domain/entities/User';

export function createOracleRoutes(): Router {
  const router = Router();
  const controller = new OracleController();

  router.post('/contracts/:contractId/decide-winner',
    authenticate(),
    authorize(UserRole.ADMIN, UserRole.ORACLE_NODE),
    oracleRateLimiter,
    validate(decideWinnerSchema),
    asyncHandler((req, res) => controller.decideWinner(req, res))
  );
  
  router.get('/contracts/:contractId/decision',
    authenticate(),
    validate(contractIdSchema),
    asyncHandler((req, res) => controller.getDecision(req, res))
  );

  return router;
}