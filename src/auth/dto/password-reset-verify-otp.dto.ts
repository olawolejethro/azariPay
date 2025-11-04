// src/auth/dto/password-reset-verify-otp.dto.ts
import { IsPhoneNumber, IsInt } from 'class-validator';

export class PasswordResetVerifyOtpDto {
  @IsPhoneNumber(null, { message: 'Invalid phone number format.' })
  phoneNumber: string;

  @IsInt({ message: 'OTP must be an integer.' })
  otp: number;
}
