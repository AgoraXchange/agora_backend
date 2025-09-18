import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { validate } from '../middleware/validationMiddleware';
import { loginSchema } from '../validation/schemas';
import { authRateLimiter } from '../middleware/rateLimitMiddleware';
import { asyncHandler } from '../middleware/errorMiddleware';
import { authenticate } from '../middleware/authMiddleware';

export function createAuthRoutes(): Router {
  const router = Router();
  const controller = new AuthController();

  router.post('/login', 
    authRateLimiter,
    validate(loginSchema),
    asyncHandler((req, res) => controller.login(req, res))
  );
  
  router.post('/refresh',
    authRateLimiter,
    asyncHandler((req, res) => controller.refreshToken(req, res))
  );

  router.get('/me',
    authenticate(),
    asyncHandler((req, res) => controller.getCurrentUser(req, res))
  );

  router.post('/logout',
    asyncHandler((req, res) => controller.logout(req, res))
  );

  return router;
}