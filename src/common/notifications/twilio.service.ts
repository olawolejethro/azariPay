// src/common/notifications/twilio.service.ts

import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Twilio } from 'twilio';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwilioService {
  private client: Twilio;
  private readonly logger = new Logger(TwilioService.name);

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      throw new InternalServerErrorException(
        'Twilio credentials are not set in environment variables.',
      );
    }

    this.client = new Twilio(accountSid, authToken);
  }

  async sendSms(to: string, message: string): Promise<void> {
    try {
      const messageInstance = await this.client.messages.create({
        body: message,
        from: this.configService.get<string>('TWILIO_FROM_NUMBER'),
        to,
      });

      this.logger.log(`SMS sent successfully. SID: ${messageInstance.sid}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${to}: ${error.message}`);
      throw new InternalServerErrorException(
        'Only Canadian numbers are accepted. Please enter a valid Canadian number.',
      );
    }
  }
}
