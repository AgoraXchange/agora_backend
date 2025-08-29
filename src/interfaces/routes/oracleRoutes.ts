import { Router } from 'express';
import { OracleController } from '../controllers/OracleController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { decideWinnerValidationSchema, getDecisionValidationSchema, getWinnerArgumentsSchema } from '../validation/schemas';
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
    validate(decideWinnerValidationSchema),
    asyncHandler((req, res) => controller.decideWinner(req, res))
  );
  
  router.post('/contracts/:contractId/start-deliberation',
    authenticate(),
    authorize(UserRole.ADMIN, UserRole.ORACLE_NODE),
    oracleRateLimiter,
    validate(decideWinnerValidationSchema),
    asyncHandler((req, res) => controller.startDeliberation(req, res))
  );
  
  router.get('/contracts/:contractId/decision',
    authenticate(),
    validate(getDecisionValidationSchema),
    asyncHandler((req, res) => controller.getDecision(req, res))
  );

  router.get('/contracts/:contractId/winner-arguments',
    oracleRateLimiter,
    validate(getWinnerArgumentsSchema),
    asyncHandler((req, res) => controller.getWinnerArguments(req, res))
  );

  return router;
}
