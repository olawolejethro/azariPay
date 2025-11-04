// src/common/transformers/encrypted-column.transformer.ts
import { ValueTransformer } from 'typeorm';
import { EncryptionService, EncryptionKeyType } from '../encryption.service';

// Global reference to encryption service
let globalEncryptionService: EncryptionService;

export function setEncryptionService(service: EncryptionService) {
  globalEncryptionService = service;
  console.log('✅ EncryptionService set for transformers');
}

export class EncryptedColumnTransformer implements ValueTransformer {
  constructor(private keyType: EncryptionKeyType) {}

  to(value: string): string {
    if (!value) return value;
    if (!globalEncryptionService) {
      console.warn(
        '⚠️ EncryptionService not initialized, returning plain value',
      );
      return value;
    }

    // Don't double-encrypt - if already encrypted, return as-is
    if (value.startsWith(`${this.keyType}:`)) {
      return value;
    }

    const encrypted = globalEncryptionService.encrypt(value, this.keyType);
    return encrypted;
  }

  from(value: string): string {
    if (!value) return value;
    if (!globalEncryptionService) {
      console.warn('⚠️ EncryptionService not initialized for decryption');
      return value;
    }

    // If not encrypted (doesn't contain version marker), return as-is
    if (!value.includes(':v')) {
      return value;
    }

    const decrypted = globalEncryptionService.decrypt(value);
    return decrypted;
  }
}

// Export singleton instances for each key type
export const PIIEncrypted = new EncryptedColumnTransformer(
  EncryptionKeyType.PII,
);
export const FinancialEncrypted = new EncryptedColumnTransformer(
  EncryptionKeyType.FINANCIAL,
);
export const AuthEncrypted = new EncryptedColumnTransformer(
  EncryptionKeyType.AUTH,
);
export const SensitiveEncrypted = new EncryptedColumnTransformer(
  EncryptionKeyType.SENSITIVE,
);
