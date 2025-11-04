// src/wallets/interfaces/wallet.interface.ts

import { WalletEntity } from '../entities/wallet.entity';

export enum WalletCurrency {
  NGN = 'NGN',
  CAD = 'CAD',
}

export enum WalletStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  FROZEN = 'frozen',
  SUSPENDED = 'suspended',
}

export interface TransferRequest {
  amount: number;
  destinationBankUUID: string;
  destinationBankAccountNumber: string;
  remarks?: string;
  currency?: string;
}

export interface ValidateMoneyTransferResponse {
  referenceNumber: string;
  responseCode: string;
  message: string;
  accountNumber: string;
  accountHolderName: string;
  fees: number;
  totalAmount: number;
  currency: string;
  exchangeRate?: number;
  destinationCurrency?: string;
  status: boolean;
  bankId?: string;
  bankName?: string;
  transactionId?: string;
}

export interface ValidateMoneyTransferRequest {
  referenceNumber: string;
  amount: number;
  currency: string;
  destinationAccount: string;
}
export interface TransferResponse {
  referenceNumber: string;
  responseCode: string | number;
  message: string;
  transactionId?: string;
  status: string;
  recipientName?: string;
  amount?: number | string;
  fee?: number;
  currency?: string;
  destinationAccountHolderNameAtBank?: string;
  remark?: string; // Added remark field
  sessionId?: string;
  vat?: number;
  destinationBankAccount: number | string;
}
export interface WalletBalance {
  amount: number;
  currency: WalletCurrency;
  formatted: string;
  lastUpdated: Date;
}

export interface CreateWalletDto {
  userId: string;
  currency: WalletCurrency;
  type?: string;
  metadata?: Record<string, any>;
}

export interface IWallet {
  id: number;
  userId: number;
  accountNumber: string;
  balance: number;
  currency: WalletCurrency;
  status: WalletStatus;
  isVerified: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
  CONVERSION = 'CONVERSION',
  TRADE = 'TRADE',
  P2P_SEND = 'P2P_SEND',
  P2P_RECEIVE = 'P2P_RECEIVE',
  REFUND = 'REFUND',
  REQUEST_PAYMENT = 'request_payment',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
  CANCELLED = 'CANCELLED',
}

export interface RecordTransactionParams {
  wallet: WalletEntity;
  amount: number;
  fee: number;
  type: TransactionType;
  status?: TransactionStatus;
  reference: string;
  description?: string;
  metadata?: {
    payerDetails?: {
      accountNumber?: string;
      payerName?: string;
      paymentMethod?: string;
      referenceNumber?: string;
    };
    fundingReference?: string;
    originalPayload?: any;
  };
}
export interface PaymentRequest {
  id: string;
  fromUserId: string;
  toWalletId: string;
  amount: number;
  currency: WalletCurrency;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  expiresAt: Date;
  note?: string;
  metadata?: Record<string, any>;
}

export interface TransactionFee {
  type: string;
  amount: number;
  currency: WalletCurrency;
  description?: string;
  isPercentage?: boolean;
}
