// src/metadata/metadata.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Existing controllers and services
import { CountryController } from './controllers/country.controller';
import { CountryService } from './services/country.service';
import { GeographicController } from './controllers/geographic.controller';
import { GeographicService } from './services/geographic.service';

// Entities and external modules
import { User } from 'src/auth/entities/user.entity';
import { FileStore } from 'src/filestore/entities/filestore.entity';
import { FileStoreModule } from 'src/filestore/filestore.module';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { S3Client } from '@aws-sdk/client-s3';
import { CanadaLocationService } from './services/geoNames.service';
import { CanadaLocationController } from './controllers/geoNames.controller';
import { FeeManagementService } from './services/fee-management.service';
import { FeeManagementController } from './controllers/fee-management.controller';
import { FeeConfiguration } from './entities/fee-config.entity';
import { EmailService } from 'src/common/notifications/email.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    // Configuration module for environment variables
    ConfigModule,

    // TypeORM entities
    TypeOrmModule.forFeature([User, FileStore, FeeConfiguration]),

    // File storage module
    FileStoreModule,
    AuthModule,

    // Cache configuration
    CacheModule.register({
      ttl: 7 * 24 * 60 * 60, // 7 days cache TTL for geographic data
      max: 500, // Increased cache size for geographic data
    }),
  ],

  controllers: [
    CountryController,
    GeographicController,
    CanadaLocationController,
    FeeManagementController,
  ],

  providers: [
    CountryService,
    GeographicService,
    CanadaLocationService,
    FileStoreService,
    S3Client,
    FeeManagementService,
    EmailService,
  ],

  exports: [CountryService, GeographicService, FeeManagementService],
})
export class MetadataModule {}
