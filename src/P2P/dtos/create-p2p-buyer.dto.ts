// src/P2P/dto/create-p2p-buyer.dto.ts
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum CurrencyEnum {
  CAD = 'CAD',
  NGN = 'NGN',
  USD = 'USD',
}

export class CreateP2PBuyerDto {
  @ApiProperty({
    description: 'Currency to buy',
    enum: CurrencyEnum,
    example: 'CAD',
  })
  @IsNotEmpty()
  @IsEnum(CurrencyEnum)
  buyCurrency: CurrencyEnum;

  @ApiProperty({
    description: 'Currency to sell',
    enum: CurrencyEnum,
    example: 'NGN',
  })
  @IsNotEmpty()
  @IsEnum(CurrencyEnum)
  sellCurrency: CurrencyEnum;

  @ApiProperty({
    description: 'Available amount to exchange',
    example: 200000,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  availableAmount: number;

  @ApiProperty({
    description: 'Exchange rate for the currency pair',
    example: 1200,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  exchangeRate: number;

  @ApiProperty({
    description: 'Minimum transaction limit',
    example: 12000,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  minTransactionLimit: number;

  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({
    description: 'Transaction duration in minutes',
    example: 10,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  transactionDuration: number;
}
