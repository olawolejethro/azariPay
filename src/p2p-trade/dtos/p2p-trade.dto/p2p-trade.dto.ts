// src/P2P/dtos/p2p-trade.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsEnum,
  IsUUID,
  IsOptional,
  Min,
  MaxLength,
  IsPositive,
} from 'class-validator';
import { TradeStatus } from '../../../p2p-chat/entities/p2p-chat.entity/p2p-chat.entity';

export class CreateTradeDto {
  @ApiProperty({ description: 'Seller ID', example: 123 })
  @IsNumber()
  @IsOptional()
  sellerId: number;

  @ApiProperty({ description: 'Buyer ID', example: 123 })
  @IsNumber()
  @IsOptional()
  buyerId: number;

  @ApiProperty({ description: 'Seller Order ID', example: 123 })
  @IsNumber()
  @IsOptional()
  sellOrderId: number;

  @ApiProperty({ description: 'Buyer Order ID', example: 123 })
  @IsNumber()
  @IsOptional()
  buyOrderId: number;

  @ApiProperty({ description: 'Trade amount', example: 100000 })
  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'CAD' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency: string;

  @ApiProperty({ description: 'Converted amount', example: 92000.25 })
  @IsNumber()
  // @IsPositive()
  @IsNotEmpty()
  convertedAmount: number;

  @ApiProperty({ description: 'Converted currency code', example: 'NGN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  convertedCurrency: string;

  @ApiProperty({ description: 'Exchange rate', example: 0.92 })
  @IsNumber()
  // @IsPositive()
  @IsNotEmpty()
  rate: number;

  @ApiProperty({ description: 'Payment method', example: 'Bank Transfer' })
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @ApiProperty({
    description: 'Payment time limit in minutes',
    example: 1440,
    required: false,
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  paymentTimeLimit?: number;
}

export class UpdateTradeStatusDto {
  @ApiProperty({ enum: TradeStatus, description: 'Trade status' })
  @IsEnum(TradeStatus)
  @IsNotEmpty()
  status: TradeStatus;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class TradeFilterDto {
  @ApiProperty({
    enum: TradeStatus,
    description: 'Filter by status',
    required: false,
  })
  @IsEnum(TradeStatus)
  @IsOptional()
  status?: TradeStatus;

  @ApiProperty({ description: 'Start date (ISO format)', required: false })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ description: 'End date (ISO format)', required: false })
  @IsString()
  @IsOptional()
  endDate?: string;
}
