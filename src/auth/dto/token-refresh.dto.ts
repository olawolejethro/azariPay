// src/auth/dto/token-refresh.dto.ts
import { IsString } from 'class-validator';

export class TokenRefreshDto {
  @IsString({ message: 'Refresh token must be a string.' })
  refreshToken: string;
}
