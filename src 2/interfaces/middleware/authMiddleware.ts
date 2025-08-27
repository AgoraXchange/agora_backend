import { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { JwtService, JwtPayload } from '../../infrastructure/auth/JwtService';
import { AppError } from '../../domain/errors/AppError';
import { UserRole } from '../../domain/entities/User';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw AppError.unauthorized('No token provided');
      }

      const token = authHeader.substring(7);
      const jwtService = container.get<JwtService>('JwtService');
      const payload = jwtService.verifyAccessToken(token);
      
      req.user = payload;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(401).json({
          success: false,
          error: 'Authentication failed'
        });
      }
    }
  };
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
}