// src/wallet/dto/error.dto.ts
export class ErrorResponseDto {
  statusCode: number;
  message: string;
  error: string;
  details?: Record<string, any>;
  timestamp: Date;
  path: string;
}
