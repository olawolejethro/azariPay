// src/auth/dto/email-change-verify.dto.ts
import { IsInt } from 'class-validator';

export class EmailChangeVerifyDto {
  @IsInt({ message: 'OTP must be an integer.' })
  otp: number;
}
