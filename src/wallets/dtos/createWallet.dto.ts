import { ApiProperty } from '@nestjs/swagger';
import { WalletCurrency } from '../interfaces/wallet.interface';

export class WalletResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({
    enum: WalletCurrency,
    example: WalletCurrency.NGN,
  })
  currency: WalletCurrency;

  @ApiProperty({
    example: 0,
  })
  balance: number;

  @ApiProperty({
    example: true,
  })
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
