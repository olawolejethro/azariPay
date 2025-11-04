// src/common/notifications/notifications.service.ts

import { Injectable } from '@nestjs/common';
import { TwilioService } from './twilio.service';
import { EmailService } from './email.service';

/**
 * **NotificationsService**
 *
 * The `NotificationsService` serves as a centralized service for sending notifications via different channels, such as SMS and Email.
 * It leverages the `TwilioService` to send SMS messages and the `EmailService` to send emails.
 *
 * **Example Usage:**
 * ```typescript
 * import { NotificationsService } from './notifications.service';
 *
 * @Injectable()
 * export class UserService {
 *   constructor(private readonly notificationsService: NotificationsService) {}
 *
 *   async notifyUser() {
 *     await this.notificationsService.sendSms('+1234567890', 'Your verification code is 123456.');
 *     await this.notificationsService.sendEmail(
 *       'user@example.com',
 *       'Welcome!',
 *       'Thank you for signing up.',
 *       '<p>Thank you for signing up.</p>'
 *     );
 *   }
 * }
 * ```
 */
@Injectable()
export class NotificationsService {
  /**
   * **Constructor**
   *
   * Initializes the `NotificationsService` by injecting the `TwilioService` and `EmailService`.
   *
   * **Example Usage:**
   * ```typescript
   * const notificationsService = new NotificationsService(twilioService, emailService);
   * ```
   *
   * @param twilioService - The `TwilioService` handles sending SMS messages.
   * @param emailService - The `EmailService` handles sending emails.
   */
  constructor(
    private readonly twilioService: TwilioService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * **sendSms**
   *
   * Sends an SMS message to the specified recipient using the `TwilioService`.
   *
   * **Example Usage:**
   * ```typescript
   * await notificationsService.sendSms('+1234567890', 'Your verification code is 123456.');
   * ```
   *
   * @param to - The recipient's phone number in E.164 format (e.g., '+1234567890').
   * @param message - The content of the SMS message.
   * @returns A `Promise` that resolves when the SMS is sent successfully or rejects with an error.
   * @throws Propagates any exceptions thrown by the `TwilioService`.
   */
  async sendSms(to: string, message: string): Promise<void> {
    await this.twilioService.sendSms(to, message);
  }

  /**
   * **sendEmail**
   *
   * Sends an email to the specified recipient using the `EmailService`.
   *
   * **Example Usage:**
   * ```typescript
   * await notificationsService.sendEmail(
   *   'user@example.com',
   *   'Welcome!',
   *   'Thank you for signing up.',
   *   '<p>Thank you for signing up.</p>'
   * );
   * ```
   *
   * @param to - The recipient's email address.
   * @param subject - The subject line of the email.
   * @param text - The plain text content of the email.
   * @param html - (Optional) The HTML content of the email.
   * @returns A `Promise` that resolves when the email is sent successfully or rejects with an error.
   * @throws Propagates any exceptions thrown by the `EmailService`.
   */
  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<void> {
    await this.emailService.sendEmail(to, subject, text, html);
  }
}
