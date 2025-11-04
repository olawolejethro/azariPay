// src/P2P/p2p-trade/p2p-trade.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { NotificationModule } from 'src/notifications/notifications.module';
import { P2PTradeController } from './controllers/p2p-trade/p2p-trade.controller';
import { P2PTradeService } from './services/p2p-trade/p2p-trade.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import { P2PTrade } from 'src/p2p-trade/entities/p2p-trade.entity';
import { P2PSeller } from 'src/P2P/entities/p2p-seller.entity';
import { P2PBuyer } from 'src/P2P/entities/p2p-buyer.entity';
import { User } from 'src/auth/entities/user.entity';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { CADWalletEntity } from 'src/wallets/entities/CADwallet.entity';
import { P2PRating } from './entities/p2p-rating.entity';
import { P2PRatingController } from './controllers/p2p-rating.controller';
import { P2PRatingService } from './services/p2p-rating.service';
import { EscrowService } from './services/escrow.service';
import { Escrow } from './entities/escrow.entity';
import { FeeManagementService } from 'src/metadata/services/fee-management.service';
import { FeeConfiguration } from 'src/metadata/entities/fee-config.entity';
import { EmailService } from 'src/common/notifications/email.service';
import { NegotiationService } from './services/p2p-trade/negotiation.service';
import { Negotiation } from './entities/negotiation.entity';
import { NegotiationController } from './controllers/negotiation.controller';
import { CommonModule } from 'src/common/common.module';
import { Dispute } from './entities/dispute.entity';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { FileStore } from 'src/filestore/entities/filestore.entity';
import { FileStoreModule } from 'src/filestore/filestore.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      P2PTrade,
      P2PSeller,
      P2PBuyer,
      User,
      NGNWalletEntity,
      CADWalletEntity,
      P2PRating,
      Escrow,
      FeeConfiguration,
      Negotiation,
      Dispute,
    ]),
    FirebaseModule,
    NotificationModule,
    AuthModule,
    CommonModule,
    FileStoreModule,
  ],
  controllers: [P2PTradeController, P2PRatingController, NegotiationController],
  providers: [
    P2PTradeService,
    FirebaseService,
    P2PRatingService,
    EscrowService,
    FeeManagementService,
    EmailService,
    NegotiationService,
  ],
  exports: [P2PTradeService],
})
export class P2PTradeModule {}
