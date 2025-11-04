// src/P2P/dto/create-p2p-seller.dto.ts
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { P2POrderStatus } from './update-p2p-seller.dto';
import { Transform, Type } from 'class-transformer';

export enum CurrencyEnum {
  CAD = 'CAD',
  NGN = 'NGN',
}

export class CreateP2PSellerDto {
  @ApiProperty({
    description: 'Currency to sell',
    enum: CurrencyEnum,
    example: 'NGN',
  })
  @IsNotEmpty()
  @IsEnum(CurrencyEnum)
  sellCurrency: CurrencyEnum;

  @ApiProperty({
    description: 'Currency to buy',
    enum: CurrencyEnum,
    example: 'CAD',
  })
  @IsNotEmpty()
  @IsEnum(CurrencyEnum)
  buyCurrency: CurrencyEnum;

  @ApiProperty({
    description: 'Available amount to sell',
    example: 200000,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  availableAmount: number;

  @ApiProperty({
    description: 'Account number (optional for CAD currency)',
    required: false,
    example: '1234567890',
  })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiProperty({
    description: 'Account name (optional for CAD currency)',
    required: false,
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({
    description: 'Interac email (optional for NGN currency)',
    required: false,
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsString()
  interacEmail?: string;

  @ApiProperty({
    description: 'Terms of payment',
    example: 'Payment should be processed within 10 minutes of trade',
  })
  @IsNotEmpty()
  @IsString()
  termsOfPayment: string;

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

  @ApiProperty({
    description: 'Transaction duration in minutes',
    example: 10,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  transactionDuration: number;

  @IsOptional()
  @IsEnum(['publish', 'draft'])
  @ApiProperty({
    enum: ['publish', 'draft'],
    default: 'publish',
    description:
      'Action to perform: publish order immediately or save as draft',
    example: 'publish',
  })
  action?: 'publish' | 'draft';
}
