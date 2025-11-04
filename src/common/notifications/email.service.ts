// src/common/notifications/email.service.ts

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private apiInstance: SibApiV3Sdk.TransactionalEmailsApi;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException('Brevo API key is not set in environment variables.');
    }

    SibApiV3Sdk.ApiClient.instance.authentications['api-key'].apiKey = apiKey;
    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<void> {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    sendSmtpEmail.textContent = text;
    sendSmtpEmail.sender = {
      email: this.configService.get<string>('BREVO_SENDER_EMAIL'),
      name: this.configService.get<string>('BREVO_SENDER_NAME'),
    };
    sendSmtpEmail.to = [{ email: to }];

    try {
      const response = await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      this.logger.log(`Email sent successfully. Message ID: ${response.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send Email to ${to}: ${error.message}`);
      throw new InternalServerErrorException('Failed to send Email.');
    }
  }
}
