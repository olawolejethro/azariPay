// src/webhooks/controllers/paga-payment.controller.ts

import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  Logger,
  Get,
} from '@nestjs/common';
import { PagaPaymentWebhookService } from '../services/paga-payment-webhook.service';
import { PaymentNotificationDto } from '../dto/paga-payment.dto';

@Controller('paga/webhooks')
export class PagaPaymentWebhookController {
  private readonly logger = new Logger(PagaPaymentWebhookController.name);

  constructor(
    private readonly pagaPaymentWebhookService: PagaPaymentWebhookService,
  ) {}

  @Post('payment')
  async handlePaymentNotification(
    @Body() payload: any,
    @Headers('hash') hash: string,
  ) {
    this.logger.debug('Received Paga payment notification', {
      transactionReference: payload.transactionReference,
      accountNumber: payload.accountNumber,
    });

    // Verify webhook hash
    const isValidHash = await this.pagaPaymentWebhookService.verifyHash(
      payload,
      hash || payload.hash, // Use header hash or payload hash
    );

    if (!isValidHash) {
      this.logger.warn('Invalid hash in payment notification', {
        transactionReference: payload.transactionReference,
      });
      throw new UnauthorizedException('Invalid webhook hash');
    }

    // Process the payment notification
    await this.pagaPaymentWebhookService.processPayment(payload);

    return {
      message: 'success',
    };
  }
}
