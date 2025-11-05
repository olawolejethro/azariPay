import { MiddlewareConsumer, Module } from '@nestjs/common';
import { sumsubWebhookAuth } from './middlewares/webhook.auth';
import { WebhooksController } from './controllers/webhook.controller';
import { WebhookService } from './services/webhook.service';
import { User } from 'src/auth/entities/user.entity';
import { AuthService } from 'src/auth/services/auth.service';
import { LoggerService } from 'src/common/logger/logger.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { FileStore } from 'src/filestore/entities/filestore.entity';
// import { WalletService } from 'src/wallets/services/wallet.service';
import { WalletModule } from 'src/wallets/wallet.module';
import { AuthModule } from 'src/auth/auth.module';
import { PagaPaymentWebhookController } from './controllers/paga-payment.controller';
import { PagaPaymentWebhookService } from './services/paga-payment-webhook.service';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import { TransactionService } from 'src/wallets/services/transaction.service';
import { TransactionEntity } from 'src/wallets/entities/transaction.entity';
import { DotBankWebhooksController } from './controllers/dot.bank.controller';
import { AptPayWebhookController } from './controllers/aptpay-webhook.controller';
import { AptPayWebhookService } from './services/aptpay-webhook.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import { AptPayWebhookEvent } from './entities/aptpay-webhook-event.entity';
import { CADTransactionEntity } from 'src/wallets/entities/cad-transaction.entity';
import { DisbursementEntity } from 'src/wallets/entities/disbursement.entity';
import { PaymentRequestEntity } from 'src/wallets/entities/payment-request.entity';
import { NotificationService } from 'src/notifications/notifications.service';

@Module({
  imports: [
    // Register all entities with TypeORM
    TypeOrmModule.forFeature([
      User,
      FileStore,
      NGNWalletEntity,
      TransactionEntity,
      AptPayWebhookEvent,
      CADTransactionEntity,
      DisbursementEntity,
      PaymentRequestEntity,
    ]),
    WalletModule,
    AuthModule,
    WebhooksModule,
  ],
  controllers: [
    WebhooksController,
    PagaPaymentWebhookController,
    DotBankWebhooksController,
    AptPayWebhookController,
  ],
  providers: [
    WebhookService,
    LoggerService,
    PagaPaymentWebhookService,
    AptPayWebhookService,
    TransactionService,
    FirebaseService,
    NotificationService,
  ],
})
export class WebhooksModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(sumsubWebhookAuth).forRoutes('/webhooks');
  }
}
