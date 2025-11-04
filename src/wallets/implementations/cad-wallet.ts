// src/wallets/implementations/cad-wallet.ts

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { WalletCurrency } from '../interfaces/wallet.interface'; // Adjust the import path as necessary
import { BaseWallet } from '../abstract/base-wallet'; // Adjust the import path as necessary

@Injectable()
export class CADWallet extends BaseWallet {
  initializeWallet(data: { id: number; userId: number }) {
    this.initialize({
      id: data.id,
      userId: data.userId,
      currency: WalletCurrency.CAD,
    });
    return this;
  }
}
