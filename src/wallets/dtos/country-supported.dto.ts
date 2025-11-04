// src/wallet/dto/supported-country.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class TransferMethodDto {
  @ApiProperty()
  type: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  supportedCurrencies: string[];

  @ApiProperty()
  minimumAmount: number;

  @ApiProperty()
  maximumAmount: number;

  @ApiProperty()
  processingTime: string;

  @ApiProperty({ type: [String] })
  requirements: string[];
}

export class SupportedCountryResponseDto {
  @ApiProperty()
  countryCode: string;

  @ApiProperty()
  countryName: string;

  @ApiProperty({ type: [String] })
  currencies: string[];

  @ApiProperty({ type: [String] })
  supportedFeatures: string[];

  @ApiProperty({ type: [TransferMethodDto] })
  transferMethods: TransferMethodDto[];

  @ApiProperty({ type: Object })
  requirements: Record<string, any>;
}
