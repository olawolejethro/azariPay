// services/aptpay-webhook.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { User } from '../../auth/entities/user.entity';
import { AptPayWebhookEvent } from '../entities/aptpay-webhook-event.entity';
import { AptPayWebhookDto } from '../dto/aptpay-webhook.dto';
import { CADWalletEntity } from 'src/wallets/entities/CADwallet.entity';
import {
  CADTransactionSource,
  CADTransactionStatus,
  CADTransactionType,
} from 'src/wallets/entities/cad-transaction.entity';
import { CADTransactionService } from 'src/wallets/services/cad-transaction.service';
import {
  PaymentRequestEntity,
  PaymentRequestStatus,
} from 'src/wallets/entities/payment-request.entity';
import { DisbursementEntity } from 'src/wallets/entities/disbursement.entity';
import { TransactionService } from 'src/wallets/services/transaction.service';
import {
  TransactionSource,
  TransactionStatus,
  TransactionCurrency,
  TransactionType,
} from 'src/wallets/entities/transaction.entity';
import { AuthService } from 'src/auth/services/auth.service';
import { RedisService } from 'src/common/redis/redis.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import {
  IdentityVerificationEntity,
  IdentityVerificationStatus,
} from 'src/wallets/entities/identity-verification.entity';
import { OnboardingTrackingService } from 'src/auth/services/onboardingTrackingService';
import e from 'express';
import {
  Notification,
  NotificationType,
} from 'src/notifications/entities/notification.entity';
import { NotificationService } from 'src/notifications/notifications.service';
import { EncryptionService } from 'src/common/encryption/encryption.service';

@Injectable()
export class AptPayWebhookService {
  private readonly logger = new Logger(AptPayWebhookService.name);

  constructor(
    @InjectRepository(AptPayWebhookEvent)
    private webhookEventRepository: Repository<AptPayWebhookEvent>,
    @InjectRepository(CADWalletEntity)
    private cadWalletRepository: Repository<CADWalletEntity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PaymentRequestEntity)
    private paymentRequestRepository: Repository<PaymentRequestEntity>,
    @InjectRepository(DisbursementEntity)
    private disbursementRepository: Repository<DisbursementEntity>,
    @InjectRepository(IdentityVerificationEntity)
    private identityVerificationRepository: Repository<IdentityVerificationEntity>,
    private readonly onboardingTrackingService: OnboardingTrackingService,
    private configService: ConfigService,
    private cadTransactionService: TransactionService,
    private notificationService: NotificationService,
    private encryptionService: EncryptionService, // Add this line
    private redisService: RedisService, // Assuming you have a RedisService for caching
    private userService: AuthService, // Assuming you have a UserService for user-related operations
    private firebaseService: FirebaseService, // Assuming you have a FirebaseService for notifications
  ) {}

  /**
   * Verify webhook signature from APT Pay
   */
  verifyWebhookSignature(payload: string, signature?: string): boolean {
    if (!signature) {
      this.logger.warn('No signature provided for webhook verification');
      return true; // Allow processing without signature for now
    }

    try {
      const secretKey =
        this.configService.get('APTPAY_WEBHOOK_SECRET') ||
        this.configService.get('APTPAY_SECRET_KEY');

      if (!secretKey) {
        this.logger.warn('No webhook secret configured');
        return true; // Allow if no secret configured
      }

      const expectedSignature = crypto
        .createHmac('sha512', secretKey)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature.replace('sha512=', ''), 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch (error) {
      this.logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Process incoming APT Pay webhook
   */
  async processWebhook(
    payload: any,
    rawPayload: string,
    signature?: string,
  ): Promise<any> {
    // Verify signature if provided
    if (signature && !this.verifyWebhookSignature(rawPayload, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }
    // console.log(rawPayload, 'rawPayload');
    // console.log(payload, 'payload');
    try {
      // Check for existing webhook event
      let existingEvent = await this.webhookEventRepository.findOne({
        where: { aptPayId: payload.id },
      });
      // console.log(existingEvent, 'existingEvent');
      if (existingEvent) {
        // console.log('existingEvent', existingEvent);
        // Check if this is a status progression (OK -> SETTLED) or exact duplicate
        const previousStatus = existingEvent.status;
        const newStatus = payload.status;

        if (previousStatus === newStatus) {
          // Exact duplicate - same ID and same status
          this.logger.warn(
            `🔄 Exact duplicate webhook ignored: ${payload.id} with status ${newStatus}`,
          );

          return {
            status: 'duplicate',
            eventId: payload.id,
            currentStatus: newStatus,
            message: 'Exact duplicate webhook ignored - no processing done',
            processingStatus: existingEvent.processingStatus,
          };
        }

        // Check if this is a valid status progression
        const isValidProgression = this.isValidStatusProgression(
          previousStatus,
          newStatus,
        );

        if (isValidProgression) {
          // Valid status progression (e.g., OK -> SETTLED)
          this.logger.log(
            `📈 Status progression for ${payload.id}: ${previousStatus} → ${newStatus}`,
          );

          // Update existing webhook event
          existingEvent.status = payload.status;
          existingEvent.balance = payload.balance;
          existingEvent.date = payload.date;
          existingEvent.errorCode = payload.errorCode;
          existingEvent.description = payload.description;
          existingEvent.processingStatus = 'pending';

          // Store progression info in description
          const progressionNote = `Progressed from ${previousStatus} to ${newStatus}`;
          existingEvent.description = existingEvent.description
            ? `${existingEvent.description} | ${progressionNote}`
            : progressionNote;

          // Update rawPayload with both old and new
          existingEvent.rawPayload = {
            current: payload,
            previous: existingEvent.rawPayload,
            progression: `${previousStatus}_to_${newStatus}`,
            updatedAt: new Date().toISOString(),
          };

          await this.webhookEventRepository.save(existingEvent);

          // Process the status progression
          const result = await this.handleWebhookEvent(payload, existingEvent, {
            isStatusProgression: true,
            previousStatus,
            isNewEvent: false,
          });

          // Update as processed
          existingEvent.processingStatus = 'processed';
          existingEvent.processedAt = new Date();
          await this.webhookEventRepository.save(existingEvent);

          return {
            ...result,
            isStatusProgression: true,
            previousStatus,
            currentStatus: newStatus,
          };
        } else if (
          newStatus === 'PAYEE_VERIFICATION_COMPLETED' ||
          newStatus === 'PAYEE_VERIFICATION_FAILED'
        ) {
          // Handle identity verification completed status
          this.logger.log(
            `🔍 Identity verification completed for ${payload.id}`,
          );

          // Update existing event with new status
          existingEvent.status = payload.status;
          existingEvent.balance = payload.balance;
          existingEvent.date = payload.date;
          existingEvent.errorCode = payload.errorCode;
          existingEvent.description = payload.description;
          existingEvent.processingStatus = 'pending';

          await this.webhookEventRepository.save(existingEvent);

          // Process the identity verification completed event
          const result = await this.handleWebhookEvent(payload, existingEvent, {
            isStatusProgression: true,
            previousStatus,
            isNewEvent: false,
          });

          // Update as processed
          existingEvent.processingStatus = 'processed';
          existingEvent.processedAt = new Date();
          await this.webhookEventRepository.save(existingEvent);

          return {
            ...result,
            isStatusProgression: true,
            previousStatus,
            currentStatus: newStatus,
          };
        } else {
          // Invalid status transition
          this.logger.warn(
            `⚠️ Invalid status transition ignored: ${payload.id} from ${previousStatus} to ${newStatus}`,
          );

          return {
            status: 'invalid_transition',
            eventId: payload.id,
            previousStatus,
            newStatus,
            message: 'Invalid status transition ignored - no processing done',
          };
        }
      } else {
        // New webhook event - create it
        this.logger.log(
          `✨ Processing new webhook: ${payload.id} with status ${payload.status}`,
        );
        console.log('createNewEvebt');
        const webhookEvent = this.webhookEventRepository.create({
          aptPayId: payload.id,
          balance: payload.balance,
          entity: payload.entity,
          status: payload.status,
          date: payload.date,
          errorCode: payload.errorCode,
          description:
            payload.description || `Initial status: ${payload.status}`,
          rawPayload: payload,
          processingStatus: 'pending',
          receivedAt: new Date(),
        });

        const savedEvent = await this.webhookEventRepository.save(webhookEvent);

        // Process the new webhook event
        const result = await this.handleWebhookEvent(payload, savedEvent, {
          isStatusProgression: false,
          previousStatus: null,
          isNewEvent: true,
        });

        // Update as processed
        savedEvent.processingStatus = 'processed';
        savedEvent.processedAt = new Date();
        await this.webhookEventRepository.save(savedEvent);

        return {
          ...result,
          isNewEvent: true,
          currentStatus: payload.status,
        };
      }
    } catch (error) {
      // Handle duplicate key errors (race condition)
      if (this.isDuplicateKeyError(error)) {
        this.logger.warn(
          `🔄 Race condition duplicate for ${payload.id}, treating as success`,
        );

        return {
          status: 'duplicate_race_condition',
          eventId: payload.id,
          message: 'Duplicate handled due to race condition',
        };
      }

      this.logger.error(
        `❌ Webhook processing failed for ${payload.id}:`,
        error.message,
      );

      // Try to update webhook event with error if it exists
      try {
        const webhookEvent = await this.webhookEventRepository.findOne({
          where: { aptPayId: payload.id },
        });

        if (webhookEvent) {
          webhookEvent.processingStatus = 'failed';
          webhookEvent.errorMessage = error.message;
          webhookEvent.retryCount = (webhookEvent.retryCount || 0) + 1;
          await this.webhookEventRepository.save(webhookEvent);
        }
      } catch (updateError) {
        this.logger.error(
          'Failed to update webhook event with error:',
          updateError.message,
        );
      }

      throw error;
    }
  }

  /**
   * Check if the status transition is valid
   */
  private isValidStatusProgression(
    previousStatus: string,
    newStatus: string,
  ): boolean {
    const validProgressions = {
      OK: ['SETTLED', 'FAILED', 'ERROR'],
      SETTLED: [], // Terminal status
      FAILED: [], // Terminal status
      ERROR: [], // Terminal status
    };

    const allowedNextStatuses = validProgressions[previousStatus] || [];
    return allowedNextStatuses.includes(newStatus);
  }

  /**
   * Updated handleWebhookEvent method signature to include context
   */
  private async handleWebhookEvent(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: {
      isStatusProgression: boolean;
      previousStatus: string | null;
      isNewEvent: boolean;
    } = {
      isStatusProgression: false,
      previousStatus: null,
      isNewEvent: true,
    },
  ): Promise<any> {
    // Your existing handleWebhookEvent logic here
    // Pass the context to individual handlers to prevent duplicate processing
    const { entity, status, id } = payload;
    this.logger.log(
      `🔔 Handling webhook event: ${entity} - ${status} (ID: ${id})`,
    );
    // Handle identity verification entities
    if (entity === 'identityVerificationsVp') {
      // Handle identity verification events
      switch (status) {
        case 'PAYEE_VERIFICATION_COMPLETED':
          return await this.handleIdentityVerificationCompleted(
            payload,
            webhookEvent,
            context,
          );

        case 'PAYEE_VERIFICATION_FAILED':
          return await this.handleIdentityVerificationFailed(
            payload,
            webhookEvent,
            context,
          );

        default:
          this.logger.warn(
            `Unhandled identity verification event: ${status} for ID: ${id}`,
          );
          return {
            status: 'unhandled',
            eventType: status,
            message: `Identity verification event type ${status} not implemented yet`,
          };
      }
    }

    // Determine transaction type
    const paymentRequest = await this.paymentRequestRepository.findOne({
      where: { aptPayTransactionId: id },
      relations: ['user'],
    });

    const disbursement = await this.disbursementRepository.findOne({
      where: { aptPayTransactionId: id },
    });
    console.log(disbursement, 'disb');
    let actualType: 'request_pay' | 'disbursement';

    if (paymentRequest) {
      actualType = 'request_pay';
    } else if (disbursement) {
      actualType = 'disbursement';
    } else {
      if (entity === 'disbursement') {
        actualType = 'disbursement';
      } else {
        throw new Error(`Cannot determine transaction type for ID: ${id}`);
      }
    }

    const eventKey = `${actualType}_${status.toLowerCase()}`;
    console.log('eventKey:', eventKey, 'context:', context);

    // Handle each status - pass context to prevent duplicate processing
    switch (eventKey) {
      case 'disbursement_ok':
        return await this.handleDisbursementOK(payload, webhookEvent, context);

      case 'disbursement_settled':
        return await this.handleDisbursementSettled(
          payload,
          webhookEvent,
          context,
        );

      case 'disbursement_failed':
      case 'disbursement_error':
        return await this.handleDisbursementFailed(
          payload,
          webhookEvent,
          context,
        );

      case 'request_pay_ok':
        return await this.handleRequestPayOK(payload, webhookEvent, context);

      case 'request_pay_settled':
        return await this.handleRequestPaySettled(
          payload,
          webhookEvent,
          context,
        );

      case 'request_pay_failed':
      case 'request_pay_error':
        return await this.handleRequestPayFailed(
          payload,
          webhookEvent,
          context,
        );

      default:
        this.logger.warn(`Unhandled webhook event: ${eventKey} for ID: ${id}`);
        return {
          status: 'unhandled',
          eventType: eventKey,
          message: `Event type ${eventKey} not implemented yet`,
        };
    }
  }

  private isDuplicateKeyError(error: any): boolean {
    return (
      error.code === '23505' ||
      error.message?.includes('duplicate key') ||
      error.message?.includes('UQ_aptpay_webhook_events_apt_pay_id')
    );
  }

  /**
   * Handle disbursement OK status with context awareness
   */
  private async handleDisbursementOK(
    payload: AptPayWebhookDto,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    // Skip if this is a status progression (not new)
    if (context.isStatusProgression) {
      this.logger.log(
        `⏭️ Skipping DisbursementOK processing - status progression from ${context.previousStatus}`,
      );

      return {
        status: 'skipped',
        action: 'disbursement_ok_skipped',
        reason: 'Status progression - transaction already exists',
        previousStatus: context.previousStatus,
        currentStatus: payload.status,
      };
    }

    // Original OK logic only for new events
    try {
      const user = await this.findUserByDisbursementId(payload.id);

      if (user) {
        webhookEvent.userId = user.id;
        await this.webhookEventRepository.save(webhookEvent);

        return {
          status: 'processed',
          action: 'disbursement_processing',
          userId: user.id,
          transactionId: payload.id,
          isNewEvent: context.isNewEvent,
        };
      }
    } catch (error) {
      this.logger.error('Error processing disbursement OK:', error);
      throw error;
    }
  }

  /**
   * Handle disbursement settled status with context awareness
   */
  private async handleDisbursementSettled(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    this.logger.log(
      `Processing disbursement settled ID: ${payload.id}, isProgression: ${context.isStatusProgression}`,
    );
    console.log(
      'handleDisbursementSettled called',
      payload,
      'let',
      payload.id,
      context,
    );
    try {
      // Find the disbursement by aptPayTransactionId
      const disbursement = await this.disbursementRepository.findOne({
        where: { aptPayTransactionId: payload.id },
      });

      let user = null;
      if (disbursement && disbursement.userId) {
        user = await this.userRepository.findOne({
          where: { id: disbursement.userId },
        });
      }
      // console.log(user, 'user');
      if (user) {
        webhookEvent.userId = user.id;
        await this.webhookEventRepository.save(webhookEvent);

        if (context.isStatusProgression && context.previousStatus === 'OK') {
          // This is OK → SETTLED progression, complete the existing PENDING transaction
          const existingTransaction =
            await this.cadTransactionService.getTransactionByExternalId(
              payload.id,
            );
          console.log(existingTransaction, 'existingTransactiontranssfer');
          if (
            existingTransaction &&
            existingTransaction.status === TransactionStatus.PENDING
          ) {
            this.logger.log(
              `🔄 Completing existing PENDING transaction ID: ${existingTransaction.id}`,
            );
            // Complete the pending transaction
            const completedTransaction =
              await this.cadTransactionService.completeTransaction(
                existingTransaction.id,
                {
                  completedAt: payload.date
                    ? new Date(payload.date)
                    : new Date(),
                  metadata: {
                    aptPayStatus: payload.status,
                    settledPayload: payload,
                  },
                },
              );

            this.logger.log(
              `✅ Completed transaction ID: ${completedTransaction}`,
            );

            return {
              status: 'processed',
              action: 'disbursement_completed_from_pending',
              userId: user.id,
              amount: parseFloat(payload.balance),
              transactionId: payload.id,
              transactionRecordId: completedTransaction.id,
              progressionHandled: true,
            };
          }
        }

        console.log(disbursement, 'disbursementnotidication');
        await this.sendPaymentSentNotification(
          user,
          disbursement.amount,
          disbursement.recipientEmail,
        );
        return {
          status: 'processed',
          action: 'disbursement_completed_direct',
          userId: user.id,
          transactionId: payload.id,
          walletUpdated: true,
          isProgression: context.isStatusProgression,
        };
      }
    } catch (error) {
      this.logger.error('Error processing disbursement settled:', error);
      throw error;
    }
  }
  /**
   * Handle disbursement failed status with context awareness
   */
  private async handleDisbursementFailed(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    this.logger.log(
      `Processing disbursement failed: ${payload.id}, Error: ${payload.errorCode} - ${payload.description}`,
    );

    try {
      const disbursement = await this.disbursementRepository.findOne({
        where: { aptPayTransactionId: payload.id },
      });

      let user = null;
      if (disbursement && disbursement.userId) {
        user = await this.userRepository.findOne({
          where: { id: disbursement.userId },
        });
      }

      if (user) {
        webhookEvent.userId = user.id;
        await this.webhookEventRepository.save(webhookEvent);

        const failureReason =
          payload.description ||
          payload.errorCode ||
          'Disbursement failed at APT Pay';

        const existingTransaction =
          await this.cadTransactionService.getTransactionByExternalId(
            payload.id,
          );

        if (
          existingTransaction &&
          existingTransaction.status === TransactionStatus.PENDING
        ) {
          this.logger.log(
            `🔄 Failing existing PENDING transaction ID: ${existingTransaction.id} and processing refund`,
          );

          // 1. Fail the existing transaction
          const failedTransaction =
            await this.cadTransactionService.failTransaction(
              existingTransaction.id,
              {
                failedAt: payload.date ? new Date(payload.date) : new Date(),
                failureReason: failureReason,
                metadata: {
                  errorCode: payload.errorCode,
                  errorDescription: payload.description,
                  aptPayStatus: payload.status,
                  failedPayload: payload,
                },
              },
            );

          this.logger.log(`❌ Failed transaction ID: ${failedTransaction.id}`);

          // 2. Refund wallet balance to user
          try {
            const refundAmount =
              (disbursement && Number(disbursement.amount)) ||
              (payload.balance ? parseFloat(payload.balance) : 0);

            if (refundAmount > 0) {
              const wallet = await this.cadWalletRepository.findOne({
                where: { userId: user.id },
              });

              if (wallet) {
                const previousBalance = parseFloat(wallet.balance.toString());

                // Update wallet balance
                wallet.balance = previousBalance + refundAmount;
                await this.cadWalletRepository.save(wallet);

                this.logger.log(
                  `💸 Refunded ${refundAmount} to user ${user.id} wallet (before: ${previousBalance}, after: ${wallet.balance})`,
                );

                // ✅ 3. CREATE REFUND TRANSACTION RECORD
                try {
                  const refundTransaction =
                    await this.cadTransactionService.createTransaction({
                      userId: user.id,
                      type: 'REFUND',
                      amount: refundAmount,
                      currency: TransactionCurrency.CAD,
                      source: TransactionSource.REFUND,
                      description: `Refund for failed disbursement to ${disbursement.recipientEmail || 'recipient'}`,
                      reference: `REFUND-${payload.id}-${Date.now()}`,
                      externalTransactionId: payload.id,
                      status: 'COMPLETED',
                      processedBy: 'system',
                      metadata: {
                        refundType: 'DISBURSEMENT_FAILED',
                        originalTransactionId: existingTransaction.id,
                        failedTransactionId: failedTransaction.id,
                        disbursementId: disbursement?.id,
                        failureReason: failureReason,
                        errorCode: payload.errorCode,
                        aptPayStatus: payload.status,
                        recipientEmail: disbursement.recipientEmail,
                        refundedAt: new Date().toISOString(),
                        balanceBefore: previousBalance,
                        balanceAfter: wallet.balance,
                      },
                    });

                  this.logger.log(
                    `✅ Refund transaction created: ID ${refundTransaction.id} for ${refundAmount} CAD`,
                  );
                } catch (refundTxError) {
                  this.logger.error(
                    'Failed to create refund transaction record',
                    refundTxError,
                  );
                  // Wallet already refunded, so just log the error
                }
              } else {
                this.logger.warn(
                  `No CAD wallet found for user ${user.id}; refund of ${refundAmount} not applied`,
                );
              }
            } else {
              this.logger.log(
                'No refund amount determined, skipping wallet  refund',
              );
            }
          } catch (refundError) {
            this.logger.error('Error refunding user wallet:', refundError);
          }

          // 4. Send notification
          await this.sendDisbursementFailedNotification(
            user,
            disbursement.amount,
            disbursement.recipientEmail,
            failureReason,
          );

          return {
            status: 'processed',
            action: 'disbursement_failed_with_refund',
            userId: user.id,
            amount: parseFloat(payload.balance),
            transactionId: payload.id,
            failedTransactionId: failedTransaction.id,
            refundProcessed: true,
            failureReason: failureReason,
          };
        }
      }
    } catch (error) {
      this.logger.error('Error processing disbursement failed:', error);
      throw error;
    }
  }
  /**
   * Handle request pay OK status with context awareness
   */
  private async handleRequestPayOK(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    // Skip if this is a status progression (not new)
    if (context.isStatusProgression) {
      this.logger.log(
        `⏭️ Skipping RequestPayOK processing - status progression from ${context.previousStatus}`,
      );

      return {
        status: 'skipped',
        action: 'request_pay_ok_skipped',
        reason: 'Status progression - transaction already exists',
        previousStatus: context.previousStatus,
        currentStatus: payload.status,
      };
    }

    // Original OK logic only for new events
    try {
      const user = await this.findUserByRequestPayId(payload.id);

      if (user) {
        webhookEvent.userId = user.id;
        await this.webhookEventRepository.save(webhookEvent);

        return {
          status: 'processed',
          action: 'request_pay_processing',
          userId: user.id,
          transactionId: payload.id,
          isNewEvent: context.isNewEvent,
        };
      }
    } catch (error) {
      this.logger.error('Error processing request pay OK:', error);
      throw error;
    }
  }

  /**
   * Handle request pay settled status (money received)
   */

  private async handleRequestPaySettled(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    this.logger.log(
      `Processing request pay settled: ${payload.id}, isProgression: ${context.isStatusProgression}`,
    );

    try {
      // First, try to get cached data from Redis
      const cacheKey = `payment_request:${payload.id}`;
      const cachedDataString = await this.redisService.getKey(cacheKey);

      let user = null;
      let cachedData = null;

      if (cachedDataString) {
        cachedData = JSON.parse(cachedDataString);
        user = await this.userService.findUserById(cachedData.userId);
        this.logger.log(
          `📥 Retrieved cached data for payment request: ${payload.id}`,
          cachedData,
        );
      } else {
        // Fallback to existing method if no cached data
        user = await this.findUserByRequestPayId(payload.id);
        this.logger.warn(
          `⚠️ No cached data found for payment request: ${payload.id}, using fallback method`,
        );
      }

      if (user) {
        webhookEvent.userId = user.id;
        await this.webhookEventRepository.save(webhookEvent);

        // Get wallet
        const wallet = await this.cadWalletRepository.findOne({
          where: { userId: user.id },
        });
        console.log(wallet, 'wallet');
        if (!wallet) {
          throw new Error(`No CAD wallet found for user ID: ${user.id}`);
        }

        // const payloadAmount = String(payload.balance);
        // const amount = parseFloat(payloadAmount.replace(/,/g, ''));
        const currentBalance = parseFloat(wallet.balance.toString());

        if (context.isStatusProgression && context.previousStatus === 'OK') {
          // This is OK → SETTLED progression, complete the existing PENDING transaction
          const existingTransaction = cachedData?.transactionId
            ? await this.cadTransactionService.getTransactionById(
                cachedData.transactionId,
              )
            : await this.cadTransactionService.getTransactionByExternalId(
                payload.id,
              );

          if (
            existingTransaction &&
            existingTransaction.status === TransactionStatus.PENDING
          ) {
            this.logger.log(
              `🔄 Completing existing PENDING transaction ID: ${existingTransaction.id}`,
            );

            // Complete the pending transaction
            const completedTransaction =
              await this.cadTransactionService.completeTransaction(
                existingTransaction.id,
                {
                  completedAt: payload.date
                    ? new Date(payload.date)
                    : new Date(),
                  metadata: {
                    ...existingTransaction.metadata,
                    aptPayStatus: payload.status,
                    settledPayload: payload,
                    settledAt: new Date().toISOString(),
                    transactionPhase: 'completed',
                    // finalBalance: newBalance,
                    webhookProcessedAt: new Date().toISOString(),
                    cachedDataUsed: !!cachedData,
                  },
                },
              );

            this.logger.log(
              `✅ Completed transaction ID: ${completedTransaction.id} and updated wallet`,
            );

            // Update payment request status using repository
            const paymentRequest = await this.paymentRequestRepository.findOne({
              where: { aptPayTransactionId: payload.id },
            });

            if (paymentRequest) {
              paymentRequest.status = PaymentRequestStatus.COMPLETED;
              paymentRequest.completedAt = payload.date
                ? new Date(payload.date)
                : new Date();
              paymentRequest.receivedAmount = parseFloat(payload.balance);
              paymentRequest.transactionId = completedTransaction.id;
              paymentRequest.updatedAt = new Date();

              await this.paymentRequestRepository.save(paymentRequest);

              this.logger.log(
                `✅ Updated payment request ${payload.id} to COMPLETED`,
              );
            } else {
              this.logger.warn(
                `⚠️ Payment request not found for ID: ${payload.id}`,
              );
            }

            // Clean up Redis cache after successful processing
            if (cachedData) {
              await this.redisService.deleteKey(cacheKey);
              this.logger.log(`🗑️ Cleaned up Redis cache for key: ${cacheKey}`);
            }

            // Send notification to user
            await this.sendPaymentReceivedNotification(
              user,
              cachedData?.amount,
              cachedData?.senderEmail,
            );

            return {
              status: 'processed',
              action: 'request_pay_completed_from_pending',
              userId: user.id,
              transactionId: payload.id,
              transactionRecordId: completedTransaction.id,
              balanceBefore: currentBalance,
              // balanceAfter: newBalance,
              walletUpdated: true,
              progressionHandled: true,
              cachedDataUsed: !!cachedData,
            };
          }
        }

        // Update payment request status using repository
        const paymentRequest = await this.paymentRequestRepository.findOne({
          where: { aptPayTransactionId: payload.id },
        });

        if (paymentRequest) {
          paymentRequest.status = PaymentRequestStatus.COMPLETED;
          paymentRequest.completedAt = payload.date
            ? new Date(payload.date)
            : new Date();
          paymentRequest.receivedAmount = parseFloat(payload.balance);
          // paymentRequest.transactionId = newTransactionId;
          paymentRequest.updatedAt = new Date();

          await this.paymentRequestRepository.save(paymentRequest);
          this.logger.log(
            `✅ Updated payment request ${payload.id} to COMPLETED`,
          );
        } else {
          this.logger.warn(
            `⚠️ Payment request not found for ID: ${payload.id}`,
          );
        }

        // Clean up Redis cache after successful processing
        if (cachedData) {
          await this.redisService.deleteKey(cacheKey);
          this.logger.log(`🗑️ Cleaned up Redis cache for key: ${cacheKey}`);
        }

        // Send notification to user
        await this.sendPaymentReceivedNotification(
          user,
          cachedData?.amount,
          cachedData?.senderEmail,
        );

        return {
          status: 'processed',
          action: 'request_pay_completed_direct',
          userId: user.id,
          transactionId: payload.id,
          balanceBefore: currentBalance,
          walletUpdated: true,
          newTransactionCreated: !cachedData?.transactionId,
          isProgression: context.isStatusProgression,
          cachedDataUsed: !!cachedData,
        };
      } else {
        this.logger.warn(`No user found for request pay ID: ${payload.id}`);
        return {
          status: 'processed',
          action: 'request_pay_completed',
          userId: null,
          amount: parseFloat(payload.balance),
          transactionId: payload.id,
          walletUpdated: false,
          transactionCreated: false,
          warning: 'User not found',
        };
      }
    } catch (error) {
      this.logger.error('Error processing request pay settled:', error);
      throw error;
    }
  }

  // Helper method for sending notifications
  // private async sendPaymentReceivedNotification(
  //   user: any,
  //   amount: number,
  //   senderEmail?: string,
  // ): Promise<void> {
  //   try {
  //     if (user?.fcmToken) {
  //       await this.firebaseService.sendPushNotification(user.fcmToken, {
  //         title: 'Payment Received',
  //         body: senderEmail
  //           ? `You received $${amount.toFixed(2)} from ${senderEmail}`
  //           : `You received $${amount.toFixed(2)}`,
  //         data: {
  //           type: 'payment_request_completed',
  //           amount: amount.toString(),
  //           senderEmail: senderEmail || '',
  //           timestamp: new Date().toISOString(),
  //         },
  //       });

  //       this.logger.log(
  //         `📱 Sent payment received notification to user ${user.id}`,
  //       );
  //     }
  //   } catch (notificationError) {
  //     this.logger.error(
  //       'Failed to send payment received notification:',
  //       notificationError,
  //     );
  //   }
  // }

  private async sendPaymentReceivedNotification(
    user: any,
    amount: number,
    senderEmail?: string,
  ): Promise<void> {
    try {
      if (!user) return;

      const body = senderEmail
        ? `You received $${amount.toFixed(2)} from ${senderEmail}`
        : `You received $${amount.toFixed(2)}`;

      await this.notificationService.create({
        userId: user.id,
        type: NotificationType.WALLET_FUNDED, // fits "money received"
        title: 'Payment Received',
        body,
        data: {
          type: 'payment_request_completed',
          amount: amount.toString(),
          senderEmail: senderEmail || '',
          timestamp: new Date().toISOString(),
        },
        action: '/wallet/transactions', // optional redirect in your app
        sendPush: true,
        category: 'payments',
        priority: 'high',
      });

      this.logger.log(
        `📱 Payment received notification created & sent for user ${user.id}`,
      );
    } catch (notificationError) {
      this.logger.error(
        'Failed to create/send payment received notification:',
        notificationError,
      );
    }
  }

  /////////////////////////////////////////////////////////////////
  // Helper method for sending payment sent notification
  // private async sendPaymentSentNotification(
  //   user: any,
  //   amount: number,
  //   recipientEmail?: string,
  // ): Promise<void> {
  //   try {
  //     if (user?.fcmToken) {
  //       await this.firebaseService.sendPushNotification(user.fcmToken, {
  //         title: 'Payment Sent',
  //         body: recipientEmail
  //           ? `You sent $${amount.toFixed(2)} to ${recipientEmail}`
  //           : `You sent $${amount.toFixed(2)}`,
  //         data: {
  //           type: 'payment_sent',
  //           amount: amount.toString(),
  //           recipientEmail: recipientEmail || '',
  //           timestamp: new Date().toISOString(),
  //         },
  //       });

  //       this.logger.log(`📱 Sent payment sent notification to user ${user.id}`);
  //     }
  //   } catch (notificationError) {
  //     this.logger.error(
  //       'Failed to send payment sent notification:',
  //       notificationError,
  //     );
  //   }
  // }

  private async sendPaymentSentNotification(
    user: any,
    amount: number,
    recipientEmail?: string,
  ): Promise<void> {
    try {
      if (!user) return;
      console.log(
        'sendPaymentSentNotification called',
        user.id,
        amount,
        recipientEmail,
      );
      const body = recipientEmail
        ? `You sent $${amount} to ${recipientEmail}`
        : `You sent $${amount}`;

      // Use NotificationService to both save + send
      await this.notificationService.create({
        userId: user.id,
        type: NotificationType.TRANSFER_COMPLETE, // closest enum to "payment sent"
        title: 'Payment Sent',
        body,
        currency: 'CAD',
        data: {
          type: 'payment_sent',
          amount: amount.toString(),
          recipientEmail: recipientEmail || '',
          timestamp: new Date().toISOString(),
        },
        action: '/wallet/transactions', // optional deep link
        sendPush: true, // will trigger FCM if token exists
        category: 'payments',
        priority: 'high',
      });

      this.logger.log(
        `📱 Payment notification created and sent for user ${user.id}`,
      );
    } catch (notificationError) {
      console.log(notificationError, 'notificationError');
      this.logger.error(
        'Failed to create/send payment sent notification:',
        notificationError,
      );
    }
  }

  // Helper method for sending disbursement failed notification
  // private async sendDisbursementFailedNotification(
  //   user: any,
  //   amount: number,
  //   recipientEmail?: string,
  //   failureReason?: string,
  // ): Promise<void> {
  //   try {
  //     if (user?.fcmToken) {
  //       await this.firebaseService.sendPushNotification(user?.fcmToken, {
  //         title: 'Payment Failed',
  //         body: recipientEmail
  //           ? `Your payment of $${amount.toFixed(2)} to ${recipientEmail} failed. Reason: ${failureReason || 'Unknown error.'}`
  //           : `Your payment of $${amount.toFixed(2)} failed. Reason: ${failureReason || 'Unknown error.'}`,
  //         data: {
  //           type: 'payment_failed',
  //           amount: amount.toString(),
  //           recipientEmail: recipientEmail || '',
  //           failureReason: failureReason || '',
  //           timestamp: new Date().toISOString(),
  //         },
  //       });

  //       this.logger.log(
  //         `📱 Sent disbursement failed notification to user ${user.id}`,
  //       );
  //     }
  //   } catch (notificationError) {
  //     this.logger.error(
  //       'Failed to send disbursement failed notification:',
  //       notificationError,
  //     );
  //   }
  // }

  private async sendDisbursementFailedNotification(
    user: any,
    amount: number,
    recipientEmail?: string,
    failureReason?: string,
  ): Promise<void> {
    try {
      if (!user) return;

      const body = recipientEmail
        ? `Your payment of $${amount} to ${recipientEmail} failed. Reason: ${failureReason || 'Unknown error.'}`
        : `Your payment of $${amount} failed. Reason: ${failureReason || 'Unknown error.'}`;

      await this.notificationService.create({
        userId: user.id,
        type: NotificationType.SECURITY_ALERT, // 👈 better fit than CUSTOM for failures
        title: 'Payment Failed',
        body,
        data: {
          type: 'payment_failed',
          amount: amount.toString(),
          recipientEmail: recipientEmail || '',
          failureReason: failureReason || 'Unknown error.',
          timestamp: new Date().toISOString(),
        },
        action: '/wallet/transactions', // optional deep link
        sendPush: true, // ensures FCM push if user has a token
        category: 'payments',
        priority: 'high',
      });

      this.logger.log(
        `📱 Disbursement failed notification created & sent for user ${user.id}`,
      );
    } catch (notificationError) {
      this.logger.error(
        'Failed to create/send disbursement failed notification:',
        notificationError,
      );
    }
  }

  // private async sendDisbursementFailedNotification(
  //   user: any,
  //   amount: number,
  //   recipientEmail?: string,
  //   failureReason?: string,
  // ): Promise<void> {
  //   try {
  //     if (!user) return;

  //     const body = recipientEmail
  //       ? `Your payment of $${amount.toFixed(2)} to ${recipientEmail} failed. Reason: ${failureReason || 'Unknown error.'}`
  //       : `Your payment of $${amount.toFixed(2)} failed. Reason: ${failureReason || 'Unknown error.'}`;

  //     // Use NotificationService to create + send push
  //     await this.notificationService.create({
  //       userId: user.id,
  //       type: NotificationType.SECURITY_ALERT, // or NotificationType.CUSTOM if more fitting
  //       title: 'Payment Failed',
  //       body,
  //       data: {
  //         type: 'payment_failed',
  //         amount: amount.toString(),
  //         recipientEmail: recipientEmail || '',
  //         failureReason: failureReason || 'Unknown error.',
  //         timestamp: new Date().toISOString(),
  //       },
  //       action: '/wallet/transactions', // optional: where user should be redirected
  //       sendPush: true,
  //       category: 'payments',
  //       priority: 'high',
  //     });

  //     this.logger.log(
  //       `📱 Disbursement failed notification created & sent for user ${user.id}`,
  //     );
  //   } catch (notificationError) {
  //     this.logger.error(
  //       'Failed to create/send disbursement failed notification:',
  //       notificationError,
  //     );
  //   }
  // }

  /**
   * Helper method for sending request pay failed notification
   */
  // private async sendRequestPayFailedNotification(
  //   user: any,
  //   amount: number,
  //   senderEmail?: string,
  //   failureReason?: string,
  // ): Promise<void> {
  //   try {
  //     if (user?.fcmToken) {
  //       await this.firebaseService.sendPushNotification(user.fcmToken, {
  //         title: 'Payment Request Failed',
  //         body: senderEmail
  //           ? `Your request to receive $${amount?.toFixed(2) || ''} from ${senderEmail} failed. Reason: ${failureReason || 'Unknown error.'}`
  //           : `Your payment request failed. Reason: ${failureReason || 'Unknown error.'}`,
  //         data: {
  //           type: 'payment_request_failed',
  //           amount: amount?.toString() || '',
  //           senderEmail: senderEmail || '',
  //           failureReason: failureReason || '',
  //           timestamp: new Date().toISOString(),
  //         },
  //       });

  //       this.logger.log(
  //         `📱 Sent request pay failed notification to user ${user.id}`,
  //       );
  //     }
  //   } catch (notificationError) {
  //     this.logger.error(
  //       'Failed to send request pay failed notification:',
  //       notificationError,
  //     );
  //   }
  // }

  private async sendRequestPayFailedNotification(
    user: any,
    amount: number,
    senderEmail?: string,
    failureReason?: string,
  ): Promise<void> {
    try {
      if (!user) return;

      const body = senderEmail
        ? `Your request to receive $${amount?.toFixed(2) || ''} from ${senderEmail} failed. Reason: ${failureReason || 'Unknown error.'}`
        : `Your payment request failed. Reason: ${failureReason || 'Unknown error.'}`;

      await this.notificationService.create({
        userId: user.id,
        type: NotificationType.PAYMENT_REQUEST, // fits better than CUSTOM for request failures
        title: 'Payment Request Failed',
        body,
        data: {
          type: 'payment_request_failed',
          amount: amount?.toString() || '',
          senderEmail: senderEmail || '',
          failureReason: failureReason || 'Unknown error.',
          timestamp: new Date().toISOString(),
        },
        action: '/wallet/requests', // optional deep link to failed requests page
        sendPush: true,
        category: 'payments',
        priority: 'high',
      });

      this.logger.log(
        `📱 Payment request failed notification created & sent for user ${user.id}`,
      );
    } catch (notificationError) {
      this.logger.error(
        'Failed to create/send request pay failed notification:',
        notificationError,
      );
    }
  }

  /**
   * Handle request pay failed/error status
   */
  private async handleRequestPayFailed(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    this.logger.log(
      `Processing request pay failed: ${payload.id}, Error: ${payload.errorCode} - ${payload.description}, isProgression: ${context.isStatusProgression}`,
    );

    try {
      const user = await this.findUserByRequestPayId(payload.id);

      if (user) {
        webhookEvent.userId = user.id;
        await this.webhookEventRepository.save(webhookEvent);
      }
      // Determine failure reason based on error code
      let failureReason = 'Request pay failed';
      let actionType = 'request_pay_failed';

      if (payload.errorCode === 'M010') {
        failureReason = 'Request pay execution failed';
        actionType = 'request_pay_execution_failed';
      } else if (
        payload.errorCode === 'M021' &&
        payload.description === 'Cancelled'
      ) {
        failureReason = 'Request pay was cancelled';
        actionType = 'request_pay_cancelled';
      } else if (payload.description) {
        failureReason = payload.description;
      }

      if (context.isStatusProgression && context.previousStatus === 'OK') {
        // This is OK → FAILED progression, fail the existing PENDING transaction
        const existingTransaction =
          await this.cadTransactionService.getTransactionByExternalId(
            payload.id,
          );

        if (
          existingTransaction &&
          existingTransaction.status === TransactionStatus.PENDING
        ) {
          this.logger.log(
            `🔄 Failing existing PENDING transaction ID: ${existingTransaction.id}`,
          );

          // Fail the pending transaction (no wallet update needed)
          const failedTransaction =
            await this.cadTransactionService.failTransaction(
              existingTransaction.id,
              {
                failedAt: payload.date ? new Date(payload.date) : new Date(),
                failureReason: failureReason,
                metadata: {
                  errorCode: payload.errorCode,
                  errorDescription: payload.description,
                  aptPayStatus: payload.status,
                  failedPayload: payload,
                },
              },
            );

          this.logger.log(`❌ Failed transaction ID: ${failedTransaction.id}`);

          // Update payment request status
          const paymentRequest = await this.paymentRequestRepository.findOne({
            where: { aptPayTransactionId: payload.id },
          });

          if (paymentRequest) {
            paymentRequest.status = PaymentRequestStatus.FAILED;
            paymentRequest.failedAt = payload.date
              ? new Date(payload.date)
              : new Date();
            paymentRequest.failureReason = failureReason;
            // paymentRequest.errorCode = payload.errorCode; // Removed: Property does not exist
            paymentRequest.updatedAt = new Date();

            await this.paymentRequestRepository.save(paymentRequest);

            this.logger.log(
              `❌ Updated payment request ${payload.id} to FAILED`,
            );
          }

          return {
            status: 'processed',
            action: actionType,
            userId: user?.id,
            amount: parseFloat(payload.balance),
            transactionId: payload.id,
            transactionRecordId: failedTransaction.id,
            failureReason: failureReason,
            errorCode: payload.errorCode,
            errorDescription: payload.description,
            progressionHandled: true,
            note: 'PENDING transaction failed - no wallet impact as money was never credited',
          };
        }
      }

      console.log(payload, 'payload', payload.id);
      const existingTransaction =
        await this.cadTransactionService.getTransactionByExternalId(payload.id);

      console.log(existingTransaction, 'existingTransaction');
      const failedTransaction =
        await this.cadTransactionService.failTransaction(
          existingTransaction.id,
          {
            failedAt: payload.date ? new Date(payload.date) : new Date(),
            failureReason: failureReason,
            metadata: {
              errorCode: payload.errorCode,
              errorDescription: payload.description,
              aptPayStatus: payload.status,
              failedPayload: payload,
            },
          },
        );
      const cacheKey = `payment_request:${payload.id}`;
      const cachedDataString = await this.redisService.getKey(cacheKey);
      let cachedData = null;
      cachedData = JSON.parse(cachedDataString);

      await this.sendRequestPayFailedNotification(
        user,
        cachedData.amount,
        cachedData.senderEmail,
        failureReason,
      );

      this.logger.log(`❌ Failed transaction ID: ${failedTransaction.id}`);
    } catch (error) {
      this.logger.error('Error processing request pay failed:', error);
      throw error;
    }
  }

  /**
   * Find user by disbursement ID
   * You'll need to implement this based on how you store disbursement references
   */
  private async findUserByDisbursementId(
    disbursementId: string,
  ): Promise<User | null> {
    // TODO: Implement based on your transaction/disbursement storage
    // This could involve looking up in a transactions table by provider reference

    // Example implementation:
    // Example: Find the transaction event, then fetch the user by userId if present
    const event = await this.webhookEventRepository.findOne({
      where: { aptPayId: disbursementId },
    });

    if (event && event.userId) {
      const user = await this.userRepository.findOne({
        where: { id: event.userId },
      });
      if (user) {
        return user;
      }
    }

    this.logger.warn(
      `findUserByDisbursementId not implemented for ID: ${disbursementId}`,
    );
    return null;
  }

  /**
   * Find user by request pay ID
   * You'll need to implement this based on how you store request pay references
   */
  private async findUserByRequestPayId(
    requestPayId: string,
  ): Promise<User | null> {
    // TODO: Implement based on your payment request storage
    // This could involve looking up in a payment_requests table by provider reference

    // Example implementation:
    const paymentRequest = await this.paymentRequestRepository.findOne({
      where: { aptPayTransactionId: requestPayId },
      relations: ['user'],
    });
    return paymentRequest?.user || null;
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(days: number = 7): Promise<any> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const totalEvents = await this.webhookEventRepository.count({
      where: {
        receivedAt: { $gte: since } as any,
      },
    });

    const processedEvents = await this.webhookEventRepository.count({
      where: {
        processingStatus: 'processed',
        receivedAt: { $gte: since } as any,
      },
    });

    const failedEvents = await this.webhookEventRepository.count({
      where: {
        processingStatus: 'failed',
        receivedAt: { $gte: since } as any,
      },
    });

    const eventsByEntity = await this.webhookEventRepository
      .createQueryBuilder('event')
      .select(['event.entity', 'event.status', 'COUNT(*) as count'])
      .where('event.receivedAt >= :since', { since })
      .groupBy('event.entity, event.status')
      .getRawMany();

    return {
      totalEvents,
      processedEvents,
      failedEvents,
      pendingEvents: totalEvents - processedEvents - failedEvents,
      successRate:
        totalEvents > 0 ? (processedEvents / totalEvents) * 100 : 100,
      eventsByEntity,
      period: `${days} days`,
    };
  }

  /**
   * Handle identity verification webhooks
   */
  private async handleIdentityVerification(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    const { status, data } = payload;
    const verificationId = data.id;
    const userEmail = data.email;

    this.logger.log(
      `Processing identity verification: ${verificationId} - Status: ${status}`,
    );

    try {
      const emailHash = this.encryptionService.hash(userEmail);
      const user = await this.userRepository.findOne({
        where: { emailHash },
      });

      if (!user) {
        this.logger.warn(`User not found for email: ${userEmail}`);
        return {
          status: 'error',
          message: 'User not found',
          email: userEmail,
        };
      }

      // Update webhook event with user ID
      webhookEvent.userId = user.id;
      await this.webhookEventRepository.save(webhookEvent);

      // Route to specific handler based on status
      switch (status) {
        case 'PAYEE_VERIFICATION_COMPLETED':
          return await this.handleIdentityVerificationCompleted(
            payload,
            webhookEvent,
            context,
          );

        case 'PAYEE_VERIFICATION_FAILED':
          return await this.handleIdentityVerificationFailed(
            payload,
            webhookEvent,
            context,
          );

        default:
          this.logger.warn(
            `Unknown identity verification status: ${status} for ID: ${verificationId}`,
          );
          return {
            status: 'unhandled',
            verificationStatus: status,
            message: `Identity verification status ${status} not implemented`,
          };
      }
    } catch (error) {
      this.logger.error('Error processing identity verification:', error);
      throw error;
    }
  }

  /**
   * Handle successful identity verification
   */
  private async handleIdentityVerificationCompleted(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    const { data } = payload;
    const verificationData = data.data; // Document data
    const faceData = data.face;
    const authenticationData = data.authentication;

    this.logger.log(
      `✅ Processing successful identity verification for user: ${webhookEvent.userId}`,
    );

    this.logger.log(
      `✅ Processing successful identity payload for user: ${payload.data}`,
    );

    try {
      // Find existing verification record (could be PENDING from initiation)
      let identityVerification =
        await this.identityVerificationRepository.findOne({
          where: {
            aptPayVerificationId: webhookEvent.aptPayId.toString(),
          },
        });

      // console.log(identityVerification, 'verification');

      if (identityVerification && identityVerification.status === 'VERIFIED') {
        this.logger.warn(
          `Identity verification already completed for user: ${webhookEvent.userId}`,
        );
        return {
          status: 'duplicate',
          message: 'Identity verification already completed',
          userId: webhookEvent.userId,
        };
      }

      // Calculate processing duration if we have initiation time
      let processingDuration: number | undefined;
      if (identityVerification?.verificationMetadata?.initiatedAt) {
        const initiatedAt = new Date(
          identityVerification.verificationMetadata.initiatedAt,
        );
        const completedAt = new Date();
        processingDuration = Math.floor(
          (completedAt.getTime() - initiatedAt.getTime()) / 1000,
        );
      }

      // Create or update identity verification record
      if (!identityVerification) {
      } else {
        // Update existing pending record
        this.logger.log(
          `Updating existing verification record for user ${webhookEvent.userId}`,
        );

        identityVerification.status = IdentityVerificationStatus.VERIFIED;
        identityVerification.verifiedAt = new Date();
        identityVerification.documentData = {
          documentNumber: verificationData.documentNumber,
          firstName: verificationData.firstName,
          middleName: verificationData.middleName,
          lastName: verificationData.lastName,
          fullName: verificationData.fullName,
          dateOfBirth: verificationData.dob,
          address: {
            address1: verificationData.address1,
            address2: verificationData.address2,
            postcode: verificationData.postcode,
          },
          documentType: verificationData.documentType,
          nationality: verificationData.nationality_full,
          expiryDate: verificationData.expiry,
          issuedDate: verificationData.issued,
        };

        // Update metadata with completion info
        identityVerification.verificationMetadata = {
          ...identityVerification.verificationMetadata,
          completedAt: new Date().toISOString(),
          processingDuration: processingDuration,
        };

        identityVerification.rawData = payload;
        // identityVerification.webhookEventId = webhookEvent.id;
        identityVerification.updatedAt = new Date();
      }

      const savedVerification =
        await this.identityVerificationRepository.save(identityVerification);

      // Fetch user to get phoneNumber for onboarding tracking
      const user = await this.userRepository.findOne({
        where: { id: identityVerification.userId },
      });

      if (user.phoneNumber) {
        // 🔥 UPDATE ONBOARDING PROGRESS based on verification result
        // Verification successful
        await this.onboardingTrackingService.markVerificationSuccess(
          user?.phoneNumber,
        );
      }
      //  if (payload.data.success === 1) {
      // const user = await this.userRepository.findOne({
      //   where: { verification_id: String(webhookEvent.aptPayId) },
      // });
      if (user) {
        await this.userRepository.update(user.id, {
          kycStatus: 'SUCCESS',
        });
      }
      // }

      // Send success notification
      await this.sendIdentityVerificationSuccessNotification(
        identityVerification.userId,
        verificationData.fullName,
      );

      return {
        status: 'processed',
        action: 'identity_verification_completed',
        userId: webhookEvent.userId,
        verificationId: data.id,
        verificationRecordId: savedVerification.id,
        documentType: verificationData.documentType,
        fullName: verificationData.fullName,
        // faceMatch: faceData.isIdentical,
        // faceConfidence: faceData.confidence,
        // authenticationScore: authenticationData.score,
        processingDuration: processingDuration,
        wasPreExisting: !!identityVerification,
        userUpdated: true,
        message: 'Identity verification completed successfully',
      };
    } catch (error) {
      this.logger.error(
        'Error processing identity verification success:',
        error,
      );
      throw error;
    }
  }

  /**
   * Handle failed identity verification
   */
  private async handleIdentityVerificationFailed(
    payload: any,
    webhookEvent: AptPayWebhookEvent,
    context: any,
  ): Promise<any> {
    const { data } = payload;
    const failReason = data.failReason;
    const failCode = data.failCode;

    try {
      // Check if verification record already exists
      let identityVerification =
        await this.identityVerificationRepository.findOne({
          where: {
            aptPayVerificationId: webhookEvent.aptPayId.toString(),
          },
        });

      if (!identityVerification) {
      } else {
        // Update existing record
        identityVerification.status = IdentityVerificationStatus.FAILED;
        identityVerification.failedAt = new Date();
        identityVerification.failureReason = failReason;
        identityVerification.failureCode = failCode;
        identityVerification.rawData = payload;
        identityVerification.updatedAt = new Date();
      }

      const savedVerification =
        await this.identityVerificationRepository.save(identityVerification);

      this.logger.log(
        `❌ Updated user ${webhookEvent.userId} identity verification status to FAILED`,
      );

      const user = await this.userRepository.findOne({
        where: { id: identityVerification.userId },
      });
      // Verification failed
      await this.onboardingTrackingService.markVerificationFailed(
        user?.phoneNumber,
      );
      if (user) {
        await this.userRepository.update(user.id, {
          kycStatus: 'FAILED',
        });
      }
      // Send failure notification with guidance
      await this.sendIdentityVerificationFailureNotification(
        identityVerification.userId,
        failReason,
        failCode,
      );

      return {
        status: 'processed',
        action: 'identity_verification_failed',
        userId: webhookEvent.userId,
        verificationId: data.id,
        verificationRecordId: savedVerification.id,
        failureReason: failReason,
        failureCode: failCode,
        // faceMatch: data.face?.isIdentical || false,
        // faceConfidence: data.face?.confidence || '0',
        authenticationScore: data.authentication?.score || 0,
        userUpdated: true,
        message: 'Identity verification failed - user notified with next steps',
      };
    } catch (error) {
      this.logger.error(
        'Error processing identity verification failure:',
        error,
      );
      throw error;
    }
  }

  /**
   * Send success notification for identity verification
   */
  private async sendIdentityVerificationSuccessNotification(
    userId: number,
    fullName: string,
  ): Promise<void> {
    try {
      console.log(
        `Sending identity verification success notification to user ${userId}`,
      );
      // Fetch user by ID to get
      // FCM token
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user?.fcmToken) {
        await this.firebaseService.sendPushNotification(user.fcmToken, {
          title: '🎉 Identity Verified!',
          body: `Welcome ${fullName}! Your identity has been successfully verified. You now have full access to all features.`,
          data: {
            type: 'identity_verification_success',
            fullName: fullName,
            timestamp: new Date().toISOString(),
            action: 'navigate_to_dashboard',
          },
        });

        this.logger.log(
          `📱 Sent identity verification success notification to user ${user.id}`,
        );
      }

      // You could also send an email here
      // await this.emailService.sendIdentityVerificationSuccessEmail(user, fullName);
    } catch (notificationError) {
      this.logger.error(
        'Failed to send identity verification success notification:',
        notificationError,
      );
    }
  }

  /**
   * Send failure notification for identity verification with guidance
   */
  private async sendIdentityVerificationFailureNotification(
    userId: number,
    failReason: string,
    failCode: number,
  ): Promise<void> {
    try {
      // Provide specific guidance based on failure reason
      let guidance =
        'Please try again with a clear photo of your document and face.';
      let title = '⚠️ Identity Verification Failed';

      switch (failCode) {
        case 3: // Face mismatch
          guidance =
            "The face photo doesn't match your document. Please ensure good lighting and that your face is clearly visible.";
          title = '⚠️ Face Verification Failed';
          break;
        case 1: // Document issues
          guidance =
            "There was an issue with your document. Please ensure it's clear, not expired, and all information is visible.";
          title = '⚠️ Document Verification Failed';
          break;
        case 2: // Authentication failed
          guidance =
            'Document authentication failed. Please use an original, unedited document photo.';
          title = '⚠️ Document Authentication Failed';
          break;
        default:
          guidance = `${failReason} Please contact support if you need assistance.`;
      }
      // Fetch user by ID to get FCM token
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user?.fcmToken) {
        await this.firebaseService.sendPushNotification(user.fcmToken, {
          title: title,
          body: guidance,
          data: {
            type: 'identity_verification_failed',
            failReason: failReason,
            failCode: failCode.toString(),
            guidance: guidance,
            timestamp: new Date().toISOString(),
            action: 'retry_verification',
          },
        });

        this.logger.log(
          `📱 Sent identity verification failure notification to user ${user.id}`,
        );
      }

      // You could also send an email here
      // await this.emailService.sendIdentityVerificationFailureEmail(user, failReason, guidance);
    } catch (notificationError) {
      this.logger.error(
        'Failed to send identity verification failure notification:',
        notificationError,
      );
    }
  }
}
