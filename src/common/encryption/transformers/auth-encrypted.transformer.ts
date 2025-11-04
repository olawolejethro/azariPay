// src/common/transformers/auth-encrypted.transformer.ts
import { ValueTransformer } from 'typeorm';
import { EncryptionService, EncryptionKeyType } from '../encryption.service';

export class AuthEncryptedTransformer implements ValueTransformer {
  constructor(private encryptionService: EncryptionService) {}

  to(value: string): string {
    if (!value) return value;
    return this.encryptionService.encrypt(value, EncryptionKeyType.AUTH);
  }

  from(value: string): string {
    if (!value) return value;
    return this.encryptionService.decrypt(value);
  }
}
