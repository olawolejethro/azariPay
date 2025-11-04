// src/auth/controllers/auth.controller.ts

import { Body, Controller, Headers, Post, Req } from '@nestjs/common';

import { WebhookService } from '../services/webhook.service';
import { LoggerService } from '../../common/logger/logger.service'; // Updated import

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { kycWebhookDto } from '../dto/sumsub.dto';
import { Request } from 'express';

@Controller('dotBank/webhooks')
export class DotBankWebhooksController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly logger: LoggerService,
    // Updated injection
  ) {}

  //https://2107-197-211-63-52.ngrok-free.app/dotBank/webhooks/virtual-account-notification
  @Post('virtual-account-notification')
  async handleVirtualAccountNotification(@Body() notification: any) {
    try {
      this.logger.log(
        `Received virtual account notification: ${JSON.stringify(notification)}`,
      );

      console.log('Received virtual account notification: ', notification);
      // Process the notification
      await this.webhookService.processVirtualAccountNotification(notification);

      // Respond with acknowledgement
      return {
        reference: notification.reference,
        status: 'ACKNOWLEDGED',
      };
    } catch (error) {
      this.logger.error(
        `Error processing virtual account notification: ${error.message}`,
      );

      // Still return 200 status to acknowledge receipt
      // This prevents DotBank from retrying the webhook
      return {
        reference: notification?.reference || 'unknown',
        status: 'ERROR',
        message: error.message,
      };
    }
  }
}
