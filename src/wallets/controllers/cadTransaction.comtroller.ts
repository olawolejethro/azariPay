import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  BadRequestException,
  ValidationPipe,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CADTransactionService,
  CreateTransactionDto,
  TransactionFilters,
} from '../services/cad-transaction.service';
import {
  CADTransactionType,
  CADTransactionStatus,
  CADTransactionSource,
} from '../entities/cad-transaction.entity';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  Min,
  IsDateString,
} from 'class-validator';

// DTOs for validation
export class CreateTransactionRequestDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(CADTransactionType)
  type: CADTransactionType;

  @IsEnum(CADTransactionSource)
  source: CADTransactionSource;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  externalTransactionId?: string;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;
}

export class CreditWalletDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(CADTransactionSource)
  source: CADTransactionSource;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  externalTransactionId?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class DebitWalletDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(CADTransactionSource)
  source: CADTransactionSource;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  externalTransactionId?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class TransactionFiltersDto {
  @IsOptional()
  @IsEnum(CADTransactionType)
  type?: CADTransactionType;

  @IsOptional()
  @IsEnum(CADTransactionStatus)
  status?: CADTransactionStatus;

  @IsOptional()
  @IsEnum(CADTransactionSource)
  source?: CADTransactionSource;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  externalTransactionId?: string;
}

export class UpdateTransactionStatusDto {
  @IsEnum(CADTransactionStatus)
  status: CADTransactionStatus;

  @IsOptional()
  metadata?: Record<string, any>;
}

@ApiTags('CAD Transactions')
@ApiBearerAuth()
@Controller('api/v1/cad-transactions')
@UseGuards(JwtAuthGuard)
export class CADTransactionController {
  constructor(private readonly cadTransactionService: CADTransactionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new CAD transaction' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - insufficient funds or invalid data',
  })
  @ApiResponse({ status: 404, description: 'User wallet not found' })
  async createTransaction(
    @Req() request,
    @Body(ValidationPipe) createTransactionDto: CreateTransactionRequestDto,
  ) {
    const userId = request.user.userId;

    try {
      const transaction = await this.cadTransactionService.createTransaction({
        userId,
        ...createTransactionDto,
        processedBy: `user-${userId}`,
      });

      return {
        success: true,
        message: 'Transaction created successfully',
        data: {
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          source: transaction.source,
          description: transaction.description,
          referenceId: transaction.referenceId,
          externalTransactionId: transaction.externalTransactionId,
          balanceBefore: transaction.balanceBefore,
          balanceAfter: transaction.balanceAfter,
          createdAt: transaction.createdAt,
          metadata: transaction.metadata,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: error.message,
        error: 'TRANSACTION_CREATION_FAILED',
      });
    }
  }

  @Post('credit')
  @ApiOperation({ summary: 'Credit user wallet' })
  @ApiResponse({ status: 201, description: 'Wallet credited successfully' })
  async creditWallet(
    @Req() request,
    @Body(ValidationPipe) creditDto: CreditWalletDto,
  ) {
    const userId = request.user.userId;

    try {
      const transaction = await this.cadTransactionService.creditWallet(
        userId,
        creditDto.amount,
        creditDto.source,
        creditDto.description,
        creditDto.referenceId,
        creditDto.externalTransactionId,
        creditDto.metadata,
      );

      return {
        success: true,
        message: 'Wallet credited successfully',
        data: {
          transactionId: transaction.id,
          amount: transaction.amount,
          newBalance: transaction.balanceAfter,
          previousBalance: transaction.balanceBefore,
          source: transaction.source,
          description: transaction.description,
          createdAt: transaction.createdAt,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: error.message,
        error: 'WALLET_CREDIT_FAILED',
      });
    }
  }

  @Post('debit')
  @ApiOperation({ summary: 'Debit user wallet' })
  @ApiResponse({ status: 201, description: 'Wallet debited successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient funds' })
  async debitWallet(
    @Req() request,
    @Body(ValidationPipe) debitDto: DebitWalletDto,
  ) {
    const userId = request.user.userId;

    try {
      const transaction = await this.cadTransactionService.debitWallet(
        userId,
        debitDto.amount,
        debitDto.source,
        debitDto.description,
        debitDto.referenceId,
        debitDto.externalTransactionId,
        debitDto.metadata,
      );

      return {
        success: true,
        message: 'Wallet debited successfully',
        data: {
          transactionId: transaction.id,
          amount: transaction.amount,
          newBalance: transaction.balanceAfter,
          previousBalance: transaction.balanceBefore,
          source: transaction.source,
          description: transaction.description,
          createdAt: transaction.createdAt,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: error.message,
        error: 'WALLET_DEBIT_FAILED',
      });
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get user transaction history' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of transactions to return (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of transactions to skip (default: 0)',
  })
  @ApiQuery({ name: 'type', required: false, enum: CADTransactionType })
  @ApiQuery({ name: 'status', required: false, enum: CADTransactionStatus })
  @ApiQuery({ name: 'source', required: false, enum: CADTransactionSource })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getTransactionHistory(
    @Req() request,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query() filters?: TransactionFiltersDto,
  ) {
    const userId = request.user.userId;
    const parsedLimit = limit ? parseInt(limit.toString()) : 50;
    const parsedOffset = offset ? parseInt(offset.toString()) : 0;

    // Convert string dates to Date objects
    const parsedFilters: Partial<TransactionFilters> = {
      ...filters,
      startDate: filters?.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters?.endDate ? new Date(filters.endDate) : undefined,
    };

    const result = await this.cadTransactionService.getUserTransactions(
      userId,
      parsedFilters,
      parsedLimit,
      parsedOffset,
    );

    return {
      success: true,
      data: {
        transactions: result.transactions.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          source: transaction.source,
          description: transaction.description,
          referenceId: transaction.referenceId,
          externalTransactionId: transaction.externalTransactionId,
          balanceBefore: transaction.balanceBefore,
          balanceAfter: transaction.balanceAfter,
          feeAmount: transaction.feeAmount,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          metadata: transaction.metadata,
        })),
        pagination: {
          total: result.total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: result.total > parsedOffset + parsedLimit,
        },
      },
    };
  }

  @Get('wallet-summary')
  @ApiOperation({ summary: 'Get wallet balance and recent transactions' })
  async getWalletSummary(@Req() request) {
    const userId = request.user.userId;

    const summary = await this.cadTransactionService.getWalletSummary(userId);

    return {
      success: true,
      data: {
        balance: summary.balance,
        currency: summary.currency,
        totalTransactions: summary.totalTransactions,
        recentTransactions: summary.recentTransactions.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          source: transaction.source,
          description: transaction.description,
          balanceAfter: transaction.balanceAfter,
          createdAt: transaction.createdAt,
        })),
      },
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get transaction statistics' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getTransactionStats(
    @Req() request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = request.user.userId;
    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    const stats = await this.cadTransactionService.getUserTransactionStats(
      userId,
      parsedStartDate,
      parsedEndDate,
    );

    return {
      success: true,
      data: {
        totalCredits: Number(stats.totalCredits.toFixed(2)),
        totalDebits: Number(stats.totalDebits.toFixed(2)),
        netAmount: Number((stats.totalCredits - stats.totalDebits).toFixed(2)),
        transactionCount: stats.transactionCount,
        averageTransaction: Number(stats.averageTransaction.toFixed(2)),
        period: {
          startDate: parsedStartDate?.toISOString(),
          endDate: parsedEndDate?.toISOString(),
        },
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Transaction ID' })
  async getTransactionById(
    @Req() request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = request.user.userId;
    const transaction = await this.cadTransactionService.getTransactionById(id);

    // Ensure user can only access their own transactions
    if (transaction.userId !== userId) {
      throw new BadRequestException({
        success: false,
        message: 'Access denied - not your transaction',
        error: 'ACCESS_DENIED',
      });
    }

    return {
      success: true,
      data: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        source: transaction.source,
        description: transaction.description,
        referenceId: transaction.referenceId,
        externalTransactionId: transaction.externalTransactionId,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        feeAmount: transaction.feeAmount,
        processedBy: transaction.processedBy,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        metadata: transaction.metadata,
        wallet: {
          id: transaction.wallet?.id,
          currency: 'CAD',
        },
      },
    };
  }

  @Get('reference/:referenceId')
  @ApiOperation({ summary: 'Get transaction by reference ID' })
  @ApiParam({
    name: 'referenceId',
    type: String,
    description: 'Transaction reference ID',
  })
  async getTransactionByReferenceId(
    @Req() request,
    @Param('referenceId') referenceId: string,
  ) {
    const userId = request.user.userId;
    const transaction =
      await this.cadTransactionService.getTransactionByReferenceId(referenceId);

    if (!transaction) {
      throw new BadRequestException({
        success: false,
        message: 'Transaction not found',
        error: 'TRANSACTION_NOT_FOUND',
      });
    }

    // Ensure user can only access their own transactions
    if (transaction.userId !== userId) {
      throw new BadRequestException({
        success: false,
        message: 'Access denied - not your transaction',
        error: 'ACCESS_DENIED',
      });
    }

    return {
      success: true,
      data: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        source: transaction.source,
        description: transaction.description,
        referenceId: transaction.referenceId,
        externalTransactionId: transaction.externalTransactionId,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        createdAt: transaction.createdAt,
        metadata: transaction.metadata,
      },
    };
  }

  @Get('external/:externalId')
  @ApiOperation({
    summary: 'Get transaction by external transaction ID (AptPay ID)',
  })
  @ApiParam({
    name: 'externalId',
    type: String,
    description: 'External transaction ID',
  })
  async getTransactionByExternalId(
    @Req() request,
    @Param('externalId') externalId: string,
  ) {
    const userId = request.user.userId;
    const transaction =
      await this.cadTransactionService.getTransactionByExternalId(externalId);

    if (!transaction) {
      throw new BadRequestException({
        success: false,
        message: 'Transaction not found',
        error: 'TRANSACTION_NOT_FOUND',
      });
    }

    // Ensure user can only access their own transactions
    if (transaction.userId !== userId) {
      throw new BadRequestException({
        success: false,
        message: 'Access denied - not your transaction',
        error: 'ACCESS_DENIED',
      });
    }

    return {
      success: true,
      data: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        source: transaction.source,
        description: transaction.description,
        referenceId: transaction.referenceId,
        externalTransactionId: transaction.externalTransactionId,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        createdAt: transaction.createdAt,
        metadata: transaction.metadata,
      },
    };
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update transaction status' })
  @ApiParam({ name: 'id', type: Number, description: 'Transaction ID' })
  async updateTransactionStatus(
    @Req() request,
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) updateStatusDto: UpdateTransactionStatusDto,
  ) {
    const userId = request.user.userId;

    // First check if transaction exists and belongs to user
    const existingTransaction =
      await this.cadTransactionService.getTransactionById(id);

    if (existingTransaction.userId !== userId) {
      throw new BadRequestException({
        success: false,
        message: 'Access denied - not your transaction',
        error: 'ACCESS_DENIED',
      });
    }

    try {
      const updatedTransaction =
        await this.cadTransactionService.updateTransactionStatus(
          id,
          updateStatusDto.status,
          updateStatusDto.metadata,
        );

      return {
        success: true,
        message: 'Transaction status updated successfully',
        data: {
          id: updatedTransaction.id,
          previousStatus: existingTransaction.status,
          newStatus: updatedTransaction.status,
          updatedAt: updatedTransaction.updatedAt,
          metadata: updatedTransaction.metadata,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: error.message,
        error: 'STATUS_UPDATE_FAILED',
      });
    }
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete a pending transaction' })
  @ApiParam({ name: 'id', type: Number, description: 'Transaction ID' })
  async completeTransaction(
    @Req() request,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    completionData?: {
      completedAt?: string;
      aptPayStatus?: string;
      settledPayload?: any;
    },
  ) {
    const userId = request.user.userId;

    // First check if transaction exists and belongs to user
    const existingTransaction =
      await this.cadTransactionService.getTransactionById(id);

    if (existingTransaction.userId !== userId) {
      throw new BadRequestException({
        success: false,
        message: 'Access denied - not your transaction',
        error: 'ACCESS_DENIED',
      });
    }

    try {
      const processedData = {
        ...completionData,
        completedAt: completionData?.completedAt
          ? new Date(completionData.completedAt)
          : new Date(),
      };

      const completedTransaction =
        await this.cadTransactionService.completeTransaction(id, processedData);

      return {
        success: true,
        message: 'Transaction completed successfully',
        data: {
          id: completedTransaction.id,
          status: completedTransaction.status,
          amount: completedTransaction.amount,
          balanceBefore: completedTransaction.balanceBefore,
          balanceAfter: completedTransaction.balanceAfter,
          completedAt: completedTransaction.updatedAt,
          metadata: completedTransaction.metadata,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: error.message,
        error: 'TRANSACTION_COMPLETION_FAILED',
      });
    }
  }

  @Post(':id/fail')
  @ApiOperation({ summary: 'Fail a pending transaction' })
  @ApiParam({ name: 'id', type: Number, description: 'Transaction ID' })
  async failTransaction(
    @Req() request,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    failureData?: {
      failedAt?: string;
      failureReason?: string;
      errorCode?: string;
      errorDescription?: string;
      aptPayStatus?: string;
      failedPayload?: any;
    },
  ) {
    const userId = request.user.userId;

    // First check if transaction exists and belongs to user
    const existingTransaction =
      await this.cadTransactionService.getTransactionById(id);

    if (existingTransaction.userId !== userId) {
      throw new BadRequestException({
        success: false,
        message: 'Access denied - not your transaction',
        error: 'ACCESS_DENIED',
      });
    }

    try {
      const processedData = {
        ...failureData,
        failedAt: failureData?.failedAt
          ? new Date(failureData.failedAt)
          : new Date(),
      };

      const failedTransaction =
        await this.cadTransactionService.failTransaction(id, processedData);

      return {
        success: true,
        message: 'Transaction marked as failed',
        data: {
          id: failedTransaction.id,
          status: failedTransaction.status,
          amount: failedTransaction.amount,
          failureReason: processedData.failureReason,
          errorCode: processedData.errorCode,
          failedAt: failedTransaction.updatedAt,
          metadata: failedTransaction.metadata,
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: error.message,
        error: 'TRANSACTION_FAILURE_UPDATE_FAILED',
      });
    }
  }

  @Get('CADtransactions')
  @UseGuards(JwtAuthGuard)
  async getUserTransactionHistory(
    @Request() req,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') pageString?: string,
    @Query('limit') limitString?: string,
  ) {
    const userId = req.user.userId;

    // Convert string parameters to numbers with defaults
    const page = pageString ? parseInt(pageString, 10) : 1;
    const limit = limitString ? parseInt(limitString, 10) : 20;

    // Validate the numbers
    if (isNaN(page) || isNaN(limit)) {
      throw new BadRequestException('Page and limit must be valid numbers');
    }

    // Additional validation
    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }

    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const { transactions, total } =
      await this.cadTransactionService.getUserTransactionHistory(userId, {
        type,
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        search,
        page,
        limit,
      });

    return {
      data: {
        transactions,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
      message: 'Transaction history retrieved successfully',
    };
  }
}
