// src/auth/dto/password-change-verify-otp.dto.ts
import { IsInt } from 'class-validator';

export class PasswordChangeVerifyOtpDto {
  @IsInt({ message: 'OTP must be an integer.' })
  otp: number;
}
