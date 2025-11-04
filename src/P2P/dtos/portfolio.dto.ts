// src/P2P/dto/create-portfolio.dto.ts
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
}

export class CreatePortfolioDto {
  @ApiProperty({
    description: 'Currency type',
    enum: CurrencyEnum,
    example: 'NGN',
  })
  @IsNotEmpty()
  @IsEnum(CurrencyEnum)
  currency: CurrencyEnum;

  @ApiProperty({
    description: 'Available amount of the currency',
    example: 200000,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  availableAmount: number;

  @ApiProperty({
    description: 'Exchange rate for the currency',
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

  @ApiProperty({
    description: 'Bank name (optional for CAD currency)',
    required: false,
    example: 'Bank of Montreal',
  })
  @IsOptional()
  @IsString()
  bankName?: string;

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
}
