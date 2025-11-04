// src/common/transformers/sensitive-encrypted.transformer.ts
import { ValueTransformer } from 'typeorm';
import { EncryptionKeyType, EncryptionService } from '../encryption.service';

export class SensitiveEncryptedTransformer implements ValueTransformer {
  constructor(private encryptionService: EncryptionService) {}

  to(value: string): string {
    if (!value) return value;
    return this.encryptionService.encrypt(value, EncryptionKeyType.SENSITIVE);
  }

  from(value: string): string {
    if (!value) return value;
    return this.encryptionService.decrypt(value);
  }
}
