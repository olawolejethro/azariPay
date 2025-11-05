// src/app.module.ts

import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { ThrottlerModule } from '@nestjs/throttler';
// import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
// import { ThrottlerGuard } from '@nestjs/throttler';
import { User } from './auth/entities/user.entity';
import { FileStoreModule } from './filestore/filestore.module';
import { typeOrmConfig } from './typeorm.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MetadataModule } from './metadata/metadata.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WalletModule } from './wallets/wallet.module';
import { PinManagementModule } from './pin-management/pin-management.module';

import { FirebaseModule } from './firebase/firebase.module';
import { FirebaseController } from './firebase/firebase.controller';
import { FirebaseService } from './firebase/firebase.service';
import { NotificationModule } from './notifications/notifications.module';

import { CustomThrottlerGuard } from './auth/guards/custom-throttler.guard';
// import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.development'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        typeOrmConfig(configService),
      inject: [ConfigService],
    }),
    // Enhanced ThrottlerModule with multiple configurations
    // ThrottlerModule.forRootAsync({
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     throttlers: [
    //       {
    //         name: 'default',
    //         ttl: 60000, // 1 minute
    //         limit: 100, // 100 requests per minute (default)
    //       },
    //       {
    //         name: 'auth',
    //         ttl: 60000, // 1 minute
    //         limit: 5, // 5 requests per minute for auth endpoints
    //       },
    //       {
    //         name: 'payment',
    //         ttl: 60000, // 1 minute
    //         limit: 10, // 10 requests per minute for payment endpoints
    //       },
    //       {
    //         name: 'strict',
    //         ttl: 300000, // 5 minutes
    //         limit: 3, // 3 requests per 5 minutes for very sensitive endpoints
    //       },
    //       {
    //         name: 'public',
    //         ttl: 60000, // 1 minute
    //         limit: 200, // 200 requests per minute for public read endpoints
    //       },
    //     ],
    //     storage: new ThrottlerStorageRedisService({
    //       host: config.get('REDIS_HOST', 'localhost'),
    //       port: config.get('REDIS_PORT', 6379),
    //       password: config.get('REDIS_PASSWORD'),
    //       db: config.get('REDIS_DB', 0),
    //       // Add key prefix for rate limiting
    //       keyPrefix: 'throttle:',
    //     }),
    //     // Enhanced error message with retry information
    //     errorMessage: 'Rate limit exceeded. Please try again later.',
    //     // Skip rate limiting for health checks and internal calls
    //     skipIf: (context) => {
    //       const request = context.switchToHttp().getRequest();
    //       const skipPaths = ['/health', '/metrics', '/favicon.ico'];
    //       return skipPaths.includes(request.url);
    //     },
    //   }),
    // }),
    CommonModule,
    MetadataModule,
    AuthModule,
    FileStoreModule,
    WalletModule,
    WebhooksModule,
    PinManagementModule,
    FirebaseModule,
    NotificationModule,
  ],
  controllers: [AppController, FirebaseController],
  providers: [
    AppService,

    FirebaseService,
    // ✅ Enable global rate limiting with custom guard
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
