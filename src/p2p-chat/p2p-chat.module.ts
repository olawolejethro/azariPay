// src/p2p-chat/p2p-chat.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigModule } from '@nestjs/config';
import { P2PChatMessage } from './entities/p2p-chat.entity/p2p-chat.entity';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationModule } from 'src/notifications/notifications.module';
import { P2PChatController } from './controllers/p2p-chat/p2p-chat.controller';
import { P2PChatService } from './services/p2p-chat/p2p-chat.service';
import { FirebaseService } from '../firebase/firebase.service';
import { P2PTrade } from '../p2p-trade/entities/p2p-trade.entity';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { FileStore } from 'src/filestore/entities/filestore.entity';
import { FileStoreModule } from 'src/filestore/filestore.module';
import { NegotiationService } from 'src/p2p-trade/services/p2p-trade/negotiation.service';
import { Negotiation } from 'src/p2p-trade/entities/negotiation.entity';
import { User } from 'src/auth/entities/user.entity';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      P2PTrade,
      P2PChatMessage,
      Negotiation,
      User,
      P2PSeller,
    ]),

    ConfigModule,
    forwardRef(() => AuthModule),
    forwardRef(() => NotificationModule),
    forwardRef(() => FileStoreModule),
  ],
  controllers: [P2PChatController],
  providers: [P2PChatService, FirebaseService, NegotiationService],
  exports: [P2PChatService, FirebaseService],
})
export class P2PChatModule {}
