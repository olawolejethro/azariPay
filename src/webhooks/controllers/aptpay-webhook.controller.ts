// controllers/aptpay-webhook.controller.ts
import {
  Controller,
  Post,
  Body,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { AptPayWebhookService } from '../services/aptpay-webhook.service';
import { AptPayWebhookDto } from '../dto/aptpay-webhook.dto';

@Controller('api/v1/webhooks/aptpay')
export class AptPayWebhookController {
  private readonly logger = new Logger(AptPayWebhookController.name);

  constructor(private readonly webhookService: AptPayWebhookService) {}

  @Post('webhooks')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Req() req: Request,
    @Headers('x-aptpay-signature') signature?: string,
    @Headers('x-webhook-signature') webhookSignature?: string,
  ) {
    // this.logger.log(`🔔 Received APT Pay webhook: ${payload.entity} - ${payload.status} (ID: ${payload.id})`);

    // if (payload.errorCode || payload.description) {
    //   this.logger.log(`❌ Error details: ${payload.errorCode} - ${payload.description}`);
    // }

    // this.logger.log(`📊 Payload: ${JSON.stringify(payload)}`);

    try {
      // Get raw body for signature verification
      const rawBody = JSON.stringify(payload);

      // Use either signature header
      const sig = signature || webhookSignature;

      const result = await this.webhookService.processWebhook(
        payload,
        rawBody,
        sig,
      );

      this.logger.log(`✅ Webhook processed successfully: ${payload.id}`);
      return {
        success: true,
        message: 'Webhook processed successfully',
        ...result,
      };
    } catch (error) {
      console.log(error, 'errors');
      this.logger.error(
        `❌ Webhook processing failed: ${error.message}`,
        error.stack,
      );

      // Return success to prevent APT Pay retries for validation errors
      if (error instanceof BadRequestException) {
        return {
          success: false,
          error: error.message,
          message: 'Webhook validation failed',
        };
      }

      // Re-throw other errors to trigger APT Pay retries
      throw error;
    }
  }

  @Get('stats')
  async getWebhookStats(@Query('days') days?: string) {
    const dayCount = days ? parseInt(days) : 7;
    return await this.webhookService.getWebhookStats(dayCount);
  }

  // @Post('retry-failed')
  // async retryFailedWebhooks() {
  //   const retryCount = await this.webhookService.retryFailedEvents();
  //   return {
  //     success: true,
  //     message: `Retried ${retryCount} failed webhook events`,
  //   };
  // }
}
