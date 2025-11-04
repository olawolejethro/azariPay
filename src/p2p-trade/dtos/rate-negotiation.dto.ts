// src/p2p-trade/dtos/rate-negotiation.dto.ts
import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateTradeRateDto {
  @ApiProperty({
    description: 'New negotiated exchange rate',
    example: 1250.5,
    minimum: 0.0001,
    maximum: 999999.9999,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Type(() => Number)
  newRate: number;

  @ApiProperty({
    description: 'Reason for rate change',
    example: 'Agreed on better rate after market discussion',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RateUpdateResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Updated trade information' })
  tradeInfo: {
    id: number;
    originalRate: number;
    negotiatedRate: number;
    effectiveRate: number;
    rateNegotiatedAt: Date;
    rateNegotiatedBy: number;
    reason?: string;
  };

  @ApiProperty({ description: 'Rate change analysis' })
  rateAnalysis: {
    originalRate: number;
    newRate: number;
    changeAmount: number;
    changePercentage: number;
    direction: 'increase' | 'decrease';
    withinLimits: boolean;
    // riskLevel: 'low' | 'medium' | 'high';
  };

  @ApiProperty({ description: 'Impact on trade amounts' })
  amountImpact: {
    currency: string;
    originalAmount: number;
    newCalculatedAmount: number;
    amountDifference: number;
    convertedCurrency: string;
    originalConvertedAmount: number;
    newConvertedAmount: number;
    convertedDifference: number;
  };
}

export class TradeRateHistoryDto {
  @ApiProperty({ description: 'Trade ID' })
  tradeId: number;

  @ApiProperty({ description: 'Original rate from seller order' })
  originalOrderRate: number;

  @ApiProperty({ description: 'Current effective rate being used' })
  effectiveRate: number;

  @ApiProperty({ description: 'Whether rate has been negotiated' })
  hasNegotiatedRate: boolean;

  @ApiProperty({ description: 'Rate negotiation details', required: false })
  negotiationDetails?: {
    negotiatedRate: number;
    changePercentage: number;
    changeAmount: number;
    negotiatedAt: Date;
    negotiatedBy: number;
    negotiatorName: string;
    reason?: string;
  };

  @ApiProperty({ description: 'Related seller order information' })
  sellerOrderInfo: {
    id: number;
    originalExchangeRate: number;
    sellCurrency: string;
    buyCurrency: string;
    isRateChanged: boolean;
  };

  @ApiProperty({ description: 'Rate validation and risk assessment' })
  validation: {
    changeWithinLimits: boolean;
    maxAllowedDeviation: number;
    currentDeviation?: number;
    riskLevel: 'low' | 'medium' | 'high';
    canStillModify: boolean;
    modificationBlockedReason?: string;
  };
}

export class RateImpactCalculationDto {
  @ApiProperty({ description: 'Trade ID' })
  tradeId: number;

  @ApiProperty({ description: 'Current rate information' })
  rateInfo: {
    originalRate: number;
    effectiveRate: number;
    isNegotiated: boolean;
    changePercentage?: number;
  };

  @ApiProperty({ description: 'Amount calculations with current rate' })
  amountCalculations: {
    effectiveRate: number;
    baseAmount: number;
    quoteAmount: number;
    baseCurrency: string;
    quoteCurrency: string;
  };

  @ApiProperty({ description: 'Comparison with original order amounts' })
  comparison: {
    originalOrderAmount: number;
    currentTradeAmount: number;
    difference: number;
    differencePercentage: number;
    currency: string;
    favorsBuyer: boolean;
    favorsSeller: boolean;
  };

  @ApiProperty({ description: 'Escrow implications' })
  escrowImpact: {
    canUpdateRate: boolean;
    escrowLocked: boolean;
    currentLockAmount?: number;
    newLockAmount?: number;
    lockAmountDifference?: number;
    lockCurrency?: string;
    reason?: string;
  };
}
