// src/common/transformers/encryption-transformer.helper.ts
import { ValueTransformer } from 'typeorm';
import { EncryptionService, EncryptionKeyType } from '../encryption.service';

// Singleton instance
let encryptionServiceInstance: EncryptionService;

export function setEncryptionService(service: EncryptionService) {
  encryptionServiceInstance = service;
}

export function getEncryptedTransformer(
  keyType: EncryptionKeyType,
): ValueTransformer {
  return {
    to: (value: string): string => {
      if (!value || !encryptionServiceInstance) return value;
      return encryptionServiceInstance.encrypt(value, keyType);
    },
    from: (value: string): string => {
      if (!value || !encryptionServiceInstance) return value;
      return encryptionServiceInstance.decrypt(value);
    },
  };
}
