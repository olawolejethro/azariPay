// src/webhooks/services/paga-payment-webhook.service.ts

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  NGNWalletEntity,
  NGNWalletStatus,
} from '../../wallets/entities/NGNwallet.entity';
import { TransactionService } from '../../wallets/services/transaction.service';
import { PaymentNotificationDto } from '../dto/paga-payment.dto';
import {
  TransactionStatus,
  TransactionType,
} from '../../wallets/entities/transaction.entity';

@Injectable()
export class PagaPaymentWebhookService {
  private readonly logger = new Logger(PagaPaymentWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepo: Repository<NGNWalletEntity>,
    private readonly transactionService: TransactionService,
  ) {}

  async verifyHash(payload: any, receivedHash: string): Promise<boolean> {
    try {
      const hashKey = this.configService.get<string>('PAGA_HASH_KEY');

      // console.log('hashKey', hashKey);
      // console.log('payload', payload);
      // console.log('receivedHash', receivedHash);
      // Build hash string as per Paga's specification
      const hashString = [
        payload.statusCode,
        payload.accountNumber,
        payload.amount,
        payload.clearingFeeAmount,
        hashKey,
      ].join('');

      const calculatedHash = crypto
        .createHash('sha512')
        .update(hashString)
        .digest('hex');

      return calculatedHash === receivedHash;
    } catch (error) {
      this.logger.error('Hash verification failed', error);
      return false;
    }
  }

  async processPayment(payload: any): Promise<void> {
    // try {
    //   // Verify status code indicates success
    //   if (payload.statusCode !== '0') {
    //     this.logger.warn('Non-success status code in payment notification', {
    //       statusCode: payload.statusCode,
    //       statusMessage: payload.statusMessage,
    //       reference: payload.transactionReference,
    //     });
    //     return;
    //   }
    //   // Check if this transaction has already been processed (to avoid duplicates)
    //   const existingTransaction = await this.transactionService.findByReference(
    //     payload.transactionReference,
    //   );
    //   if (existingTransaction) {
    //     const error = new ConflictException(
    //       `Duplicate transaction detected: Transaction with reference ${payload.transactionReference} has already been processed`,
    //     );
    //     this.logger.warn('Duplicate transaction notification received', {
    //       reference: payload.transactionReference,
    //       existingStatus: existingTransaction.status,
    //       timestamp: new Date().toISOString(),
    //     });
    //     throw error; // This will immediately stop execution and prevent duplicate processing
    //   }
    //   // Find the wallet
    //   const wallet = await this.ngnWalletRepo.findOne({
    //     where: { accountNumber: payload.accountNumber },
    //   });
    //   if (!wallet) {
    //     throw new Error(
    //       `Wallet not found for account: ${payload.accountNumber}`,
    //     );
    //   }
    //   // Parse amounts
    //   const payloadAmount = String(payload.amount);
    //   const amount = parseFloat(payloadAmount.replace(/,/g, ''));
    //   const fee = parseFloat(payload.clearingFeeAmount);
    //   // Update wallet balance
    //   await this.incrementBalance(wallet.id, amount);
    //   await this.transactionService.createTransactionCAD({
    //     // NgnWalletId: wallet.id,
    //     userId: wallet.userId,
    //     // type: 'CREDIT',
    //     amount,
    //     fee: payload.clearingFeeAmount,
    //     reference: payload.transactionReference,
    //     // status: 'COMPLETED',
    //     description: 'Account Deposit',
    //     metadata: {
    //       fundingPaymentReference: payload.fundingPaymentReference,
    //       accountName: payload.accountName,
    //       transferBankName: payload.transferBankName,
    //       transferBankAccountNumber: payload.transferBankAccountNumber,
    //       payerDetails: payload.payerDetails,
    //       rawPayload: payload,
    //     },
    //   });
    //   this.logger.log('Successfully processed payment notification', {
    //     reference: payload.transactionReference,
    //     amount,
    //     accountNumber: payload.accountNumber,
    //   });
    // } catch (error) {
    //   this.logger.error('Error processing payment notification', {
    //     error,
    //     transactionReference: payload.transactionReference,
    //   });
    //   throw error;
    // }
  }

  /**
   * Find a wallet by account number
   */
  async findWalletByAccountNumber(
    accountNumber: string,
  ): Promise<NGNWalletEntity> {
    const wallet = await this.ngnWalletRepo.findOne({
      where: { accountNumber },
      relations: ['user'],
    });

    if (!wallet) {
      this.logger.warn(`No wallet found for account number: ${accountNumber}`);
      throw new NotFoundException(
        `Wallet with account number ${accountNumber} not found`,
      );
    }

    return wallet;
  }

  /**
   * Increment wallet balance and record the transaction
   */
  async incrementBalance(walletId: number, amount: number): Promise<void> {
    // First check if wallet exists
    const wallet = await this.ngnWalletRepo.findOne({
      where: { id: walletId },
    });
    console.log('wallet', wallet);

    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${walletId} not found`);
    }

    // Log the incoming amount for debugging
    this.logger.debug(`Incrementing wallet balance`, {
      walletId,
      rawAmount: amount,
    });

    // Fix: Ensure both values are properly parsed as numbers
    const currentBalance = parseFloat(wallet.balance.toString());
    const amountToAdd = parseFloat(amount.toString());
    // Validate that both values are actual numbers
    if (isNaN(currentBalance) || isNaN(amountToAdd)) {
      throw new Error(
        `Invalid calculation values: balance=${wallet.balance}, amount=${amount}`,
      );
    }

    // Calculate new balance
    const newBalance = currentBalance + amountToAdd;

    // Update wallet balance
    wallet.balance = newBalance;
    await this.ngnWalletRepo.save(wallet);

    this.logger.log(`Wallet balance updated successfully`, {
      walletId,
      amountAdded: amount,
      newBalance: wallet.balance,
    });
  }
  /**
   * Get all wallets with their balances
   * Useful for reconciliation
   */
  async getAllWalletsWithBalances(): Promise<NGNWalletEntity[]> {
    return this.ngnWalletRepo.find({
      select: ['id', 'userId', 'accountNumber', 'balance', 'status'],
      where: { status: NGNWalletStatus.ACTIVE },
    });
  }
}
