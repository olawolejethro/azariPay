import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AptPayService } from '../services/aptPay.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AuthService } from 'src/auth/services/auth.service';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Repository } from 'typeorm';
import {
  PaymentRequestEntity,
  PaymentRequestStatus,
} from '../entities/payment-request.entity';
import { DisbursementEntity } from '../entities/disbursement.entity';
import {
  TransactionCurrency,
  TransactionEntity,
  TransactionSource,
  TransactionType,
} from '../entities/transaction.entity';
import { TransactionService } from '../services/transaction.service';
import { CADWalletEntity } from '../entities/CADwallet.entity';
import { RedisService } from 'src/common/redis/redis.service';
import e from 'express';
import { PagaService } from '../services/paga.service';
import { OnboardingTrackingService } from 'src/auth/services/onboardingTrackingService';
import {
  IdentityVerificationEntity,
  IdentityVerificationStatus,
} from '../entities/identity-verification.entity';
import { BeneficiaryEntity } from '../entities/beneficiary.entity';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { RateLimit } from 'src/common/decorators/rate-limit.decorator';
import { RateLimitTier } from 'src/common/config/rate-limit.config';
import { RateLimitGuard } from 'src/auth/guards/rate-limit.guard';
import { EncryptionService } from 'src/common/encryption/encryption.service';

@Controller('api/v1/Aptpay')
export class AptPayController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PaymentRequestEntity)
    private readonly reqPayRepo: Repository<PaymentRequestEntity>,
    @InjectRepository(DisbursementEntity)
    private readonly disbursementRepository: Repository<DisbursementEntity>,
    @InjectRepository(BeneficiaryEntity)
    private readonly beneficiaryRepository: Repository<BeneficiaryEntity>, // Assuming you have a Beneficiary entity similar to PaymentRequestEntity
    @InjectRepository(CADWalletEntity)
    private readonly cadWalletRepository: Repository<CADWalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(IdentityVerificationEntity)
    private readonly identityVerificationRepository: Repository<IdentityVerificationEntity>,
    private readonly redisService: RedisService,
    private aptPayService: AptPayService,
    private readonly notificationService: NotificationsService,
    private userService: AuthService,
    private readonly transactionService: TransactionService,
    private readonly encryptionService: EncryptionService,
    private readonly pagaService: PagaService,
    private readonly onboardingTrackingService: OnboardingTrackingService, // Replace with actual service if available
  ) {}

  @Post('identity')
  @UseGuards(JwtAuthGuard)
  async createIdentity(@Req() request) {
    const userId = request.user.userId;
    return this.aptPayService.createAptPayIdentity(userId);
  }

  // For testing/debugging - get the payload without submitting
  @Get('identity-payload')
  @UseGuards(JwtAuthGuard)
  async getIdentityPayload(@Req() request) {
    const userId = request.user.UserId;
    return this.aptPayService.prepareIdentityPayload(userId);
  }

  @Put('identity')
  @UseGuards(JwtAuthGuard)
  async updateIdentity(@Req() request, @Body() updateData: any) {
    const userId = request.user.id;

    // Get the user to find their AptPay identity ID
    const user = await this.userService.findUserById(userId);

    if (!user.aptPayIdentityId) {
      throw new BadRequestException('No AptPay identity exists for this user');
    }

    // Call the service to update the identity
    return this.aptPayService.updateIdentity(user.aptPayIdentityId, updateData);
  }

  @Get('identities')
  @UseGuards(JwtAuthGuard)
  //   @Roles('ADMIN') // Make sure only admins can access all identities
  async getIdentities() {
    return this.aptPayService.getIdentities();
  }

  @Post('request')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(RateLimitTier.SENSITIVE)
  async createPaymentRequest(
    @Req() request,
    @Body()
    transferDto: any & { pin?: string; payload?: string; signature?: string },
  ) {
    const userId = request.user.userId;
    let pendingTransaction = null;

    try {
      // Get the user to find their AptPay identity ID
      const user = await this.userService.findUserById(userId);

      // Check onboarding/KYC status
      const onboardingCompleted =
        user.pin !== null && user.kycStatus === 'SUCCESS';

      if (!onboardingCompleted) {
        throw new BadRequestException(
          'Onboarding not completed. Please complete KYC before requesting payments.',
        );
      }
      if (!user.aptPayIdentityId) {
        throw new BadRequestException(
          'No AptPay identity exists for this user',
        );
      }
      // Require either PIN or signature for authentication
      const { pin, payload, signature, ...transferData } = transferDto;

      // Validate required fields and email format
      if (!transferData.amount || !transferData.senderEmail) {
        throw new BadRequestException(
          'Missing required fields: amount and senderEmail are required',
        );
      }

      // Validate email format
      if (!this.isValidEmail(transferData.senderEmail)) {
        throw new BadRequestException(
          'Invalid email format. Please provide a valid sender email address.',
        );
      }

      // Additional validations
      if (transferData.amount <= 0) {
        throw new BadRequestException(
          'Payment request amount must be greater than zero.',
        );
      }

      // *** NEW: Check deposit limits for payment requests ***
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      // Get start of week (Sunday)
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());

      // Get start of month
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Get end of month
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

      // Define deposit limits based on your UI
      const DAILY_DEPOSIT_LIMIT = 3000; // CAD
      const WEEKLY_DEPOSIT_LIMIT = 5000; // CAD
      const MONTHLY_DEPOSIT_LIMIT = 20000; // CAD

      // Check daily deposit requests (CREDIT transactions)
      const dailyDeposits = await this.transactionRepository
        .createQueryBuilder('transaction')
        .where('transaction.userId = :userId', { userId: user.id })
        .andWhere('transaction.type = :type', { type: TransactionType.CREDIT })
        .andWhere('transaction.currency = :currency', {
          currency: TransactionCurrency.CAD,
        })

        .andWhere('transaction.createdAt >= :today', { today })
        .andWhere('transaction.createdAt < :tomorrow', { tomorrow })
        // .andWhere('transaction.status IN (:...statuses)', {
        //   statuses: ['COMPLETED', 'PENDING']
        // })
        .select('SUM(transaction.amount)', 'sum')
        .getRawOne();

      const dailyRequested = parseFloat(dailyDeposits.sum) || 0;

      // Check weekly deposit requests
      const weeklyDeposits = await this.transactionRepository
        .createQueryBuilder('transaction')
        .where('transaction.userId = :userId', { userId: user.id })
        .andWhere('transaction.type = :type', { type: TransactionType.CREDIT })
        .andWhere('transaction.currency = :currency', {
          currency: TransactionCurrency.CAD,
        })

        .andWhere('transaction.createdAt >= :startOfWeek', { startOfWeek })
        .andWhere('transaction.createdAt < :tomorrow', { tomorrow })
        // .andWhere('transaction.status IN (:...statuses)', {
        //   statuses: ['COMPLETED', 'PENDING']
        // })
        .select('SUM(transaction.amount)', 'sum')
        .getRawOne();

      const weeklyRequested = parseFloat(weeklyDeposits.sum) || 0;

      // Check monthly deposit requests
      const monthlyDeposits = await this.transactionRepository
        .createQueryBuilder('transaction')
        .where('transaction.userId = :userId', { userId: user.id })
        .andWhere('transaction.type = :type', { type: TransactionType.CREDIT })
        .andWhere('transaction.currency = :currency', {
          currency: TransactionCurrency.CAD,
        })

        .andWhere('transaction.createdAt >= :startOfMonth', { startOfMonth })
        .andWhere('transaction.createdAt < :endOfMonth', { endOfMonth })
        // .andWhere('transaction.status IN (:...statuses)', {
        //   statuses: ['COMPLETED', ]
        // })
        .select('SUM(transaction.amount)', 'sum')
        .getRawOne();

      const monthlyRequested = parseFloat(monthlyDeposits.sum) || 0;

      // Check daily deposit limit
      if (dailyRequested + transferData.amount > DAILY_DEPOSIT_LIMIT) {
        throw new BadRequestException(
          `Daily deposit limit of $${DAILY_DEPOSIT_LIMIT.toLocaleString()} CAD exceeded. You have already requested/received $${dailyRequested.toLocaleString()} CAD today.`,
        );
      }

      // Check weekly deposit limit
      if (weeklyRequested + transferData.amount > WEEKLY_DEPOSIT_LIMIT) {
        throw new BadRequestException(
          `Weekly deposit limit of $${WEEKLY_DEPOSIT_LIMIT.toLocaleString()} CAD exceeded. You have already requested/received $${weeklyRequested.toLocaleString()} CAD this week.`,
        );
      }

      // Check monthly deposit limit
      if (monthlyRequested + transferData.amount > MONTHLY_DEPOSIT_LIMIT) {
        throw new BadRequestException(
          `Monthly deposit limit of $${MONTHLY_DEPOSIT_LIMIT.toLocaleString()} CAD exceeded. You have already requested/received $${monthlyRequested.toLocaleString()} CAD this month.`,
        );
      }
      // *** END: Deposit limit checks ***

      if (!pin && !signature) {
        throw new BadRequestException(
          'Authentication required. Please provide a PIN or biometrics.',
        );
      }

      let isAuthenticated = false;

      if (pin) {
        const isPinValid = await this.pagaService.verifyTransactionPin(
          userId,
          pin,
        );
        if (isPinValid) {
          isAuthenticated = true;
        } else {
          throw new UnauthorizedException('Incorrect transaction PIN.');
        }
      }

      if (signature) {
        try {
          const isSignatureValid = await this.userService.verifyUserSignature(
            userId,
            payload,
            signature,
          );
          if (isSignatureValid) {
            isAuthenticated = true;
          } else {
            throw new UnauthorizedException('Invalid biometrics.');
          }
        } catch (error) {
          if (!isAuthenticated) {
            throw new UnauthorizedException(
              'biometrics verification failed: ' + error.message,
            );
          }
        }
      }

      if (!isAuthenticated) {
        throw new UnauthorizedException('Authentication failed.');
      }
      // Get user's CAD wallet
      const wallet = await this.cadWalletRepository.findOne({
        where: { userId: user.id },
      });

      if (!wallet) {
        throw new BadRequestException(
          `No CAD wallet found for user ID: ${user.id}`,
        );
      }

      const currentBalance = parseFloat(wallet.balance.toString());
      const firstName = user.firstName || 'User';
      const lastName = user.lastName || 'User';

      // Generate a unique reference ID
      const referenceId = `req-pay-${userId}-${Date.now()}`;

      // Create the Request Pay transaction in AptPay
      const result = await this.aptPayService.createRequestPayTransaction({
        amount: transferData.amount,
        identityId: user.aptPayIdentityId,
        referenceId,
        email: transferData.senderEmail, // Pass the sender's email
        firstName,
        lastName,
      });

      pendingTransaction =
        await this.transactionService.createPendingTransaction({
          userId: user.id,
          type: TransactionType.CREDIT, // This is money we expect to receive
          amount: transferData.amount,
          currency: TransactionCurrency.CAD,
          cadWalletId: wallet.id,
          source: TransactionSource.REQUEST_PAY_RECEIVED, // You may need to add this source
          description: `Payment request from ${transferData.senderEmail} - $${transferDto.amount}`,
          reference: referenceId,
          referenceHash: this.encryptionService.hash(referenceId),
          externalTransactionId: result.transactionId, // Will be updated with AptPay transaction ID
          metadata: {
            senderEmail: transferData.senderEmail,
            requestedAmount: transferData.amount,
            balanceBefore: currentBalance,
            requestInitiatedAt: new Date().toISOString(),
            transactionPhase: 'request_created',
            paymentRequestType: 'interac_request',
            firstName: firstName,
            lastName: lastName,
            // Add limit tracking to metadata
            dailyDepositUsage: dailyRequested,
            weeklyDepositUsage: weeklyRequested,
            monthlyDepositUsage: monthlyRequested,
          },
        });

      // Cache payment request data in Redis with AptPay transaction ID as key
      const cacheKey = `payment_request:${result.transactionId}`;
      const cacheData = {
        userId: user.id,
        amount: transferData.amount,
        walletId: wallet.id,
        transactionId: pendingTransaction.id,
        senderEmail: transferData.senderEmail,
        referenceId: result.referenceId,
        balanceBefore: currentBalance,
        createdAt: new Date().toISOString(),
        status: 'PENDING',
      };

      // Cache for 30 days (payment requests can take time to be fulfilled)
      await this.redisService.setKey(
        cacheKey,
        JSON.stringify(cacheData),
        30 * 24 * 60 * 60,
      );

      // Create a local record of the request
      const requestRecord = await this.reqPayRepo.save({
        userId,
        amount: transferData.amount,
        senderEmail: transferData.senderEmail,
        aptPayTransactionId: result.transactionId,
        referenceId: result.referenceId,
        status: PaymentRequestStatus.PENDING,
      });

      return {
        success: true,
        transactionId: result.transactionId,
        referenceId: result.referenceId,
        status: 'PENDING',
        message: 'Payment request created successfully',
        uiData: {
          successScreen: {
            title: 'Request sent',
            description: `You have successfully requested a payment of $${transferData.amount} from ${transferData.senderEmail}.`,
          },
        },
      };
    } catch (error) {
      // Log the error and throw a user-friendly exception
      console.error('Payment request creation failed:', JSON.stringify(error));
      if (error.response && error.response.data) {
        // If AptPay returned a specific error message
        throw new BadRequestException(
          error.response.data.message || 'Failed to create payment request',
        );
      }
      throw new InternalServerErrorException(
        error.message || 'Failed to create payment request',
      );
    }
  }
  /**
   * Generates a unique reference ID for APT Pay transactions
   * Format: refid + timestamp + random string
   */
  private generateReferenceId(): string {
    const timestamp = Date.now().toString();
    const randomStr = Math.random().toString(36).substring(2, 10);
    return `refid${timestamp}${randomStr}`;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }

  private generateNumericTransactionId(): string {
    const timestamp = Date.now(); // Current timestamp in milliseconds
    const randomSuffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0'); // 3-digit random number
    return `${timestamp}${randomSuffix}`;
  }
  @Post('transfer')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(RateLimitTier.SENSITIVE)
  async transferFunds(
    @Req() request,
    @Body()
    transferDto: any & {
      pin?: string;
      payload?: string;
      signature?: string;
    },
  ) {
    const userId = request.user.userId;

    // Get the user to extract their AptPay identity ID
    const user = await this.userService.findUserById(userId);
    if (!user.aptPayIdentityId) {
      throw new BadRequestException('No AptPay identity exists for this user');
    }

    // Check onboarding/KYC status
    const onboardingCompleted =
      user.pin !== null && user.kycStatus === 'SUCCESS';

    if (!onboardingCompleted) {
      throw new BadRequestException(
        'Onboarding not completed. Please complete KYC before transfering funds.',
      );
    }

    // Extract authentication fields from transferData
    const { pin, payload, signature, ...transferData } = transferDto;

    // Validate required fields and email format
    if (
      !transferData.amount ||
      !transferData.interacEmail ||
      !transferData.recipientName
    ) {
      throw new BadRequestException(
        'Missing required fields: amount, interacEmail, and recipientName are required',
      );
    }

    // Validate email format
    if (!this.isValidEmail(transferData.interacEmail)) {
      throw new BadRequestException(
        'Invalid email format. Please provide a valid Interac email address.',
      );
    }

    // Additional validations
    if (transferData.amount <= 0) {
      throw new BadRequestException(
        'Transfer amount must be greater than zero.',
      );
    }

    if (transferData.recipientName.trim().length < 2) {
      throw new BadRequestException(
        'Recipient name must be at least 2 characters long.',
      );
    }

    // Validate that either PIN or (payload AND signature) is provided
    if (!pin && !(payload && signature)) {
      throw new BadRequestException(
        'Authentication required. Please provide a PIN or a valid biometrics.',
      );
    }

    let isAuthenticated = false;

    // Authentication logic (PIN or signature verification)
    if (pin) {
      const isPinValid = await this.pagaService.verifyTransactionPin(
        userId,
        pin,
      );
      if (isPinValid) {
        isAuthenticated = true;
      } else {
        throw new UnauthorizedException(
          'Incorrect transaction PIN. Please try again with the correct PIN.',
        );
      }
    }

    if (payload && signature) {
      try {
        const isSignatureValid = await this.userService.verifyUserSignature(
          userId,
          payload,
          signature,
        );

        if (isSignatureValid) {
          isAuthenticated = true;
        } else {
          throw new UnauthorizedException(
            'Invalid biometrics. Please ensure you are using a registered device.',
          );
        }
      } catch (error) {
        if (!isAuthenticated) {
          throw new UnauthorizedException(
            'Signature verification failed: ' + error.message,
          );
        }
      }
    }

    if (!isAuthenticated) {
      throw new UnauthorizedException(
        'Authentication failed. Please provide valid credentials.',
      );
    }
    // Track failed authentication attempts in Redis
    const authFailKey = `aptpay:authfail:${user.id}`;
    const maxAttempts = 3;
    const lockDuration = 60 * 60; // 1 hour in seconds

    // Check if account is locked
    const lockKey = `aptpay:locked:${user.id}`;
    const isLocked = await this.redisService.getKey(lockKey);
    if (isLocked) {
      throw new UnauthorizedException(
        'Your account is temporarily locked due to multiple failed authentication attempts. Please try again after 1 hour.',
      );
    }

    // If authentication failed, increment the fail counter
    if (!isAuthenticated) {
      const failCount =
        parseInt((await this.redisService.getKey(authFailKey)) || '0', 10) + 1;
      await this.redisService.setKey(
        authFailKey,
        failCount.toString(),
        lockDuration,
      );

      if (failCount >= maxAttempts) {
        // Lock the account for 1 hour
        await this.redisService.setKey(lockKey, 'locked', lockDuration);

        // Optionally, update user status in DB (e.g., user.isLocked = true)
        await this.userRepository.update(user.id, { isLocked: true });

        // Send email notification
        try {
          await this.notificationService.sendEmail(
            user.interacEmailAddress,
            'Account Locked Due to Failed Authentication Attempts',
            `Your account has been locked for ${lockDuration / 60} minutes due to too many failed authentication attempts. If this wasn't you, please reset your password or contact support.`,
            `<p>Your account has been <b>locked for ${lockDuration / 60} minutes</b> due to too many failed authentication attempts.<br>If this wasn't you, please reset your password or contact support.</p>`,
          ); // duration in minutes
        } catch (e) {
          console.error('Failed to send account lock email:', e);
        }

        throw new UnauthorizedException(
          'Too many failed authentication attempts. Your account has been locked for 1 hour.',
        );
      } else {
        throw new UnauthorizedException(
          `Authentication failed. You have ${maxAttempts - failCount} attempts left before your account is locked.`,
        );
      }
    } else {
      // On successful authentication, reset the fail counter
      await this.redisService.deleteKey(authFailKey);
      await this.redisService.deleteKey(lockKey);
      await this.userRepository.update(user.id, { isLocked: false });
    }
    // Get user's CAD wallet and check balance
    const wallet = await this.cadWalletRepository.findOne({
      where: { userId: user.id },
    });

    if (!wallet) {
      throw new BadRequestException(
        `No CAD wallet found for user ID: ${user.id}`,
      );
    }

    const currentBalance = parseFloat(wallet.balance.toString());

    // Check transfer limits (Daily, Weekly, Monthly)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Get start of week (Sunday)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    // Get start of month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get end of month
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // Define limits based on your UI
    const DAILY_LIMIT = 3000; // CAD
    const WEEKLY_LIMIT = 5000; // CAD
    const MONTHLY_LIMIT = 20000; // CAD

    // Check daily transfers
    const dailyTransfers = await this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId: user.id })
      .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
      .andWhere('transaction.currency = :currency', {
        currency: TransactionCurrency.CAD,
      })
      .andWhere('transaction.createdAt >= :today', { today })
      .andWhere('transaction.createdAt < :tomorrow', { tomorrow })
      // .andWhere('transaction.status IN (:...statuses)', {
      //   statuses: ['COMPLETED', 'PENDING'],
      // })
      .select('SUM(transaction.amount)', 'sum')
      .getRawOne();

    const dailyTransferred = parseFloat(dailyTransfers.sum) || 0;

    // Check weekly transfers
    const weeklyTransfers = await this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId: user.id })
      .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
      .andWhere('transaction.currency = :currency', {
        currency: TransactionCurrency.CAD,
      })
      .andWhere('transaction.createdAt >= :startOfWeek', { startOfWeek })
      .andWhere('transaction.createdAt < :tomorrow', { tomorrow })
      // .andWhere('transaction.status IN (:...statuses)', {
      //   statuses: ['COMPLETED', 'PENDING'],
      // })
      .select('SUM(transaction.amount)', 'sum')
      .getRawOne();

    const weeklyTransferred = parseFloat(weeklyTransfers.sum) || 0;

    // Check monthly transfers
    const monthlyTransfers = await this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId: user.id })
      .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
      .andWhere('transaction.currency = :currency', {
        currency: TransactionCurrency.CAD,
      })
      .andWhere('transaction.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('transaction.createdAt < :endOfMonth', { endOfMonth })
      // .andWhere('transaction.status IN (:...statuses)', {
      //   statuses: ['COMPLETED', 'PENDING'],
      // })
      .select('SUM(transaction.amount)', 'sum')
      .getRawOne();

    const monthlyTransferred = parseFloat(monthlyTransfers.sum) || 0;

    // Check daily limit
    if (dailyTransferred + transferData.amount > DAILY_LIMIT) {
      throw new BadRequestException(
        `Daily transfer limit of $${DAILY_LIMIT.toLocaleString()} CAD exceeded. You have already transferred $${dailyTransferred.toLocaleString()} CAD today.`,
      );
    }

    // Check weekly limit
    if (weeklyTransferred + transferData.amount > WEEKLY_LIMIT) {
      throw new BadRequestException(
        `Weekly transfer limit of $${WEEKLY_LIMIT.toLocaleString()} CAD exceeded. You have already transferred $${weeklyTransferred.toLocaleString()} CAD this week.`,
      );
    }

    // Check monthly limit
    if (monthlyTransferred + transferData.amount > MONTHLY_LIMIT) {
      throw new BadRequestException(
        `Monthly transfer limit of $${MONTHLY_LIMIT.toLocaleString()} CAD exceeded. You have already transferred $${monthlyTransferred.toLocaleString()} CAD this month.`,
      );
    }

    if (currentBalance < transferData.amount) {
      throw new BadRequestException('Insufficient funds for this transfer');
    }

    const newBalance = currentBalance - transferData.amount;
    wallet.balance = newBalance;
    await this.cadWalletRepository.save(wallet);

    // Generate unique identifiers for tracking
    const disbursementNumber = `disb-${Date.now()}-${userId}`;
    const referenceId = this.generateReferenceId();

    // *** GENERATE NUMERIC TRANSACTION ID ***
    const transactionId = this.generateNumericTransactionId(); // or use generateStructuredTransactionId(userId)

    // Create PENDING transaction before initiating AptPay disbursement
    const pendingTransaction =
      await this.transactionService.createPendingTransaction({
        userId: user.id,
        type: TransactionType.DEBIT,
        amount: transferData.amount,
        currency: TransactionCurrency.CAD,
        cadWalletId: wallet.id,
        source: TransactionSource.DISBURSEMENT_SENT,
        description: `Transfer to ${transferData.recipientName} via Interac - ${transferData.interacEmail}`,
        reference: referenceId,
        referenceHash: this.encryptionService.hash(referenceId),
        externalTransactionId: disbursementNumber,
        transactionId: transactionId, // *** ADD THIS LINE ***
        balanceBefore: currentBalance, // *** ADD THIS FOR BALANCE TRACKING ***
        balanceAfter: newBalance, // *** ADD THIS FOR BALANCE TRACKING ***
        metadata: {
          recipientEmail: transferData.interacEmail,
          recipientName: transferData.recipientName,
          note: transferData.note || 'disbursement',
          balanceBefore: currentBalance,
          transferInitiatedAt: new Date().toISOString(),
          transactionPhase: 'initiated',
          transferType: 'interac_disbursement',
        },
      });

    // Create the disbursement in AptPay
    const disbursementResult = await this.aptPayService.createDisbursement({
      amount: transferData.amount,
      interacEmail: transferData.interacEmail,
      recipientName: transferData.recipientName,
      note: transferData.note || 'disbursement',
      identityId: user.aptPayIdentityId,
      disbursementNumber: disbursementNumber,
      referenceId: referenceId,
    });

    // Update transaction with AptPay response
    pendingTransaction.externalTransactionId =
      disbursementResult.disbursementId;
    pendingTransaction.metadata = {
      ...pendingTransaction.metadata,
      aptPayDisbursementId: disbursementResult.disbursementId,
      aptPayResponse: disbursementResult,
      transactionPhase: 'submitted_to_aptpay',
      updatedAt: new Date().toISOString(),
    };

    // Save the updated transaction
    const updatedTransaction =
      await this.transactionRepository.save(pendingTransaction);

    // Create disbursement record
    const disbursementRecord = this.disbursementRepository.create({
      userId: userId,
      amount: transferData.amount,
      recipientEmail: transferData.interacEmail,
      recipientName: transferData.recipientName,
      aptPayTransactionId: disbursementResult.disbursementId,
      referenceId: disbursementNumber,
      disbursementNumber: referenceId,
      status: disbursementResult.PENDING,
      type: disbursementResult.TRANSFER,
      note: transferData.note,
      description: `Transfer to ${transferData.recipientName} via Interac`,
      metadata: {
        aptPayResponse: disbursementResult,
        originalRequest: transferData,
        createdAt: new Date().toISOString(),
        transactionId: transactionId, // *** ADD TRANSACTION ID TO METADATA ***
      },
      initiatedAt: new Date(),
    });

    const savedRecord =
      await this.disbursementRepository.save(disbursementRecord);

    if (disbursementResult.success === true) {
      return {
        success: true,
        transactionId: transactionId, // *** RETURN TRANSACTION ID ***
        referenceId,
        status: 'PENDING',
        message: 'Funds transfer initiated successfully',
        disbursementNumber,
        transferDetails: {
          amount: transferData.amount,
          recipientEmail: transferData.interacEmail,
          recipientName: transferData.recipientName,
          date: new Date().toISOString(),
          transactionId: transactionId, // *** INCLUDE IN TRANSFER DETAILS ***
        },
      };
    } else {
      throw new BadRequestException(
        disbursementResult.errors?.message ||
          disbursementResult.errors ||
          'Transfer failed',
      );
    }
  }

  @Post('register-webhook')
  async registerWebhook(@Body() data: { url: string }) {
    const { url } = data;
    console.log('Registering webhook:', url);
    return this.aptPayService.registerWebhook(data.url);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  async initiateVerification(@Req() request) {
    const userId = request.user.userId;

    // Get user details
    const user = await this.userService.findUserById(userId);

    if (!user.interacEmailAddress) {
      throw new Error('User does not have an Interac email address');
    }

    // Generate verification link
    const verificationResult =
      await this.aptPayService.generateVerificationLink(
        userId,
        user.interacEmailAddress,
        true, // requireGeoLocation
      );

    // Create pending identity verification record
    const pendingVerification = this.identityVerificationRepository.create({
      userId: userId,
      aptPayVerificationId: verificationResult.verificationId, // Store the verification ID from APT Pay
      email: user.interacEmailAddress,
      status: IdentityVerificationStatus.PENDING,
      verificationMetadata: {
        sessionId: verificationResult.session,
        verificationUrl: verificationResult.verificationUrl,
        qrCode: verificationResult.qrCode,
        requireGeoLocation: true,
        initiatedAt: new Date().toISOString(),
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedVerification =
      await this.identityVerificationRepository.save(pendingVerification);
    // 🔥 UPDATE ONBOARDING PROGRESS
    await this.onboardingTrackingService.markVerificationInitiated(
      user.phoneNumber,
      verificationResult.verificationId,
      verificationResult.verificationUrl,
    );
    // Update the user with verification information

    // Return the verification options
    return {
      verificationId: verificationResult.verificationId,
      directLink: verificationResult.verificationUrl,
      qrCode: verificationResult.qrCode,
      embedCode: `<iframe src="https://verifypro.aptpay.com/?reference=${verificationResult.session}" frameborder="0" allow="camera;microphone" style="width: 800px; height: 600px;"></iframe>`,
    };
  }

  @Get('verification-result')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(RateLimitTier.GENERAL)
  @UseGuards(JwtAuthGuard)
  async getMyVerificationResult(@Req() request) {
    const userId = request.user.userId;

    // Get the user to retrieve their AptPay identity ID
    const user = await this.userService.findUserById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }
    console.log(user.verification_id, 'user.aptPayIdentityId');
    // Check if the user has an AptPay identity ID
    if (!user.verification_id) {
      throw new NotFoundException(
        'No identity verification found for this user',
      );
    }

    try {
      // Use the AptPay identity ID to get the verification result
      const verificationResult =
        await this.aptPayService.getIdentityVerificationResult(
          user.verification_id,
        );

      // 🔥 UPDATE ONBOARDING PROGRESS based on verification result
      if (verificationResult.success === 1) {
        // Verification successful
        await this.onboardingTrackingService.markVerificationSuccess(
          user.phoneNumber,
        );
      } else {
        // Verification failed
        await this.onboardingTrackingService.markVerificationFailed(
          user.phoneNumber,
        );
      }
      // Return the verification result with some additional context
      return {
        verificationId: user.aptPayIdentityId,
        verified: verificationResult.success === 1,
        completedAt: verificationResult.endDate,
        result: verificationResult,
      };
    } catch (error) {
      // Log the error
      console.error(
        `Error retrieving verification result: ${error.message}`,
        error,
      );

      // Return a user-friendly error
      throw new InternalServerErrorException(
        'Unable to retrieve verification results at this time',
      );
    }
  }
  @Get('verify/status/:sessionId')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(RateLimitTier.SENSITIVE)
  async checkVerificationStatus(@Param('sessionId') sessionId: string) {
    return this.aptPayService.getVerificationStatus(sessionId);
  }
}
