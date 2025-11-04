// dto/pin.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Length,
  Matches,
  IsPhoneNumber,
  IsNumber,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';

export class SetPinDto {
  @ApiProperty({
    description: 'Four-digit PIN for wallet security',
    example: '1234',
  })
  @IsString()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must contain only numbers' })
  pin: string;
}

export class ChangePinInitiateDto {
  @ApiProperty({
    description: 'Phone number for OTP verification',
    example: '+1-888-999-4444',
  })
  @IsPhoneNumber()
  phoneNumber: string;
}

export class ChangePinCompleteDto {
  @ApiProperty({
    description: 'OTP received via SMS',
    example: 123456,
  })
  @IsNumber()
  @Min(100000)
  @Max(999999)
  otp: number;

  @ApiProperty({
    description: 'New four-digit PIN',
    example: '5678',
  })
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'PIN must contain only numbers' })
  newPin: string;
}

// reset-pin-initiate.dto.ts

export class ResetPinInitiateDto {
  @ApiProperty({
    description: 'Current transaction PIN',
    example: '1234',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  currentPin: string;
}

// verify-otp.dto.ts

export class VerifyOtpDto {
  @ApiProperty({
    description: 'OTP code received via SMS',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}

// reset-pin-complete.dto.ts

export class ResetPinCompleteDto {
  @ApiProperty({
    description: 'New 4-digit PIN',
    example: '5678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  newPin: string;

  @ApiProperty({
    description: 'Confirm new 4-digit PIN',
    example: '5678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  confirmPin: string;

  @ApiProperty({
    description: 'Reset token from OTP verification',
    example: 'reset_token_abc123',
  })
  @IsString()
  @IsNotEmpty()
  resetToken: string;
}
