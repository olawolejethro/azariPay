// src/notifications/notification.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notifications.service';
import { NotificationController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { FirebaseModule } from '../firebase/firebase.module';
import { AuthModule } from '../auth/auth.module';
import { FirebaseService } from 'src/firebase/firebase.service';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { User } from 'src/auth/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, P2PSeller, User]),
    forwardRef(() => FirebaseModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, FirebaseService],
  exports: [NotificationService],
})
export class NotificationModule {}
