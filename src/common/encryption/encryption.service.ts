// src/common/encryption/encryption.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export enum EncryptionKeyType {
  PII = 'PII',
  FINANCIAL = 'FINANCIAL',
  AUTH = 'AUTH',
  SENSITIVE = 'SENSITIVE',
}

interface EncryptionKey {
  version: number;
  key: Buffer;
  createdAt: Date;
}

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keys: Map<string, EncryptionKey[]> = new Map();

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.loadKeys();
    this.verifyEncryption(); // Test encryption on startup
  }

  private loadKeys(): void {
    this.loadKeyVersions(EncryptionKeyType.PII, [
      {
        version: 1,
        key: this.configService.get<string>('ENCRYPTION_KEY_PII'),
      },
    ]);

    this.loadKeyVersions(EncryptionKeyType.FINANCIAL, [
      {
        version: 1,
        key: this.configService.get<string>('ENCRYPTION_KEY_FINANCIAL'),
      },
    ]);

    this.loadKeyVersions(EncryptionKeyType.AUTH, [
      {
        version: 1,
        key: this.configService.get<string>('ENCRYPTION_KEY_AUTH'),
      },
    ]);

    this.loadKeyVersions(EncryptionKeyType.SENSITIVE, [
      {
        version: 1,
        key: this.configService.get<string>('ENCRYPTION_KEY_SENSITIVE'),
      },
    ]);
  }

  private loadKeyVersions(
    keyType: EncryptionKeyType,
    versions: Array<{ version: number; key: string }>,
  ): void {
    const keyList: EncryptionKey[] = [];

    for (const v of versions) {
      if (!v.key) {
        throw new Error(
          `${keyType} encryption key (v${v.version}) is not configured. Check your .env file.`,
        );
      }

      if (v.key.length < 32) {
        throw new Error(
          `${keyType} encryption key must be at least 32 characters. Use: openssl rand -base64 32`,
        );
      }

      // Derive a proper 32-byte key using scrypt
      const derivedKey = crypto.scryptSync(
        v.key,
        `salt-${keyType}-v${v.version}`,
        32,
      );

      keyList.push({
        version: v.version,
        key: derivedKey,
        createdAt: new Date(),
      });
    }

    this.keys.set(keyType, keyList);
  }

  private getCurrentKey(keyType: EncryptionKeyType): EncryptionKey {
    const keys = this.keys.get(keyType);
    if (!keys || keys.length === 0) {
      throw new Error(`No keys found for type: ${keyType}`);
    }

    // Return the highest version (most recent)
    return keys.reduce((latest, current) =>
      current.version > latest.version ? current : latest,
    );
  }

  private getKeyVersion(
    keyType: EncryptionKeyType,
    version: number,
  ): EncryptionKey {
    const keys = this.keys.get(keyType);
    const key = keys?.find((k) => k.version === version);

    if (!key) {
      throw new Error(`Key version ${version} not found for type: ${keyType}`);
    }

    return key;
  }

  /**
   * Encrypt data with current key version
   * Format: keyType:version:iv:authTag:encryptedData
   */
  encrypt(plaintext: string, keyType: EncryptionKeyType): string {
    if (!plaintext) return plaintext;

    const keyObj = this.getCurrentKey(keyType);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, keyObj.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Include key type AND version for future key rotation
    return `${keyType}:v${keyObj.version}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt using the correct key version
   */
  decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;

    try {
      const parts = ciphertext.split(':');

      if (parts.length !== 5) {
        throw new Error('Invalid encrypted data format');
      }

      const keyType = parts[0] as EncryptionKeyType;
      const versionStr = parts[1]; // e.g., "v1"
      const version = parseInt(versionStr.replace('v', ''));
      const ivHex = parts[2];
      const authTagHex = parts[3];
      const encryptedData = parts[4];

      // Get the specific key version used to encrypt this data
      const keyObj = this.getKeyVersion(keyType, version);

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, keyObj.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Re-encrypt data with the latest key version
   */
  reEncrypt(ciphertext: string, keyType: EncryptionKeyType): string {
    const plaintext = this.decrypt(ciphertext);
    return this.encrypt(plaintext, keyType);
  }

  /**
   * Check if data needs re-encryption (using old key version)
   */
  needsReEncryption(ciphertext: string, keyType: EncryptionKeyType): boolean {
    if (!ciphertext) return false;

    try {
      const parts = ciphertext.split(':');
      const versionStr = parts[1];
      const version = parseInt(versionStr.replace('v', ''));

      const currentKey = this.getCurrentKey(keyType);
      return version < currentKey.version;
    } catch {
      return false;
    }
  }

  /**
   * Hash data (one-way, for searchable fields like email)
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify encryption works on startup
   */
  private verifyEncryption(): void {
    const testData = 'test-encryption-data';

    try {
      // Test each key type
      for (const keyType of Object.values(EncryptionKeyType)) {
        const encrypted = this.encrypt(testData, keyType);
        const decrypted = this.decrypt(encrypted);

        if (decrypted !== testData) {
          throw new Error(`Encryption verification failed for ${keyType}`);
        }
      }

      console.log('✅ Encryption service initialized successfully');
    } catch (error) {
      console.error('❌ Encryption verification failed:', error.message);
      throw error;
    }
  }
}
