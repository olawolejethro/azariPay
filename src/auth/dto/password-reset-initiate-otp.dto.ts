// src/auth/dto/password-reset-initiate-otp.dto.ts
import { IsPhoneNumber } from 'class-validator';

export class PasswordResetInitiateOtpDto {
  @IsPhoneNumber(null, { message: 'Invalid phone number format.' })
  phoneNumber: string;
}
