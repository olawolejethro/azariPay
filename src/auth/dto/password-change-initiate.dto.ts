// src/auth/dto/password-change-initiate.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class PasswordChangeInitiateDto {
  @ApiProperty({
    description: 'Current password of the user',
    example: 'CurrentPassword123!',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  currentPassword: string;
}
