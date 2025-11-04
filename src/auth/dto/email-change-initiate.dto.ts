// src/auth/dto/email-change-initiate.dto.ts
import { Optional } from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class EmailChangeInitiateDto {
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address.' })
  currentEmail: string;
  @IsOptional()
  @IsPhoneNumber(null, { message: 'Invalid phone number format.' })
  phoneNumber: string;
}
