// src/Pin-Management/pin-management.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { PinManagementController } from './controllers/pin-management.controller';
import { PinManagementService } from './services/pin-management.service';
import { CommonModule } from 'src/common/common.module';
import { OnboardingTrackingService } from 'src/auth/services/onboardingTrackingService';
import { AuthModule } from 'src/auth/auth.module';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]), // Import TypeORM with User entity
    CommonModule,
    AuthModule,
  ],
  controllers: [PinManagementController],
  providers: [PinManagementService, OnboardingTrackingService, JwtService],
  exports: [PinManagementService], // Export service if needed by other modules
})
export class PinManagementModule {}
