import CryptoJS from 'crypto-js';
import { injectable } from 'inversify';
import { logger } from '../logging/Logger';

@injectable()
export class CryptoService {
  private readonly encryptionKey: string;
  private readonly isDegraded: boolean = false;

  constructor() {
    const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
    const isTest = process.env.NODE_ENV === 'test';
    this.encryptionKey = process.env.ENCRYPTION_KEY || '';
    
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      if (isRailway || isTest) {
        logger.warn('ENCRYPTION_KEY missing or too short. Using dummy key for degraded mode.');
        // Use a safe dummy key for Railway deployment and testing
        this.encryptionKey = 'railway-default-encryption-key-32-characters!!!';
        (this as any).isDegraded = true;
      } else {
        throw new Error('Encryption key must be at least 32 characters long');
      }
    } else {
      logger.info('CryptoService initialized successfully');
    }
  }

  encrypt(text: string): string {
    if (this.isDegraded) {
      logger.warn('CryptoService is in degraded mode - encryption may not be secure');
    }
    
    try {
      const encrypted = CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
      return encrypted;
    } catch (error) {
      logger.error('Encryption failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to encrypt data');
    }
  }

  decrypt(encryptedText: string): string {
    if (this.isDegraded) {
      logger.warn('CryptoService is in degraded mode - decryption may fail');
    }
    
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      logger.error('Decryption failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to decrypt data');
    }
  }

  getSecurePrivateKey(): string {
    // Check for direct private key first (Railway deployment)
    const directPrivateKey = process.env.PRIVATE_KEY;
    if (directPrivateKey && directPrivateKey.length > 0) {
      logger.info('Using direct private key from environment');
      return directPrivateKey;
    }
    
    // Fall back to encrypted private key
    const encryptedKey = process.env.ORACLE_PRIVATE_KEY_ENCRYPTED;
    if (!encryptedKey || encryptedKey.length === 0) {
      if (this.isDegraded) {
        logger.warn('No private key configured - returning test key for degraded mode');
        return '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Test key
      }
      throw new Error('Private key not configured (PRIVATE_KEY or ORACLE_PRIVATE_KEY_ENCRYPTED)');
    }
    
    try {
      return this.decrypt(encryptedKey);
    } catch (error) {
      if (this.isDegraded) {
        logger.warn('Failed to decrypt private key - using test key for degraded mode');
        return '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Test key
      }
      throw error;
    }
  }
}