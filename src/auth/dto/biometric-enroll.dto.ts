// src/auth/dto/biometric-enroll.dto.ts
import { IsIn, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DeviceMetadataDto {
  @IsString()
  os: string;

  @IsString()
  osVersion: string;

  @IsString()
  deviceManufacturer: string;
}

export class BiometricEnrollDto {
  @IsString()
  deviceId: string;

  @ValidateNested()
  @Type(() => DeviceMetadataDto)
  deviceMetadata: DeviceMetadataDto;
}
