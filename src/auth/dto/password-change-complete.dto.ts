// src/auth/dto/password-change-complete.dto.ts
import { IsString, MinLength, Matches } from 'class-validator';

export class PasswordChangeCompleteDto {
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long.' })
  @Matches(/(?=.*[a-z])/, {
    message: 'New password must contain at least one lowercase letter.',
  })
  @Matches(/(?=.*[A-Z])/, {
    message: 'New password must contain at least one uppercase letter.',
  })
  @Matches(/(?=.*\d)/, {
    message: 'New password must contain at least one number.',
  })
  @Matches(/(?=.*[@$!%*?&#])/, {
    message:
      'New password must contain at least one special character (@, $, !, %, *, ?, &,#).',
  })
  newPassword: string;
}
