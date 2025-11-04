// src/common/common.module.ts

import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger/logger.service';
import { RedisService } from './redis/redis.service';
import { TwilioService } from './notifications/twilio.service';
import { EmailService } from './notifications/email.service';
import { NotificationsService } from './notifications/notifications.service';
import { ConfigModule } from '@nestjs/config';
import { GeolocationService } from './geolocation.service';
import { EncryptionService } from './encryption/encryption.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    LoggerService,
    RedisService,
    TwilioService,
    EmailService,
    NotificationsService,
    GeolocationService,
    EncryptionService,
  ],
  exports: [
    LoggerService,
    RedisService,
    NotificationsService,
    GeolocationService,
    EncryptionService,
  ],
})
export class CommonModule {}
