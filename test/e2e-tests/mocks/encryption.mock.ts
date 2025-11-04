// test/e2e-tests/mocks/encryption.mock.ts

import { Injectable } from '@nestjs/common';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

export enum EncryptionKeyType {
  PII = 'PII',
  FINANCIAL = 'FINANCIAL',
  AUTH = 'AUTH',
  SENSITIVE = 'SENSITIVE',
}

/**
 * Mock EncryptionService that performs REAL encryption/decryption
 * This is important for E2E tests to work properly with transformers
 */
@Injectable()
export class EncryptionServiceMock {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keys: Map<EncryptionKeyType, Buffer>;
  private readonly hashSalt: string;

  constructor() {
    // Generate test keys (in production, these come from environment variables)
    this.hashSalt = process.env.HASH_SALT || 'test-hash-salt-for-testing';

    this.keys = new Map([
      [EncryptionKeyType.PII, this.getOrGenerateKey('ENCRYPTION_KEY_PII')],
      [
        EncryptionKeyType.FINANCIAL,
        this.getOrGenerateKey('ENCRYPTION_KEY_FINANCIAL'),
      ],
      [EncryptionKeyType.AUTH, this.getOrGenerateKey('ENCRYPTION_KEY_AUTH')],
      [
        EncryptionKeyType.SENSITIVE,
        this.getOrGenerateKey('ENCRYPTION_KEY_SENSITIVE'),
      ],
    ]);

    console.log('✅ EncryptionServiceMock initialized for tests');
  }

  /**
   * Get key from env or generate a test key
   */
  private getOrGenerateKey(envVarName: string): Buffer {
    const envKey = process.env[envVarName];
    if (envKey) {
      return Buffer.from(envKey, 'base64');
    }

    // Generate a random 32-byte key for testing
    return randomBytes(32);
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  encrypt(
    plaintext: string,
    keyType: EncryptionKeyType = EncryptionKeyType.PII,
  ): string {
    if (!plaintext) return plaintext;

    const key = this.keys.get(keyType);
    if (!key) {
      throw new Error(`Encryption key not found for type: ${keyType}`);
    }

    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: KEYTYPE:v1:iv:authTag:encryptedData
    return `${keyType}:v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypt data
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData || !encryptedData.includes(':v1:')) {
      return encryptedData;
    }

    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 5) {
        throw new Error('Invalid encrypted data format');
      }

      const [keyTypeStr, version, ivStr, authTagStr, encrypted] = parts;
      const keyType = keyTypeStr as EncryptionKeyType;

      const key = this.keys.get(keyType);
      if (!key) {
        throw new Error(`Decryption key not found for type: ${keyType}`);
      }

      const iv = Buffer.from(ivStr, 'base64');
      const authTag = Buffer.from(authTagStr, 'base64');

      const decipher = createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error.message);
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }

  /**
   * Generate SHA-256 hash (for email lookups)
   */
  hash(data: string): string {
    return createHash('sha256')
      .update(data + this.hashSalt)
      .digest('hex');
  }

  /**
   * Verify hash matches data
   */
  verifyHash(data: string, hash: string): boolean {
    return this.hash(data) === hash;
  }

  /**
   * Check if data is encrypted
   */
  isEncrypted(data: string): boolean {
    return data && data.includes(':v1:');
  }

  /**
   * Get encryption version from encrypted data
   */
  getVersion(encryptedData: string): string | null {
    if (!this.isEncrypted(encryptedData)) {
      return null;
    }
    return encryptedData.split(':')[1];
  }
}
