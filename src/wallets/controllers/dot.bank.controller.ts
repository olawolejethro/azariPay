import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  UnauthorizedException,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { DotBankService } from '../services/dot.bank.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PagaService } from '../services/paga.service';
import { AuthService } from 'src/auth/services/auth.service';
import {
  TransactionCurrency,
  TransactionEntity,
  TransactionType,
} from '../entities/transaction.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { RedisService } from 'src/common/redis/redis.service';
import { RateLimit } from 'src/common/decorators/rate-limit.decorator';
import { RateLimitTier } from 'src/common/config/rate-limit.config';
import { RateLimitGuard } from 'src/auth/guards/rate-limit.guard';

@ApiTags('DotBank')
@Controller('api/v1/dotbank')
export class DotBankController {
  constructor(
    private readonly dotBankService: DotBankService,
    private readonly pagaService: PagaService,
    private readonly authService: AuthService,
    private readonly notificationService: NotificationsService,
    private readonly redisService: RedisService,

    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get('token')
  @ApiOperation({ summary: 'Generate DotBank API access token' })
  @ApiResponse({
    status: 200,
    description: 'Returns an access token for DotBank API',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid client credentials',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAccessToken() {
    return this.dotBankService.getAccessToken();
  }

  @Post('virtual-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a virtual account' })
  @ApiResponse({
    status: 201,
    description: 'Virtual account created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createVirtualAccount(
    @Body() createVirtualAccountDto: any,
    @Request() req,
  ) {
    const userId = req.user.userId;
    return this.dotBankService.createVirtualAccount(
      createVirtualAccountDto,
      userId,
    );
  }

  @Get('banks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of banks' })
  @ApiResponse({
    status: 200,
    description: 'Returns a list of banks',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', example: '044' },
          name: { type: 'string', example: 'Access Bank' },
          category: { type: 'string', example: 'commercial' },
          cbnCode: { type: 'string', example: '044' },
          logo: {
            type: 'string',
            example: 'https://example.com/access-bank-logo.png',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getBanks() {
    return this.dotBankService.getBanks();
  }

  @Get('account-info')
  async getAccountInfo(@Query() query) {
    const { accountNo, bankCode } = query;

    // Validate required parameters
    if (!accountNo || !bankCode) {
      throw new HttpException(
        'Missing required parameters: accountNo and bankCode are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.dotBankService.getAccountDetails(accountNo, bankCode);
  }

  // @Post('transfer')
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Submit a fund transfer' })
  // @ApiResponse({ status: 201, description: 'Transfer submitted successfully' })
  // @ApiResponse({
  //   status: 400,
  //   description: 'Bad request - Invalid transfer data',
  // })
  // @ApiResponse({ status: 401, description: 'Unauthorized' })
  // async submitTransfer(
  //   @Body()
  //   transferDto: any & { pin?: string; payload?: string; signature?: string },
  //   @Request() req,
  // ) {
  //   const userId = req.user.userId;

  //   const user = await this.authService.findUserById(userId);
  //   // Check onboarding/KYC status
  //   const onboardingCompleted =
  //     user.pin !== null && user.kycStatus === 'SUCCESS';

  //   if (!onboardingCompleted) {
  //     throw new BadRequestException(
  //       'Onboarding not completed. Please complete KYC before transferring funds.',
  //     );
  //   }

  //   // Extract authentication fields from the request
  //   const { pin, payload, signature, ...transferData } = transferDto;

  //   // Validate that either PIN or (payload AND signature) is provided
  //   if (!pin && !(payload && signature)) {
  //     throw new BadRequestException(
  //       'Authentication required. Please provide a PIN .',
  //     );
  //   }

  //   let isAuthenticated = false;

  //   // If PIN is provided, verify it
  //   if (pin) {
  //     const isPinValid = await this.pagaService.verifyTransactionPin(
  //       userId,
  //       pin,
  //     );
  //     if (isPinValid) {
  //       isAuthenticated = true;
  //     } else {
  //       throw new UnauthorizedException(
  //         'Incorrect transaction PIN. Please try again with the correct PIN.',
  //       );
  //     }
  //   }

  //   // If signature and payload are provided, verify them
  //   if (payload && signature) {
  //     try {
  //       const isSignatureValid = await this.authService.verifyUserSignature(
  //         userId,
  //         payload,
  //         signature,
  //       );

  //       if (isSignatureValid) {
  //         isAuthenticated = true;
  //       } else {
  //         throw new UnauthorizedException(
  //           'Invalid signature. Please ensure you are using a registered device.',
  //         );
  //       }
  //     } catch (error) {
  //       // Only throw if PIN didn't already authenticate
  //       if (!isAuthenticated) {
  //         throw new UnauthorizedException(
  //           'Signature verification failed: ' + error.message,
  //         );
  //       }
  //     }
  //   }

  //   // If neither authentication method succeeded, reject the transfer
  //   if (!isAuthenticated) {
  //     throw new UnauthorizedException(
  //       'Authentication failed. Please provide valid credentials.',
  //     );
  //   }

  //   const wallets = await this.pagaService.findWalletsByUserId(userId);
  //   if (!wallets || wallets.length === 0) {
  //     throw new Error('No wallet found for this user');
  //   }

  //   // *** ENHANCED: Check NGN transfer limits (Daily, Weekly, Monthly) ***
  //   const today = new Date();
  //   today.setHours(0, 0, 0, 0);
  //   const tomorrow = new Date(today);
  //   tomorrow.setDate(today.getDate() + 1);

  //   // Get start of week (Sunday)
  //   const startOfWeek = new Date(today);
  //   startOfWeek.setDate(today.getDate() - today.getDay());

  //   // Get start of month
  //   const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  //   // Get end of month
  //   const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  //   // Define NGN transfer limits based on your UI
  //   const DAILY_NGN_LIMIT = 3000000; // ₦3,000,000
  //   const WEEKLY_NGN_LIMIT = 5000000; // ₦5,000,000
  //   const MONTHLY_NGN_LIMIT = 20000000; // ₦20,000,000

  //   // If the transfer currency is not NGN, skip the daily limit check
  //   if (
  //     transferData.currency &&
  //     transferData.currency !== TransactionCurrency.NGN
  //   ) {
  //     // No daily limit for non-NGN transfers
  //   } else {
  //     // Default to NGN if not specified
  //     const transferAmount =
  //       typeof transferData.amount === 'string'
  //         ? parseFloat(transferData.amount)
  //         : transferData.amount;

  //     // Check daily NGN transfers
  //     const dailyTransfers = await this.transactionRepository
  //       .createQueryBuilder('transaction')
  //       .where('transaction.userId = :userId', { userId })
  //       .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
  //       .andWhere('transaction.currency = :currency', {
  //         currency: TransactionCurrency.NGN,
  //       })
  //       .andWhere('transaction.createdAt >= :today', { today })
  //       .andWhere('transaction.createdAt < :tomorrow', { tomorrow })
  //       // .andWhere('transaction.status IN (:...statuses)', {
  //       //   statuses: ['COMPLETED', 'PENDING']
  //       // })
  //       .select('SUM(transaction.amount)', 'sum')
  //       .getRawOne();

  //     const dailyTransferred = parseFloat(dailyTransfers.sum) || 0;

  //     // Check weekly NGN transfers
  //     const weeklyTransfers = await this.transactionRepository
  //       .createQueryBuilder('transaction')
  //       .where('transaction.userId = :userId', { userId })
  //       .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
  //       .andWhere('transaction.currency = :currency', {
  //         currency: TransactionCurrency.NGN,
  //       })
  //       .andWhere('transaction.createdAt >= :startOfWeek', { startOfWeek })
  //       .andWhere('transaction.createdAt < :tomorrow', { tomorrow })
  //       // .andWhere('transaction.status IN (:...statuses)', {
  //       //   statuses: ['COMPLETED', 'PENDING']
  //       // })
  //       .select('SUM(transaction.amount)', 'sum')
  //       .getRawOne();

  //     const weeklyTransferred = parseFloat(weeklyTransfers.sum) || 0;

  //     // Check monthly NGN transfers
  //     const monthlyTransfers = await this.transactionRepository
  //       .createQueryBuilder('transaction')
  //       .where('transaction.userId = :userId', { userId })
  //       .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
  //       .andWhere('transaction.currency = :currency', {
  //         currency: TransactionCurrency.NGN,
  //       })
  //       .andWhere('transaction.createdAt >= :startOfMonth', { startOfMonth })
  //       .andWhere('transaction.createdAt < :endOfMonth', { endOfMonth })
  //       // .andWhere('transaction.status IN (:...statuses)', {
  //       //   statuses: ['COMPLETED', 'PENDING']
  //       // })
  //       .select('SUM(transaction.amount)', 'sum')
  //       .getRawOne();

  //     const monthlyTransferred = parseFloat(monthlyTransfers.sum) || 0;

  //     // Check daily limit
  //     if (dailyTransferred + transferAmount > DAILY_NGN_LIMIT) {
  //       throw new BadRequestException(
  //         `Daily transfer limit of ₦${DAILY_NGN_LIMIT.toLocaleString()} exceeded. You have already transferred ₦${dailyTransferred.toLocaleString()} today.`,
  //       );
  //     }

  //     // Check weekly limit
  //     if (weeklyTransferred + transferAmount > WEEKLY_NGN_LIMIT) {
  //       throw new BadRequestException(
  //         `Weekly transfer limit of ₦${WEEKLY_NGN_LIMIT.toLocaleString()} exceeded. You have already transferred ₦${weeklyTransferred.toLocaleString()} this week.`,
  //       );
  //     }

  //     // Check monthly limit
  //     if (monthlyTransferred + transferAmount > MONTHLY_NGN_LIMIT) {
  //       throw new BadRequestException(
  //         `Monthly transfer limit of ₦${MONTHLY_NGN_LIMIT.toLocaleString()} exceeded. You have already transferred ₦${monthlyTransferred.toLocaleString()} this month.`,
  //       );
  //     }
  //   }

  //   const transferCharges = 10.0; // Example transfer charges
  //   const wallet = wallets[0]; // Use the first wallet found
  //   const newAmount = Number(transferData.amount);
  //   console.log(newAmount + transferCharges, wallet.balance, 'bancale');
  //   // Check if user has sufficient balance
  //   if (wallet.balance < newAmount + transferCharges) {
  //     throw new Error(
  //       'Insufficient funds. Please top up your wallet to continue.',
  //     );
  //   }

  //   return this.dotBankService.submitTransfer(transferData, userId);
  // }

  @Post('transfer')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(RateLimitTier.SENSITIVE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a fund transfer' })
  @ApiResponse({ status: 201, description: 'Transfer submitted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid transfer data',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async submitTransfer(
    @Body()
    transferDto: any & { pin?: string; payload?: string; signature?: string },
    @Request() req,
  ) {
    const userId = req.user.userId;

    try {
      const user = await this.authService.findUserById(userId);

      // Check onboarding/KYC status
      const onboardingCompleted =
        user.pin !== null && user.kycStatus === 'SUCCESS';

      if (!onboardingCompleted) {
        throw new BadRequestException(
          'Onboarding not completed. Please complete KYC before transferring funds.',
        );
      }

      // Extract authentication fields from the request
      const { pin, payload, signature, ...transferData } = transferDto;

      // Validate that either PIN or (payload AND signature) is provided
      if (!pin && !(payload && signature)) {
        throw new BadRequestException(
          'Authentication required. Please provide a PIN.',
        );
      }

      let isAuthenticated = false;

      // If PIN is provided, verify it
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

      // If signature and payload are provided, verify them
      if (payload && signature) {
        try {
          const isSignatureValid = await this.authService.verifyUserSignature(
            userId,
            payload,
            signature,
          );

          if (isSignatureValid) {
            isAuthenticated = true;
          } else {
            throw new UnauthorizedException(
              'Invalid signature. Please ensure you are using a registered device.',
            );
          }
        } catch (error) {
          // Only throw if PIN didn't already authenticate
          if (!isAuthenticated) {
            throw new UnauthorizedException(
              'Signature verification failed: ' + error.message,
            );
          }
        }
      }

      // If neither authentication method succeeded, reject the transfer
      if (!isAuthenticated) {
        throw new UnauthorizedException(
          'Authentication failed. Please provide valid credentials.',
        );
      }

      const wallets = await this.pagaService.findWalletsByUserId(userId);
      if (!wallets || wallets.length === 0) {
        throw new Error('No wallet found for this user');
      }

      // **Enhanced NGN transfer limits checks**
      await this.checkTransferLimits(userId, transferData);

      const transferCharges = 10.0; // Example transfer charges
      const wallet = wallets[0]; // Use the first wallet found
      const newAmount = Number(transferData.amount);

      // Check if user has sufficient balance
      if (wallet.balance < newAmount + transferCharges) {
        throw new Error(
          'Insufficient funds. Please top up your wallet to continue.',
        );
      }

      // Proceed with the transfer submission
      return this.dotBankService.submitTransfer(transferData, userId);
    } catch (error) {
      // Catch any errors and handle them gracefully
      if (error instanceof Error) {
        console.log('Error during transfer:', error.message);
        throw new HttpException(
          {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            error: error.message || 'An unexpected error occurred.',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Handle specific error types (e.g., BadRequestException, UnauthorizedException)
      if (error instanceof HttpException) {
        throw error; // Already handled by specific exceptions
      }

      // For any unhandled errors
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'An unexpected error occurred during the transfer process.',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async checkTransferLimits(userId: number, transferData: any) {
    const DAILY_NGN_LIMIT = 3000000;
    const WEEKLY_NGN_LIMIT = 5000000;
    const MONTHLY_NGN_LIMIT = 20000000;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const transferAmount =
      typeof transferData.amount === 'string'
        ? parseFloat(transferData.amount)
        : transferData.amount;

    // Check daily NGN transfers
    const dailyTransfers = await this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
      .andWhere('transaction.currency = :currency', {
        currency: TransactionCurrency.NGN,
      })
      .andWhere('transaction.createdAt >= :today', { today })
      .andWhere('transaction.createdAt < :tomorrow', { tomorrow })
      .select('SUM(transaction.amount)', 'sum')
      .getRawOne();

    const dailyTransferred = parseFloat(dailyTransfers.sum) || 0;

    // Check weekly NGN transfers
    const weeklyTransfers = await this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
      .andWhere('transaction.currency = :currency', {
        currency: TransactionCurrency.NGN,
      })
      .andWhere('transaction.createdAt >= :startOfWeek', { startOfWeek })
      .andWhere('transaction.createdAt < :tomorrow', { tomorrow })
      .select('SUM(transaction.amount)', 'sum')
      .getRawOne();

    const weeklyTransferred = parseFloat(weeklyTransfers.sum) || 0;

    // Check monthly NGN transfers
    const monthlyTransfers = await this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.type = :type', { type: TransactionType.DEBIT })
      .andWhere('transaction.currency = :currency', {
        currency: TransactionCurrency.NGN,
      })
      .andWhere('transaction.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('transaction.createdAt < :endOfMonth', { endOfMonth })
      .select('SUM(transaction.amount)', 'sum')
      .getRawOne();

    const monthlyTransferred = parseFloat(monthlyTransfers.sum) || 0;

    // Check daily limit
    if (dailyTransferred + transferAmount > DAILY_NGN_LIMIT) {
      throw new BadRequestException(
        `Daily transfer limit of ₦${DAILY_NGN_LIMIT.toLocaleString()} exceeded. You have already transferred ₦${dailyTransferred.toLocaleString()} today.`,
      );
    }

    // Check weekly limit
    if (weeklyTransferred + transferAmount > WEEKLY_NGN_LIMIT) {
      throw new BadRequestException(
        `Weekly transfer limit of ₦${WEEKLY_NGN_LIMIT.toLocaleString()} exceeded. You have already transferred ₦${weeklyTransferred.toLocaleString()} this week.`,
      );
    }

    // Check monthly limit
    if (monthlyTransferred + transferAmount > MONTHLY_NGN_LIMIT) {
      throw new BadRequestException(
        `Monthly transfer limit of ₦${MONTHLY_NGN_LIMIT.toLocaleString()} exceeded. You have already transferred ₦${monthlyTransferred.toLocaleString()} this month.`,
      );
    }
  }

  @Post('payment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process a payment transaction' })
  @ApiResponse({ status: 201, description: 'Payment processed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid payment data',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async processPayment(@Body() paymentDto: any) {
    return this.dotBankService.processPayment(paymentDto);
  }

  @Get('bank-name')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get bank name by bank code' })
  @ApiResponse({ status: 200, description: 'Returns bank name' })
  @ApiResponse({ status: 400, description: 'Bad request - Missing bank code' })
  @ApiResponse({ status: 404, description: 'Bank not found' })
  async getBankByCode(@Query('bankCode') bankCode: string) {
    if (!bankCode) {
      throw new HttpException('Bank code is required', HttpStatus.BAD_REQUEST);
    }

    const bank = await this.dotBankService.getBankByCode(bankCode);
    if (!bank) {
      throw new HttpException('Bank not found', HttpStatus.NOT_FOUND);
    }

    return bank;
  }
}
