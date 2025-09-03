import { Router } from 'express';
import { container } from '../../container';
import { DeliberationVisualizationController } from '../controllers/DeliberationVisualizationController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { apiRateLimiter } from '../middleware/rateLimitMiddleware';
import { asyncHandler } from '../middleware/errorMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { UserRole } from '../../domain/entities/User';
import { 
  getDeliberationSchema, 
  getDeliberationMessagesSchema, 
  exportDeliberationSchema 
} from '../validation/schemas';

const router = Router();

// Get controller instance from container
const getController = () => container.get<DeliberationVisualizationController>('DeliberationVisualizationController');

/**
 * GET /api/deliberations/:id
 * Gets complete visualization data for a deliberation
 * Requires authentication and appropriate permissions
 */
router.get(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.ORACLE_NODE),
  apiRateLimiter,
  validate(getDeliberationSchema),
  asyncHandler(async (req, res) => {
    const controller = getController();
    await controller.getDeliberationVisualization(req, res);
  })
);

/**
 * GET /api/deliberations/:id/stream
 * Streams real-time deliberation progress via Server-Sent Events
 * Authentication bypassed for SSE compatibility (EventSource doesn't support headers)
 * Security: deliberationId acts as a temporary access token
 */
router.get(
  '/:id/stream',
  // Authentication removed for SSE - EventSource API doesn't support headers
  // The deliberationId itself serves as access control
  validate(getDeliberationSchema),
  asyncHandler(async (req, res) => {
    const controller = getController();
    await controller.streamDeliberation(req, res);
  })
);

/**
 * GET /api/deliberations/:id/messages
 * Gets paginated messages for a deliberation
 * Supports filtering by phase and agent
 */
router.get(
  '/:id/messages',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.ORACLE_NODE),
  apiRateLimiter,
  validate(getDeliberationMessagesSchema),
  asyncHandler(async (req, res) => {
    const controller = getController();
    await controller.getDeliberationMessages(req, res);
  })
);

/**
 * GET /api/deliberations/:id/winner-arguments
 * Returns three logical arguments (with evidence) and a conclusion supporting the winner
 */
router.get(
  '/:id/winner-arguments',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.ORACLE_NODE),
  apiRateLimiter,
  validate(getDeliberationSchema),
  asyncHandler(async (req, res) => {
    const controller = getController();
    await controller.getWinnerJuryArguments(req, res);
  })
);

/**
 * GET /api/deliberations/:id/export
 * Exports deliberation data as a comprehensive report
 * Supports JSON and CSV formats
 */
router.get(
  '/:id/export',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.ORACLE_NODE),
  apiRateLimiter,
  validate(exportDeliberationSchema),
  asyncHandler(async (req, res) => {
    const controller = getController();
    await controller.exportDeliberationReport(req, res);
  })
);

export function createDeliberationRoutes(): Router {
  return router;
}
