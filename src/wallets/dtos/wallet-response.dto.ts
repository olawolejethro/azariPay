import { TransactionResponseDto } from './transaction.dto';

// src/wallet/dto/wallet.dto.ts
export class WalletResponseDto {
  id: string;
  userId: string;
  currency: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export class WalletDetailsResponseDto extends WalletResponseDto {
  recentTransactions: TransactionResponseDto[];
}
