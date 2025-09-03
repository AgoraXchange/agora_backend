import CryptoJS from 'crypto-js';
import { injectable } from 'inversify';
import { logger } from '../logging/Logger';

@injectable()
export class CryptoService {
  private readonly encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || '';
    // Do not throw during construction to allow apps that don't need crypto to boot
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      logger.warn('ENCRYPTION_KEY is not set or too short; cryptographic operations will be disabled until properly configured');
    }
  }

  encrypt(text: string): string {
    try {
      this.assertKey();
      const encrypted = CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
      return encrypted;
    } catch (error) {
      logger.error('Encryption failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to encrypt data');
    }
  }

  decrypt(encryptedText: string): string {
    try {
      this.assertKey();
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
    this.assertKey();
    return this.decrypt(encryptedKey);
  }

  private assertKey(): void {
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY missing or too short (>= 32 chars required)');
    }
  }
}