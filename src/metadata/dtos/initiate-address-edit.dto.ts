// initiate-address-edit.dto.ts
import { IsOptional, IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateAddressEditDto {
  @ApiProperty({
    description: 'Street address',
    example: '123 Main Street',
    required: false,
  })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiProperty({
    description: 'Suite/Apartment/Unit/Building number',
    example: 'Apt 4B',
    required: false,
  })
  @IsOptional()
  @IsString()
  apartmentNumber?: string;

  @ApiProperty({
    description: 'City',
    example: 'Lagos',
    required: false,
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    description: 'State or Province',
    example: 'Lagos State',
    required: false,
  })
  @IsOptional()
  @IsString()
  stateProvince?: string;

  @Matches(/^[A-Za-z]\d[A-Za-z]\s\d[A-Za-z]\d$/, {
    message: 'ZIP Code must be in Canadian postal code format (e.g., M2A 1A1).',
  })
  zipCode: string;
}

// verify-address-otp.dto.ts

export class VerifyAddressOtpDto {
  @ApiProperty({
    description: 'OTP code received via SMS',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}

// complete-address-edit.dto.ts

export class CompleteAddressEditDto {
  @ApiProperty({
    description: 'Street address',
    example: '456 New Street',
    required: false,
  })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiProperty({
    description: 'Suite/Apartment/Unit/Building number',
    example: 'Unit 2A',
    required: false,
  })
  @IsOptional()
  @IsString()
  apartmentNumber?: string;

  @ApiProperty({
    description: 'City',
    example: 'Abuja',
    required: false,
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    description: 'State or Province',
    example: 'FCT',
    required: false,
  })
  @IsOptional()
  @IsString()
  stateProvince?: string;

  @Matches(/^[A-Za-z]\d[A-Za-z]\s\d[A-Za-z]\d$/, {
    message: 'ZIP Code must be in Canadian postal code format (e.g., M2A 1A1).',
  })
  zipCode: string;

  @ApiProperty({
    description: 'Edit token from OTP verification',
    example: 'edit_token_abc123',
  })
  @IsString()
  @IsNotEmpty()
  editToken: string;
}
