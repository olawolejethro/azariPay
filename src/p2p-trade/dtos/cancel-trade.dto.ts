// src/P2P/dtos/cancel-trade.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, MaxLength } from 'class-validator';

export class CancelTradeDto {
  @ApiProperty({
    description: 'Reason for cancellation',
    example: 'I am no longer interested in the transaction',
  })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    description: 'Confirmation that no payment was made to the seller',
    example: true,
  })
  @IsBoolean()
  noPaymentMade: boolean;
}
