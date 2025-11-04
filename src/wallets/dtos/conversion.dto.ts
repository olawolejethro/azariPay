import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';
import { TransactionStatus } from './transaction.dto';

// src/wallet/dto/conversion.dto.ts
export class ConversionRequestDto {
  @ApiProperty({
    description: 'Source wallet ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  sourceWalletId: string;

  @ApiProperty({
    description: 'Destination wallet ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsNotEmpty()
  destinationWalletId: string;

  @ApiProperty({
    description: 'Amount to convert',
    example: 100.5,
  })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({
    description: 'User PIN for transaction verification',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  pin: string;
}
export class ConversionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sourceWalletId: string;

  @ApiProperty()
  destinationWalletId: string;

  @ApiProperty()
  sourceAmount: number;

  @ApiProperty()
  sourceCurrency: string;

  @ApiProperty()
  destinationAmount: number;

  @ApiProperty()
  destinationCurrency: string;

  @ApiProperty()
  exchangeRate: number;

  @ApiProperty()
  fees: number;

  @ApiProperty({
    enum: TransactionStatus,
  })
  status: TransactionStatus;

  @ApiProperty()
  createdAt: Date;
}
