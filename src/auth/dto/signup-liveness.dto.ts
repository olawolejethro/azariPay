// src/auth/dto/signup-liveness.dto.ts
import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class SignupLivenessDto {
  @IsInt({ message: 'livenessFileStoreId must be an integer.' })
  livenessFileStoreId: number;
}
