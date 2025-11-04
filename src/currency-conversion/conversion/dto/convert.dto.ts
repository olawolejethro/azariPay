// src/currency-conversion/dto/currency-conversion.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Base DTO for currency conversion requests
 */
export class ConvertCurrencyDto {
  @ApiProperty({
    description: 'Three-letter currency code to convert from',
    example: 'USD',
  })
  @IsString()
  @IsNotEmpty()
  readonly from: string;

  @ApiProperty({
    description: 'Three-letter currency code to convert to',
    example: 'EUR',
  })
  @IsString()
  @IsNotEmpty()
  readonly to: string;

  @ApiProperty({
    description: 'Amount to convert',
    example: 100,
  })
  @IsNumber()
  @IsPositive()
  readonly amount: number;

  @ApiPropertyOptional({
    description: 'Date for historical conversion (YYYY-MM-DD)',
    example: '2023-01-15',
  })
  @IsOptional()
  @IsDateString()
  readonly date?: string;

  @ApiPropertyOptional({
    description: 'Track this conversion in user history',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly trackHistory?: boolean;
}

/**
 * Response DTO for currency conversion
 */
export class ConversionResultDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Query parameters',
    example: {
      from: 'USD',
      to: 'EUR',
      amount: 100,
    },
  })
  query: {
    from: string;
    to: string;
    amount: number;
    date?: string;
  };

  @ApiProperty({
    description: 'Exchange rate info',
    example: {
      rate: 0.85,
      timestamp: 1615432045,
    },
  })
  info: {
    rate: number;
    timestamp: number;
  };

  @ApiProperty({
    description: 'Conversion date',
    example: '2023-01-15',
  })
  date: string;

  @ApiProperty({
    description: 'Converted result',
    example: 85,
  })
  result: number;
}

/**
 * DTO for mobile currency conversion requests
 */
export class MobileConvertDto {
  @ApiProperty({
    description: 'Currency code to convert from',
    example: 'USD',
  })
  @IsString()
  @IsNotEmpty()
  readonly fromCurrency: string;

  @ApiProperty({
    description: 'Currency code to convert to',
    example: 'EUR',
  })
  @IsString()
  @IsNotEmpty()
  readonly toCurrency: string;

  @ApiProperty({
    description: 'Amount to convert',
    example: 100,
  })
  @IsNumber()
  @IsPositive()
  readonly amount: number;

  @ApiPropertyOptional({
    description: 'User ID for tracking conversions',
    example: 12345,
  })
  @IsOptional()
  @IsNumber()
  readonly userId?: number;
}

/**
 * Response DTO for mobile currency conversion
 */
export class MobileConversionResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'From currency',
    example: 'USD',
  })
  fromCurrency: string;

  @ApiProperty({
    description: 'To currency',
    example: 'EUR',
  })
  toCurrency: string;

  @ApiProperty({
    description: 'Amount to convert',
    example: 100,
  })
  amount: number;

  @ApiProperty({
    description: 'Converted amount',
    example: 85.23,
  })
  convertedAmount: number;

  @ApiProperty({
    description: 'Exchange rate',
    example: 0.8523,
  })
  rate: number;

  @ApiProperty({
    description: 'Unix timestamp of the rate',
    example: 1615432045,
  })
  timestamp: number;

  @ApiProperty({
    description: 'Conversion date',
    example: '2023-01-15',
  })
  date: string;

  @ApiProperty({
    description: 'Unique session ID for this conversion',
    example: 'mobile_conversion_1648721458971_7a8b9c',
  })
  sessionId?: string;

  @ApiProperty({
    description: 'Rate history for chart',
    example: {
      Sun: { rate: 0.85, change: 0 },
      Mon: { rate: 0.852, change: 0.24 },
      Tue: { rate: 0.848, change: -0.47 },
      Wed: { rate: 0.85, change: 0.24 },
      Thu: { rate: 0.851, change: 0.12 },
      Fri: { rate: 0.853, change: 0.24 },
      Sat: { rate: 0.852, change: -0.12 },
    },
  })
  rateHistory?: {
    [day: string]: {
      rate: number;
      change: number;
    };
  };
}

/**
 * DTO for rate limit check
 */
export class RateLimitResponseDto {
  @ApiProperty({
    description: 'Maximum API calls allowed per day',
    example: 1000,
  })
  limit: number;

  @ApiProperty({
    description: 'API calls used today',
    example: 350,
  })
  used: number;

  @ApiProperty({
    description: 'API calls remaining today',
    example: 650,
  })
  remaining: number;

  @ApiProperty({
    description: 'Current usage percentage',
    example: 35,
  })
  usagePercentage: number;
}

/**
 * DTO for currency information
 */
export class CurrencyInfoDto {
  @ApiProperty({
    description: 'Currency code',
    example: 'USD',
  })
  code: string;

  @ApiProperty({
    description: 'Currency name',
    example: 'US Dollar',
  })
  name: string;
}

/**
 * DTO for user conversion history item
 */
export class ConversionHistoryItemDto {
  @ApiProperty({
    description: 'From currency',
    example: 'USD',
  })
  from: string;

  @ApiProperty({
    description: 'To currency',
    example: 'EUR',
  })
  to: string;

  @ApiProperty({
    description: 'Amount converted',
    example: 100,
  })
  amount: number;

  @ApiProperty({
    description: 'Conversion result',
    example: 85.23,
  })
  result: number;

  @ApiProperty({
    description: 'Exchange rate used',
    example: 0.8523,
  })
  rate: number;

  @ApiProperty({
    description: 'Timestamp of conversion',
    example: 1648721458971,
  })
  timestamp: number;
}
