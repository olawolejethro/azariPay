import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class CancelTradeSimpleDto {
  @ApiProperty({
    description: 'Confirmation that no payment was made to the seller',
    example: true,
  })
  @IsBoolean()
  noPaymentMade: boolean;
}
