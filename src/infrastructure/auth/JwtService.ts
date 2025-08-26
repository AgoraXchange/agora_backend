import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { injectable } from 'inversify';
import { AppError } from '../../domain/errors/AppError';
import { User, UserRole } from '../../domain/entities/User';
import { logger } from '../logging/Logger';

export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@injectable()
export class JwtService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;
  private readonly saltRounds: number = 10;

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || '';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || '';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';

    if (!this.accessTokenSecret || !this.refreshTokenSecret) {
      throw new Error('JWT secrets must be configured');
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateTokens(user: User): AuthTokens {
    const payload: JwtPayload = {
      userId: user.id,
      username: user.username,
      role: user.role
    };

    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry
    });

    const refreshToken = jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry
    });

    logger.info('Generated tokens for user', { userId: user.id });

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.accessTokenSecret) as JwtPayload;
    } catch (error) {
      logger.warn('Invalid access token', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw AppError.unauthorized('Invalid access token');
    }
  }

  verifyRefreshToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.refreshTokenSecret) as JwtPayload;
    } catch (error) {
      logger.warn('Invalid refresh token', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw AppError.unauthorized('Invalid refresh token');
    }
  }
}