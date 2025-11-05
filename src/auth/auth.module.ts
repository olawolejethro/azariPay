// src/auth/auth.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { MiddlewareConsumer } from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { CommonModule } from '../common/common.module'; // Import CommonModule
import { FileStoreModule } from 'src/filestore/filestore.module';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { OnboardingTrackingService } from './services/onboardingTrackingService';
import { WalletModule } from 'src/wallets/wallet.module';
import { WalletFactory } from 'src/wallets/factories/wallet.factory';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { CADWalletEntity } from 'src/wallets/entities/CADwallet.entity';
import { NairaWallet } from 'src/wallets/implementations/naira-wallet';
import { TransactionEntity } from 'src/wallets/entities/transaction.entity';
import { BeneficiaryEntity } from 'src/wallets/entities/beneficiary.entity';
import { Notification } from 'src/notifications/entities/notification.entity';
import { FirebaseService } from 'src/firebase/firebase.service';
import { NotificationService } from 'src/notifications/notifications.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { GeolocationService } from 'src/common/geolocation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      NGNWalletEntity,
      CADWalletEntity,
      TransactionEntity,
      BeneficiaryEntity,
      Notification,
      RefreshToken,
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn:
            configService.get<string | number>('JWT_EXPIRATION') || '1h',
        },
      }),
      inject: [ConfigService],
    }),
    FileStoreModule,
    CommonModule,
    forwardRef(() => FirebaseModule),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    OnboardingTrackingService,
    WalletFactory,
    NairaWallet,
    FirebaseService,
    NotificationService,
    GeolocationService,
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    OnboardingTrackingService,
    GeolocationService,
    JwtModule, // Add this line
  ],
})
export class AuthModule {}
