// src/auth/services/auth.service.ts

import {
  Body,
  Headers,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { CustomTooManyRequestsException } from '../../common/exceptions/custom-too-many-requests.exception';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User, UserRole } from '../../auth/entities/user.entity';

import * as bcrypt from 'bcryptjs'; // Updated import to 'bcryptjs'
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { LoggerService } from '../../common/logger/logger.service'; // Updated import
import axios from 'axios';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { IsArray } from 'class-validator';
import { AuthService } from 'src/auth/services/auth.service';
import { WalletFactory } from 'src/wallets/factories/wallet.factory';
import { NGNWalletEntity } from 'src/wallets/entities/NGNwallet.entity';
import {
  TransactionCurrency,
  TransactionEntity,
  TransactionStatus,
  TransactionType,
} from 'src/wallets/entities/transaction.entity';
import { FirebaseService } from 'src/firebase/firebase.service';
import { Notification } from 'src/notifications/entities/notification.entity';
import { OnboardingTrackingService } from 'src/auth/services/onboardingTrackingService';
import { EncryptionService } from 'src/common/encryption/encryption.service';

@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(NGNWalletEntity)
    private ngnWalletRepository: Repository<NGNWalletEntity>,
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>,

    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,

    private authService: AuthService,
    private readonly firebaseService: FirebaseService,
    private readonly onboardingTrackingService: OnboardingTrackingService,
    private readonly encryptionService: EncryptionService,
    private readonly logger: LoggerService, // Updated Logger Injection
    private readonly walletFactory: WalletFactory, // Add the walletFactory property
  ) {}

  /**
   * Processes Sumsub KYC webhook
   * @param data - Webhook request payload
   * @returns
   * @throws ConflictException if a user with the provided phone number already exists.
   */
  async processKycWebhook(
    @Headers('x-payload-digest') signature: string,
    @Body() data: any,
  ) {
    // const jsonString = data.toString(); // Convert buffer to string
    const dataObject = data; // Parse string into JSON object
    this.logger.log(
      `Webhook From Sumsub - Validate Webhook: ${data}`,
      'AuthService',
    );

    if (!data) {
      this.logger.log(
        `Webhook From Sumsub - Validate Webhook - Invalid Data`,
        'AuthService',
      );
      return;
    }

    if (data && typeof data !== 'object') {
      this.logger.log(
        `Webhook From Sumsub - Validate Webhook - Invalid Data`,
        'AuthService',
      );
      return;
    }

    const validKeys = ['applicantId', 'type', 'reviewStatus'];

    if (!validKeys.every((key) => dataObject.hasOwnProperty(key))) {
      this.logger.log(
        `Webhook From Sumsub - Missing Valid Keys`,
        'AuthService',
      );
      return;
    }

    //if applicantId, search for user by applicantId
    //if user is not found, check if externalUserId exists.
    //if externalUserId does not exist, terminate.
    //if externalUserId exists, update user Id with applicant Id
    let user: User | null = null;

    let findUser = await this.authService.findUserById(
      Number(dataObject.externalUserId),
    );

    this.logger.log(`logUSer: ${findUser}`);

    if (!findUser) {
      this.logger.log(
        'error',
        `Data: {data: ${JSON.stringify(
          user,
        )}, Message - User not found. Check if externalUserId exists `,
      );

      if (!dataObject.externalUserId) {
        this.logger.log(
          'error',
          `Data: {data: ${JSON.stringify(
            user,
          )}, Message - User not found. externalUserId does not exist. There's no way to map applicantId to a valid user`,
        );

        return;
      }

      user = await this.authService.updateApplicantId(
        dataObject.externalUserId,
        dataObject.applicantId,
      );

      // throw new Error('User not found');
    } else {
      user = findUser;
    }

    if (!user) {
      this.logger.log(
        'error',
        `Data: {data: ${JSON.stringify(user)}, Message - User not found.`,
      );

      return;
    }

    const userId = user.id;

    console.log('userId', userId);
    console.log('dataObject', dataObject);

    if (
      dataObject &&
      dataObject.type === 'applicantReviewed' &&
      dataObject.reviewResult &&
      dataObject.reviewResult.reviewAnswer
    ) {
      const reviewAnswer = dataObject.reviewResult.reviewAnswer; //RED, GREEN
      if (reviewAnswer === 'RED') {
        const status = 'failed';
        let additionalInfo = '';
        if (dataObject.reviewResult.moderationComment) {
          additionalInfo = `${dataObject.reviewResult.moderationComment}`;
        }

        if (dataObject.reviewResult.clientComment) {
          additionalInfo =
            additionalInfo + ' ' + dataObject.reviewResult.clientComment;
        }

        if (
          dataObject.reviewResult.rejectLabels &&
          IsArray(dataObject.reviewResult.rejectLabels)
        ) {
          let errors = dataObject.reviewResult.rejectLabels.join(' ');
          additionalInfo = additionalInfo + ' ' + errors;
        }

        const ApplicantId = dataObject.applicantId;

        // Verification failed
        await this.onboardingTrackingService.markVerificationFailed(
          user?.phoneNumber,
        );
        if (user) {
          await this.usersRepository.update(user.id, {
            kycStatus: 'FAILED',
          });
        }

        // await this.authService.updateKycStatus({
        //   userId: userId,
        //   status,
        //   kycResponse: dataObject,
        //   additionalInfo,
        //   ApplicantId,
        // });

        return;
      } else if (reviewAnswer === 'GREEN') {
        try {
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
            await this.usersRepository.update(user.id, {
              kycStatus: 'SUCCESS',
            });
          }
          // await this.walletFactory.createWallet(
          //   Number(dataObject.externalUserId),
          // );
          // this.logger.log(
          //   `Wallet created successfully for user ${userId} after KYC verification`,
          //   'WebhookService',
          // );
        } catch (error) {
          this.logger.error(
            `Failed to create wallet for user ${userId}: ${error.message}`,
            'WebhookService',
          );
          // Note: We don't throw here to ensure KYC status is still updated
        }
        const status = dataObject.reviewStatus;
        const ApplicantId = dataObject.applicantId;

        const updateUserKYCStatus = await this.authService.updateKycStatus({
          userId: userId,
          status,
          kycResponse: dataObject,
          ApplicantId,
        });

        console.log('updateUserKYCStatus', updateUserKYCStatus);
        if (updateUserKYCStatus) {
          await this.authService.updateKycCompleted({
            userId: userId,
          });
        }

        return;
      }

      return;
    }

    await this.authService.updateKycStatus({
      userId: userId,
      status: data.reviewStatus,
      kycResponse: dataObject,
      ApplicantId: data.applicantId,
    });

    return;
  }

  // Add this method to your DotBankService

  /**
   * Process virtual account notification
   * @param notification Notification data from DotBank webhook
   */
  async processVirtualAccountNotification(notification: any) {
    try {
      this.logger.log(
        `Processing virtual account notification: ${JSON.stringify(notification)}`,
      );

      // Validate required fields
      if (
        !notification.reference ||
        !notification.accountNo ||
        !notification.status
      ) {
        throw new Error('Missing required fields in notification');
      }

      // Find the wallet by account number

      const accountNumberHash = this.encryptionService.hash(
        notification.accountNo,
      );
      const wallet = await this.ngnWalletRepository.findOne({
        where: { accountNumberHash },
      });

      if (!wallet) {
        throw new Error(
          `No wallet found for account number: ${notification.accountNo}`,
        );
      }
      // // Example usage
      // const narration = "DOT VT(127): CR|FRM FEENIP-INWARD";
      const senderNarration = await this.extractSenderNarration(
        notification.narration,
      );
      // console.log(senderNarration); // Output: "FEENIP"
      // Only process READY status (new credit transaction)
      if (notification.status === 'READY') {
        // Create transaction record
        const transaction = this.transactionRepository.create({
          userId: wallet.userId,
          ngnWalletId: wallet.id,
          type: TransactionType.CREDIT,
          amount: notification.amount || 0,
          fee: 0, // No fee for incoming transfers
          currency: TransactionCurrency.NGN,
          status: TransactionStatus.COMPLETED,
          reference: notification.reference,
          referenceHash: this.encryptionService.hash(notification.reference),
          externalReference: notification.externalId || notification.reference,
          externalReferenceHash: this.encryptionService.hash(
            notification.externalId || notification.reference,
          ),
          description: senderNarration || 'Virtual account credit',
          completedAt: new Date(),
          metadata: notification,
        });

        // Save the transaction
        await this.transactionRepository.save(transaction);

        // Update wallet balance
        const payloadAmount = String(notification.amount);
        const amount = parseFloat(payloadAmount.replace(/,/g, ''));
        const currentBalance = parseFloat(wallet.balance.toString());
        const amountToAdd = parseFloat(amount.toString());
        // Calculate new balance
        const newBalance = currentBalance + amountToAdd;
        // Update wallet balance
        wallet.balance = newBalance;
        await this.ngnWalletRepository.save(wallet);
        // wallet.balance += parseFloat(notification.amount) || 0;

        // Format amount for notification
        const formattedAmount = new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(amount);

        // Create notification message based on narration
        const sender = senderNarration ? ` from ${senderNarration}` : '';
        const notificationTitle = 'Wallet Credited';
        const notificationBody = `Your wallet has been credited with ${formattedAmount}${sender}.`;

        // 1. Create notification in database
        try {
          const debitNotification = await this.notificationRepository.create({
            userId: wallet.userId,
            title: notificationTitle,
            body: notificationBody,
            currency: 'NGN',
            data: {
              type: 'wallet_credit',
              transactionId: transaction.id,
              amount: amount.toString(),
              currency: 'NGN',
              reference: notification.reference,
              sender: senderNarration || 'Unknown',
              timestamp: new Date().toISOString(),
            },
            action: '/wallet', // Deep link to wallet screen
            isSent: false, // Will be updated if push is sent
          });
          await this.notificationRepository.save(debitNotification);
          this.logger.log(
            `Database notification created for wallet credit: ${notification.accountNo}, amount: ${notification.amount}`,
          );
        } catch (dbNotificationError) {
          this.logger.error(
            `Failed to create database notification: ${dbNotificationError.message}`,
          );
          // Continue processing even if database notification fails
        }

        // 2. Send push notification separately
        try {
          // Get user to retrieve FCM token
          const user = await this.authService.findUserById(wallet.userId);

          if (user && user.fcmToken) {
            // Send push notification
            const notificationPayload = {
              notification: {
                title: notificationTitle,
                body: notificationBody,
              },
              data: {
                type: 'wallet_credit',
                amount: amount.toString(),
                currency: 'NGN',
                reference: notification.reference,
                sender: senderNarration || 'Unknown',
                timestamp: new Date().toISOString(),
              },
              token: user.fcmToken,
            };

            const pushResult =
              await this.firebaseService.notifyByPush(notificationPayload);

            this.logger.log(
              `Push notification ${pushResult.status ? 'sent' : 'failed'} for wallet credit: ${notification.accountNo}`,
            );
          } else {
            this.logger.log(
              `No FCM token found for user ID ${wallet.userId}, skipping push notification`,
            );
          }
        } catch (pushNotificationError) {
          this.logger.error(
            `Failed to send push notification: ${pushNotificationError.message}`,
          );
          // Continue processing even if push notification fails
        }
        this.logger.log(
          `Successfully processed credit transaction for account ${notification.accountNo}, amount: ${notification.amount}`,
        );
      } else {
        this.logger.log(
          `Ignoring notification with status: ${notification.status}`,
        );
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to process virtual account notification: ${error.message}`,
      );
      throw error;
    }
  }

  // Extract the narration from the sender
  async extractSenderNarration(fullNarration: string): Promise<string> {
    // Check if the narration contains FRM marker
    if (fullNarration.includes('FRM')) {
      // Split by FRM and get the part after it
      const parts = fullNarration.split('FRM ');
      if (parts.length > 1) {
        // If you want just the first word after FRM
        return parts[1].split('-')[0]; // This would give "FEENIP"

        // If you want everything after FRM
        // return parts[1]; // This would give "FEENIP-INWARD"
      }
    }

    // Return empty string or original narration if FRM not found
    return '';
  }

  // // Example usage
  // const narration = "DOT VT(127): CR|FRM FEENIP-INWARD";
  // const senderNarration = extractSenderNarration(narration);
  // console.log(senderNarration); // Output: "FEENIP"
}
