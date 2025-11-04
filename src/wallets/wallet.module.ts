// src/wallet/wallet.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';

// Controllers
import { WalletController } from './controllers/wallet.controller';
import { TransactionController } from './controllers/transation.controller';
import { BeneficiaryController } from './controllers/beneficiary.controller';
import { DotBankController } from './controllers/dot.bank.controller';
import { AptPayController } from './controllers/aptpay.controller';
import { CADTransactionController } from './controllers/cadTransaction.comtroller';
import { SumsubController } from './controllers/sumsub.controller';
import { ReportsController } from './controllers/reportTransaction.controller';

// Services
import { TransactionService } from './services/transaction.service';
import { WalletService } from './services/wallet.service';
import { BeneficiaryService } from './services/beneficiary.service';
import { PagaService } from './services/paga.service';
import { DotBankService } from './services/dot.bank.service';
import { AptPayService } from './services/aptPay.service';
import { CADTransactionService } from './services/cad-transaction.service';
import { SumsubService } from './services/sumsub.service';
import { ReportsService } from './services/reportTransaction.service';

// Implementations
import { NairaWallet } from './implementations/naira-wallet';
import { CADWallet } from './implementations/cad-wallet';
import { WalletFactory } from './factories/wallet.factory';

// Entities
import { WalletEntity } from './entities/wallet.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { BeneficiaryEntity } from './entities/beneficiary.entity';
import { ExchangeRateEntity } from './entities/exchange-rate.entity';
import { TransferPreviewEntity } from './entities/transfer-preview.entity';
import { DepositInstructionEntity } from './entities/deposit-instruction.entity';
import { NGNWalletEntity } from './entities/NGNwallet.entity';
import { CADWalletEntity } from './entities/CADwallet.entity';
import { PaymentRequestEntity } from './entities/payment-request.entity';
import { DisbursementEntity } from './entities/disbursement.entity';
import { CADTransactionEntity } from './entities/cad-transaction.entity';
import { IdentityVerificationEntity } from './entities/identity-verification.entity';
import { TransactionReport } from './entities/reportTransaction.entity';

// External entities
import { CountryEntity } from 'src/metadata/entities/country.entity';
import { User } from 'src/auth/entities/user.entity';
import { Notification } from 'src/notifications/entities/notification.entity';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { FileStore } from 'src/filestore/entities/filestore.entity';

// External modules and services
import { AuthModule } from 'src/auth/auth.module';
import { FileStoreModule } from 'src/filestore/filestore.module'; // *** ADD THIS ***
import { FirebaseService } from 'src/firebase/firebase.service';
import { OnboardingTrackingService } from 'src/auth/services/onboardingTrackingService';
import { EmailService } from 'src/common/notifications/email.service';
import { NotificationModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    // Register all entities with TypeORM
    TypeOrmModule.forFeature([
      WalletEntity,
      TransactionEntity,
      BeneficiaryEntity,
      ExchangeRateEntity,
      TransferPreviewEntity,
      DepositInstructionEntity,
      CountryEntity,
      NGNWalletEntity,
      CADWalletEntity,
      User,
      Notification,
      PaymentRequestEntity,
      DisbursementEntity,
      CADTransactionEntity,
      IdentityVerificationEntity,
      TransactionReport,
      P2PSeller,
      FileStore,
    ]),

    // Configure caching
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        ttl: configService.get('CACHE_TTL', 300), // 5 minutes default
        max: configService.get('CACHE_MAX_ITEMS', 100), // maximum number of items in cache
        isGlobal: true,
      }),
      inject: [ConfigService],
    }),

    // External modules
    forwardRef(() => AuthModule), // *** USE forwardRef to avoid circular dependency ***
    NotificationModule, // *** ADD NotificationModule ***
    FileStoreModule, // *** ADD FileStoreModule ***
    HttpModule, // *** ADD HttpModule for HTTP services ***
    ConfigModule,

    // JWT Module for ReportsService
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],

  controllers: [
    WalletController,
    TransactionController,
    BeneficiaryController,
    DotBankController,
    AptPayController,
    CADTransactionController,
    SumsubController,
    ReportsController,
  ],

  providers: [
    // Core wallet services
    TransactionService,
    WalletService,
    WalletFactory,
    NairaWallet,
    CADWallet,

    // External API services
    PagaService,
    DotBankService,
    AptPayService,

    // Transaction services
    BeneficiaryService,
    CADTransactionService,
    SumsubService,
    ReportsService,

    // Utility services
    FirebaseService,
    ConfigService,
    OnboardingTrackingService,
    EmailService,

    // *** REMOVE NotificationService from providers ***
    // NotificationService is provided by NotificationModule

    // *** REMOVE FileStoreService from providers ***
    // FileStoreService is provided by FileStoreModule
  ],

  exports: [
    // Export services that might be used by other modules
    WalletService,
    WalletFactory,
    TransactionService,
    PagaService,
    TypeOrmModule,
    AptPayService,
    ReportsService, // *** ADD ReportsService to exports ***
  ],
})
export class WalletModule {}
