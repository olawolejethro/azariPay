// src/auth/dto/signup-verify-otp.dto.ts
import {
  IsPhoneNumber,
  IsInt,
  Min,
  Max,
  IsString,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DeviceMetadataDto {
  @IsString()
  os: string;

  @IsString()
  osVersion: string;

  @IsString()
  deviceManufacturer: string;
}

export class SignupVerifyOtpDto {
  @IsPhoneNumber(null, { message: 'Invalid phone number format.' })
  phoneNumber: string;

  @IsInt({ message: 'OTP must be an integer.' })
  @Min(100000)
  @Max(999999)
  otp: number;

  @IsString()
  deviceId: string;

  @ValidateNested()
  @Type(() => DeviceMetadataDto)
  deviceMetadata: DeviceMetadataDto;
}
