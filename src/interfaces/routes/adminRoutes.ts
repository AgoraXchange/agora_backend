import { Router } from 'express';
import { container } from '../../container';
import { TYPES } from '../../types';
import { AdminController } from '../controllers/AdminController';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { adminRateLimiter } from '../middleware/rateLimitMiddleware';
import { asyncHandler } from '../middleware/errorMiddleware';
import { UserRole } from '../../domain/entities/User';
import {
  createUserSchema,
  updateUserSchema,
  getUsersSchema,
  deleteUserSchema,
  getActivityLogsSchema
} from '../validation/adminSchemas';

export function createAdminRoutes(): Router {
  const router = Router();
  const controller = container.get<AdminController>(TYPES.AdminController);

  // All admin routes require authentication and ADMIN role
  router.use(authenticate());
  router.use(authorize(UserRole.ADMIN));
  router.use(adminRateLimiter);

  // Dashboard endpoints - Frontend expects these paths
  router.get('/dashboard/stats',
    asyncHandler((req, res) => controller.getDashboardStats(req, res))
  );

  router.get('/dashboard',
    asyncHandler((req, res) => controller.getDashboard(req, res))
  );

  router.get('/stats',
    asyncHandler((req, res) => controller.getSystemStats(req, res))
  );

  router.get('/health',
    asyncHandler((req, res) => controller.getSystemHealth(req, res))
  );

  // Content management endpoints - Frontend expects these
  router.get('/prompt-templates',
    asyncHandler((req, res) => controller.getPromptTemplates(req, res))
  );

  // Seed initial prompt templates
  router.post('/prompt-templates/seed',
    asyncHandler((req, res) => controller.seedPromptTemplates(req, res))
  );

  router.get('/posts',
    asyncHandler((req, res) => controller.getPosts(req, res))
  );

  router.get('/comments',
    asyncHandler((req, res) => controller.getComments(req, res))
  );

  // Analytics endpoints - Frontend expects these
  router.get('/analytics/content',
    asyncHandler((req, res) => controller.getContentAnalytics(req, res))
  );

  router.get('/analytics/engagement',
    asyncHandler((req, res) => controller.getEngagementAnalytics(req, res))
  );

  // User management endpoints
  router.get('/users',
    validate(getUsersSchema),
    asyncHandler((req, res) => controller.getUsers(req, res))
  );

  router.post('/users',
    validate(createUserSchema),
    asyncHandler((req, res) => controller.createUser(req, res))
  );

  router.put('/users/:userId',
    validate(updateUserSchema),
    asyncHandler((req, res) => controller.updateUser(req, res))
  );

  router.delete('/users/:userId',
    validate(deleteUserSchema),
    asyncHandler((req, res) => controller.deleteUser(req, res))
  );

  // Activity log endpoints
  router.get('/activity-logs',
    validate(getActivityLogsSchema),
    asyncHandler((req, res) => controller.getActivityLogs(req, res))
  );

  return router;
}