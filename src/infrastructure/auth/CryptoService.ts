import CryptoJS from 'crypto-js';
import { injectable } from 'inversify';
import { logger } from '../logging/Logger';

@injectable()
export class CryptoService {
  private readonly encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || '';
    
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      throw new Error('Encryption key must be at least 32 characters long');
    }
  }

  encrypt(text: string): string {
    try {
      const encrypted = CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
      return encrypted;
    } catch (error) {
      logger.error('Encryption failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to encrypt data');
    }
  }

  decrypt(encryptedText: string): string {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      logger.error('Decryption failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to decrypt data');
    }
  }

  getSecurePrivateKey(): string {
    const encryptedKey = process.env.ORACLE_PRIVATE_KEY_ENCRYPTED;
    if (!encryptedKey) {
      throw new Error('Encrypted private key not configured');
    }
    
    return this.decrypt(encryptedKey);
  }
}