// dto/aptpay-webhook.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsObject, IsNumber } from 'class-validator';

export class AptPayWebhookDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString() 
  @IsNotEmpty()
  balance: string;

  @IsString()
  @IsNotEmpty()
  entity: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  errorCode?: string;

  @IsString()
  @IsOptional()
  description?: string;
}