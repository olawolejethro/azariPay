// src/auth/dto/signin.dto.ts
import { IsPhoneNumber, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SigninDto {
  @ApiProperty({
    description: 'User phone number',
    example: '+1-888-999-4444',
  })
  @IsPhoneNumber(null, { message: 'Invalid phone number format.' })
  phoneNumber: string;

  @ApiPropertyOptional({
    description: 'User password (optional if signature provided)',
    example: 'userPassword123',
  })
  @IsOptional()
  @IsString({ message: 'Password must be a string.' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Payload for signature verification (optional)',
    example: 'base64-encoded-payload',
  })
  @IsOptional()
  @IsString({ message: 'Payload must be a string.' })
  payload?: string;

  @ApiPropertyOptional({
    description: 'Digital signature (optional)',
    example: 'base64-encoded-signature',
  })
  @IsOptional()
  @IsString({ message: 'Signature must be a string.' })
  signature?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceName?: string; // "John's iPhone"

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceType?: string; // "iOS", "Android", "Web"

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  userAgent?: string;
}
