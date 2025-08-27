import { Request, Response } from 'express';
import { injectable } from 'inversify';
import { container } from '../../container';
import { JwtService } from '../../infrastructure/auth/JwtService';
import { AppError } from '../../domain/errors/AppError';
import { User, UserRole } from '../../domain/entities/User';
import { logger } from '../../infrastructure/logging/Logger';

@injectable()
export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body;
    
    // TODO: Implement user repository and fetch user from database
    // For now, using hardcoded admin user
    const hardcodedUser = {
      id: 'admin-1',
      username: 'admin',
      passwordHash: await container.get<JwtService>('JwtService').hashPassword('admin123'),
      role: UserRole.ADMIN
    };

    const jwtService = container.get<JwtService>('JwtService');
    
    if (username !== hardcodedUser.username) {
      throw AppError.unauthorized('Invalid credentials');
    }

    const isValidPassword = await jwtService.validatePassword(password, hardcodedUser.passwordHash);
    if (!isValidPassword) {
      throw AppError.unauthorized('Invalid credentials');
    }

    const user = new User(
      hardcodedUser.id,
      hardcodedUser.username,
      hardcodedUser.passwordHash,
      hardcodedUser.role
    );

    const tokens = jwtService.generateTokens(user);
    
    logger.info('User logged in', { userId: user.id, username: user.username });

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      }
    });
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw AppError.unauthorized('Refresh token required');
    }

    const jwtService = container.get<JwtService>('JwtService');
    
    const payload = jwtService.verifyRefreshToken(refreshToken);
    
    // TODO: Fetch user from database
    const user = new User(
      payload.userId,
      payload.username,
      '', // passwordHash not needed for token generation
      payload.role
    );

    const tokens = jwtService.generateTokens(user);
    
    logger.info('Token refreshed', { userId: user.id });

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });
  }

  async logout(req: Request, res: Response): Promise<void> {
    // TODO: Implement token blacklisting
    logger.info('User logged out', { userId: req.user?.userId });
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
}