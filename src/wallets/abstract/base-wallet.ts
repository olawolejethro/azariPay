// src/wallets/abstract/base-wallet.ts

import { Injectable } from '@nestjs/common';
import {
  IWallet,
  WalletCurrency,
  WalletStatus,
} from '../interfaces/wallet.interface';

@Injectable()
export abstract class BaseWallet implements IWallet {
  public walletData: {
    id: number;
    userId: number;
    currency: WalletCurrency;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };

  constructor() {}
  accountNumber: string;
  balance: number;
  status: WalletStatus;
  isVerified: boolean;
  metadata?: Record<string, any>;

  // Add an initialization method
  protected initialize(data: {
    id: number;
    userId: number;
    currency: WalletCurrency;
  }) {
    this.walletData = {
      id: data.id,
      userId: data.userId,
      currency: data.currency,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // Required properties
  get id(): number {
    return this.walletData.id;
  }
  get userId(): number {
    return this.walletData.userId;
  }
  get currency(): WalletCurrency {
    return this.walletData.currency;
  }
  get isActive(): boolean {
    return this.walletData.isActive;
  }
  get createdAt(): Date {
    return this.walletData.createdAt;
  }
  get updatedAt(): Date {
    return this.walletData.updatedAt;
  }
}
