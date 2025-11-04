// src/auth/controllers/auth.controller.ts

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';

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

@ApiTags('Webhook')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly logger: LoggerService,
    // Updated injection
  ) {}

  /**
   * ================================
   * Sumsub - Webhook
   * ================================
   */
  @Post('/sumsub-kyc')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sumsub KYC webhook' })
  @ApiResponse({
    status: 200,
    description: 'webhook processed',
    schema: {
      example: {
        status: 'success',
        message: 'webhook processed',
      },
    },
  })
  async processKycWebhook(
    @Headers('x-payload-digest') signature: string,
    @Body() data: any,
  ) {
    this.logger.log(
      `Processing KYC webhook with data: ${JSON.stringify(data)}`,
      'WebhookController',
    );

    const response = await this.webhookService.processKycWebhook(
      signature,
      data,
    );

    this.logger.log(`KYC webhook processed successfully`, 'WebhookController');

    return {
      status: 'success',
      message: 'Webhook processed successfully',
      data: response,
    };
  }
  // https://255d-197-211-58-38.ngrok-free.app/api/v1/webhooks/virtual-account-notification
  @Post('virtual-account-notification')
  async handleVirtualAccountNotification(@Body() notification: any) {
    try {
      this.logger.log(
        `Received virtual account notification: ${JSON.stringify(notification)}`,
      );

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
