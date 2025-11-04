// src/auth/dto/signup-password.dto.ts
import { IsString, MinLength, Matches } from 'class-validator';

export class SignupPasswordDto {
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
      'New password must contain at least one special character (@, $, !, %, *, ?, &,#).',
  })
  password: string;
}
