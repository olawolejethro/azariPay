// src/filestore/filestore.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileStore } from './entities/filestore.entity';
import { FileStoreService } from './services/filestore.service';
import { FileStoreController } from './controllers/filestore.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CommonModule } from 'src/common/common.module';
import { S3Client } from '@aws-sdk/client-s3';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FileStore]),
    ConfigModule,
    CommonModule,
    forwardRef(() => AuthModule),
  ],
  providers: [
    FileStoreService,
    {
      provide: S3Client,
      useFactory: (configService: ConfigService) => {
        const region = configService.get<string>('WASABI_REGION');

        return new S3Client({
          region,
          endpoint: `https://${configService.get<string>('WASABI_ENDPOINT')}`, // Add this!
          credentials: {
            accessKeyId: configService.get<string>('WASABI_ACCESS_KEY'),
            secretAccessKey: configService.get<string>('WASABI_SECRET_KEY'),
          },
          forcePathStyle: true, // Add this for Wasabi compatibility
        });
      },
      inject: [ConfigService], // Add this to inject ConfigService
    },
  ],
  controllers: [FileStoreController],
  exports: [FileStoreService],
})
export class FileStoreModule {}
