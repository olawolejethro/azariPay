// src/wallet/dto/exchange-rate.dto.ts
export class ExchangeRateQueryDto {
  sourceCurrency: string;
  targetCurrency: string;
}

export class ExchangeRateResponseDto {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
  timestamp: Date;
  inverseRate: number;
  provider: string;
}
