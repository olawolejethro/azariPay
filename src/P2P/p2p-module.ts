// src/P2P/p2p.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioController } from './controllers/portfolio.controller';
import { PortfolioService } from './services/portfolio.service';
import { Portfolio } from './entities/porfolio.entity';
import { P2PBuyerController } from './controllers/p2p-buyer.controller';
import { P2PBuyerService } from './services/p2p-buyer.service';
import { P2PBuyer } from './entities/p2p-buyer.entity';
import { P2PSellerController } from './controllers/p2p-seller.controller';
import { P2PSellerService } from './services/p2p-seller.service';
import { P2PSeller } from './entities/p2p-seller.entity';
import { User } from 'src/auth/entities/user.entity';
import { CADWalletEntity } from 'src/wallets/entities/CADwallet.entity';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { NotificationService } from 'src/notifications/notifications.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import { Notification } from 'src/notifications/entities/notification.entity';
import { P2PTrade } from 'src/p2p-trade/entities/p2p-trade.entity';
import { NegotiationService } from 'src/p2p-trade/services/p2p-trade/negotiation.service';
import { Negotiation } from 'src/p2p-trade/entities/negotiation.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Portfolio,
      P2PBuyer,
      P2PTrade,
      P2PSeller,
      User,
      CADWalletEntity,
      NGNWalletEntity,
      Notification,
      Negotiation,
    ]),
    AuthModule,
  ],
  controllers: [PortfolioController, P2PBuyerController, P2PSellerController],
  providers: [
    PortfolioService,
    P2PBuyerService,
    P2PSellerService,
    NotificationService,
    FirebaseService,
    NegotiationService,
  ],
  exports: [PortfolioService, P2PBuyerService, P2PSellerService],
})
export class P2PModule {}
