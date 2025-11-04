// src/wallets/factories/wallet.factory.ts

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NGNWalletEntity, NGNWalletStatus } from '../entities/NGNwallet.entity';
import { CADWalletEntity, CADWalletStatus } from '../entities/CADwallet.entity';
import {
  IWallet,
  WalletCurrency,
  WalletStatus,
} from '../interfaces/wallet.interface';
import { NairaWallet } from '../implementations/naira-wallet';
import { CADWallet } from '../implementations/cad-wallet';

import { PagaService } from '../services/paga.service';
import {
  generateAccountReference,
  generatePagaReferenceNumber,
} from '../utils/generate.ref';
import { AuthService } from '../../auth/services/auth.service';
import { User } from 'src/auth/entities/user.entity';
import { DotBankService } from '../services/dot.bank.service';
import { AptPayService } from '../services/aptPay.service';
import { EncryptionService } from 'src/common/encryption/encryption.service';

@Injectable()
export class WalletFactory {
  private readonly logger = new Logger(WalletFactory.name);

  constructor(
    @InjectRepository(NGNWalletEntity)
    private readonly ngnWalletRepo: Repository<NGNWalletEntity>,
    @InjectRepository(CADWalletEntity)
    private readonly cadWalletRepo: Repository<CADWalletEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly pagaService: PagaService,
    private readonly aptPaymentService: AptPayService,
    private readonly encryptionService: EncryptionService,
    private readonly ngnWallet: NairaWallet,
    private readonly cadWallet: CADWallet,
    // private readonly authservice: AuthService,
    private readonly dotBankService: DotBankService,
  ) {}

  private async createPersistentAccount(userId: number): Promise<any> {
    try {
      // Get user details for Paga account creation
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new BadRequestException('User not found');
      }
      const referenceNumber = generatePagaReferenceNumber();
      const accountReference = generateAccountReference();
      // Create persistent account with Paga
      const pagaAccount = await this.pagaService.registerAccount({
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: '08100000000',
        accountReference,
        referenceNumber,
        callbackUrl:
          'https://bongopay-api.peachblossoms.ng/paga/webhooks/payment',
      });

      return {
        referenceNumber: pagaAccount.referenceNumber,
        statusCode: '0',
        statusMessage: 'success',
        accountReference: pagaAccount.accountReference,
        accountNumber: pagaAccount.accountNumber,
      };
    } catch (error) {
      console.log(error, 'error');
      this.logger.error(
        'Failed to create persistent account with Paga',
        error.stack,
      );
      throw new BadRequestException(
        'Failed to create persistent account. Please try again later.',
      );
    }
  }
  async createWallet(userId: number): Promise<{
    ngnWallet: {
      id: number;
      userId: number;
      currency: WalletCurrency;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    cadWallet: {
      id: number;
      userId: number;
      currency: WalletCurrency;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
  }> {
    // Check for existing wallets
    const existingNGN = await this.ngnWalletRepo.findOne({
      where: { userId },
    });

    const existingCAD = await this.cadWalletRepo.findOne({
      where: { userId },
    });

    if (existingNGN || existingCAD) {
      throw new BadRequestException('User already has one or more wallets');
    }

    const referenceNumber = generatePagaReferenceNumber();
    const accountReference = generateAccountReference();

    // Get user data with error handling
    let user;
    try {
      user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new BadRequestException('User not found');
      }
    } catch (error) {
      this.logger.error(
        `Failed to find user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('User not found');
    }

    // 🛡️ RESILIENT: DotBank Virtual Account Creation
    let virtualAccountResult = null;
    let accountNumber = null;
    let dotBankStatus = 'FAILED';

    try {
      const virtualAccountData = {
        firstname: user.firstName,
        lastname: user.lastName,
        dateOfBirth: user.dateOfBirth || '1990-01-01',
        gender: user.gender,
        externalId: userId.toString(),
      };

      this.logger.log(
        `Attempting DotBank virtual account creation for user ${userId}`,
      );

      virtualAccountResult = await this.dotBankService.createVirtualAccount(
        virtualAccountData,
        userId,
      );

      if (
        virtualAccountResult &&
        virtualAccountResult.virtualAccount &&
        virtualAccountResult.virtualAccount.accountNo
      ) {
        accountNumber = virtualAccountResult.virtualAccount.accountNo;
        dotBankStatus = 'SUCCESS';
        this.logger.log(
          `✅ DotBank virtual account created successfully for user ${userId}: ${accountNumber}`,
        );
      } else {
        dotBankStatus = 'PARTIAL_SUCCESS';
        this.logger.warn(
          `⚠️ DotBank returned response but no account number for user ${userId}`,
        );
      }
    } catch (error) {
      dotBankStatus = 'FAILED';
      this.logger.error(
        `❌ DotBank virtual account creation failed for user ${userId}: ${error.message}`,
        error.stack,
      );

      // Create fallback data
      virtualAccountResult = {
        virtualAccount: {
          accountNo: null,
          error: error.message,
          failedAt: new Date().toISOString(),
        },
      };
    }

    // 🛡️ RESILIENT: AptPay Identity Creation
    let aptPayStatus = 'FAILED';
    let aptPayError = null;

    try {
      this.logger.log(`Attempting AptPay identity creation for user ${userId}`);

      await this.aptPaymentService.createAptPayIdentity(userId);

      aptPayStatus = 'SUCCESS';
      this.logger.log(
        `✅ AptPay identity created successfully for user ${userId}`,
      );
    } catch (error) {
      aptPayStatus = 'FAILED';
      aptPayError = error.message;
      this.logger.error(
        `❌ AptPay identity creation failed for user ${userId}: ${error.message}`,
        error.stack,
      );
      // Continue without AptPay identity - don't let this block wallet creation
    }

    // REMOVE THE DUPLICATE APTPAY CALL - it was causing the blocking issue

    const intUserId = Number(userId);

    // 🏦 Create NGN Wallet with resilient data
    const ngnWalletEntity = this.ngnWalletRepo.create({
      userId: intUserId,
      balance: 0,
      isVerified: true,
      accountReference,
      accountReferenceHash: this.encryptionService.hash(accountReference),
      referenceNumber,
      status: NGNWalletStatus.ACTIVE,
      accountNumber: accountNumber, // Will be null if DotBank failed
      accountNumberHash: this.encryptionService.hash(accountNumber),
      metadata: {
        accountCreatedAt: new Date().toISOString(),
        walletType: 'INDIVIDUAL',
        thirdPartyServices: {
          dotBank: {
            status: dotBankStatus,
            accountNumber: accountNumber,
            failedAt:
              dotBankStatus === 'FAILED' ? new Date().toISOString() : null,
            error:
              dotBankStatus === 'FAILED'
                ? virtualAccountResult?.virtualAccount?.error
                : null,
          },
          aptPay: {
            status: aptPayStatus,
            failedAt:
              aptPayStatus === 'FAILED' ? new Date().toISOString() : null,
            error: aptPayError,
          },
        },
      },
    });

    // 🏦 Create CAD Wallet
    const cadWalletEntity = this.cadWalletRepo.create({
      userId,
      interacEmail: user.interacEmailAddress, // ✅ Will be double-encrypted and then decrypted correctly
      interacEmailHash: this.encryptionService.hash(user.interacEmailAddress), // ✅ Add hash
      balance: 0,
      isVerified: true,
      status: CADWalletStatus.ACTIVE,
      metadata: {
        accountCreatedAt: new Date().toISOString(),
        thirdPartyServices: {
          aptPay: {
            status: aptPayStatus,
            failedAt:
              aptPayStatus === 'FAILED' ? new Date().toISOString() : null,
            error: aptPayError,
          },
        },
      },
    });

    try {
      // 💾 Save both wallets (this should always succeed even if third-party services failed)
      this.logger.log(`Creating wallets for user ${userId}...`);

      const [savedNGNWallet, savedCADWallet] = await Promise.all([
        this.ngnWalletRepo.save(ngnWalletEntity),
        this.cadWalletRepo.save(cadWalletEntity),
      ]);

      // Initialize wallet implementations
      (this.ngnWallet as any).initialize({
        id: savedNGNWallet.id,
        userId: savedNGNWallet.userId,
        currency: WalletCurrency.NGN,
        referenceNumber: savedNGNWallet.referenceNumber,
        accountNumber: savedNGNWallet.accountNumber,
      });

      (this.cadWallet as any).initialize({
        id: savedCADWallet.id,
        userId: savedCADWallet.userId,
        currency: WalletCurrency.CAD,
      });

      // 📊 Log comprehensive success/failure status
      this.logger.log(`✅ Successfully created wallets for user ${userId}`, {
        ngnWalletId: savedNGNWallet.id,
        cadWalletId: savedCADWallet.id,
        referenceNumber,
        accountNumber,
        thirdPartyStatus: {
          dotBank: dotBankStatus,
          aptPay: aptPayStatus,
        },
      });

      // Note: Third-party service failures are logged in metadata
      // A cron job will handle retries later

      return {
        ngnWallet: this.ngnWallet.walletData,
        cadWallet: this.cadWallet.walletData,
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to save wallets for user ${userId}`,
        error.stack,
      );
      throw new BadRequestException(
        'Failed to create wallets. Please try again later.',
      );
    }
  }
}
