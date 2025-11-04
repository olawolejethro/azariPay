// src/auth/dto/password-reset-complete.dto.ts
import {
  IsPhoneNumber,
  IsInt,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class PasswordResetCompleteDto {
  @IsPhoneNumber(null, { message: 'Invalid phone number format.' })
  phoneNumber: string;

  @IsInt({ message: 'OTP must be an integer.' })
  otp: number;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @Matches(/(?=.*[a-z])/, {
    message: 'Password must contain at least one lowercase letter.',
  })
  @Matches(/(?=.*[A-Z])/, {
    message: 'Password must contain at least one uppercase letter.',
  })
  @Matches(/(?=.*\d)/, {
    message: 'Password must contain at least one number.',
  })
  @Matches(/(?=.*[@$!%*?&#])/, {
    message:
      'Password must contain at least one special character (@, $, !, %, *, ?, &,#).',
  })
  newPassword: string;
}
