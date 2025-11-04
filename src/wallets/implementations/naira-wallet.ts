import { BaseWallet } from '../abstract/base-wallet';
import { TransactionService } from '../services/transaction.service';
import { WalletCurrency } from '../interfaces/wallet.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class NairaWallet extends BaseWallet {
  initializeWallet(data: { id: number; userId: number }) {
    this.initialize({
      id: data.id,
      userId: data.userId,
      currency: WalletCurrency.NGN,
    });
    return this;
  }
}
