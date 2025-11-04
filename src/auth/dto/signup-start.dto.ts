// src/auth/dto/signup-start.dto.ts
import { Matches } from 'class-validator';

export class SignupStartDto {
  @Matches(/^\+?1-?\d{3}-?\d{3}-?\d{4}$/, {
    message:
      'Only Canadian numbers are accepted. Please enter a valid Canadian number.',
  })
  phoneNumber: string;
}
