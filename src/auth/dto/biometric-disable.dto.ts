// src/auth/dto/biometric-disable.dto.ts
import { IsString, IsNotEmpty, IsIn } from 'class-validator';
export class BiometricDisableDto {
  @IsString()
  @IsNotEmpty({ message: 'Device ID is required.' })
  deviceId: string; // Unique identifier for the device
}
