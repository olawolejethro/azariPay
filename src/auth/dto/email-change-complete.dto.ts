import { IsEmail, IsNotEmpty } from 'class-validator';

// email-change-complete.dto.ts
export class EmailChangeCompleteDto {
  @IsEmail()
  @IsNotEmpty()
  newEmail: string;

  @IsEmail()
  @IsNotEmpty()
  confirmNewEmail: string;
}
