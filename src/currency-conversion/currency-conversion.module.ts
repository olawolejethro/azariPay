// src/currency-conversion/currency-conversion.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ConversionController } from '../currency-conversion/conversion/conversion.controller';
import { CurrencyConversionService } from '../currency-conversion/conversion/conversion.service';
import { ExchangeRatesApiService } from './exchange-rates-api/services/exchange-rates-api.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { PagaService } from 'src/wallets/services/paga.service';
import { User } from 'src/auth/entities/user.entity';
import { TransactionEntity } from 'src/wallets/entities/transaction.entity';
import { WalletModule } from 'src/wallets/wallet.module';
import { BeneficiaryEntity } from 'src/wallets/entities/beneficiary.entity';
import { AuthService } from 'src/auth/services/auth.service';
import { AuthModule } from 'src/auth/auth.module';
import { FeeManagementService } from 'src/metadata/services/fee-management.service';
import { MetadataModule } from 'src/metadata/metadata.module';
import { FeeConfiguration } from 'src/metadata/entities/fee-config.entity';
import { EmailService } from 'src/common/notifications/email.service';
// import { RedisModule } from '../common/'; // Import your existing Redis module

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    WalletModule,
    AuthModule,
    TypeOrmModule.forFeature([FeeConfiguration]),
    // RedisModule, // Use your existing Redis module instead of creating a new CacheModule
  ],
  controllers: [ConversionController],
  providers: [
    CurrencyConversionService,
    ExchangeRatesApiService,
    PagaService,
    FeeManagementService,
    EmailService,
  ],
  exports: [CurrencyConversionService, ExchangeRatesApiService], // Export the services if needed in other modules
})
export class CurrencyConversionModule {}
