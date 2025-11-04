import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  TransactionCurrency,
  TransactionEntity,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';
import { TransactionService } from '../services/transaction.service';
import { NGNWalletEntity } from '../entities/NGNwallet.entity';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StatementRequestDto } from '../dtos/statement-request.dto';
import { Response } from 'express';
import { CADWalletEntity } from '../entities/CADwallet.entity';

@Controller('api/v1/transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getTransactionHistory(
    @Request() req,
    @Query('type') type?: TransactionType,
    @Query('status') status?: TransactionStatus,
    @Query('currency') currency?: TransactionCurrency,
    @Query('source') source?: TransactionSource,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') pageString: string = '1',
    @Query('limit') limitString: string = '10',
  ) {
    const userId = req.user.userId;

    // Convert string parameters to numbers
    const page = parseInt(pageString, 10);
    const limit = parseInt(limitString, 10);

    // Validate the numbers
    if (isNaN(page) || isNaN(limit)) {
      throw new BadRequestException('Page and limit must be valid numbers');
    }

    const { transactions, total } =
      await this.transactionService.getTransactionHistory(userId, {
        type,
        status,
        currency,
        source,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        search,
        page,
        limit,
      });

    return {
      statusCode: HttpStatus.OK,
      data: {
        transactions,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: 'Transaction history retrieved successfully',
    };
  }

  @Get('alltransactions')
  //   @UseGuards(JwtAuthGuard)
  //   @Roles('ADMIN') // Optional: restrict to admin users only
  async getAllTransactions(
    @Query('page') pageString: string = '1',
    @Query('limit') limitString: string = '20',
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: string = 'DESC',
  ) {
    // Convert string parameters to numbers
    const page = parseInt(pageString, 10);
    const limit = parseInt(limitString, 10);

    // Validate parameters
    if (isNaN(page) || isNaN(limit)) {
      throw new BadRequestException('Page and limit must be valid numbers');
    }

    const { transactions, total } =
      await this.transactionService.findAllTransactions({
        page,
        limit,
        sortBy,
        sortOrder: sortOrder === 'ASC' ? 'ASC' : 'DESC',
      });

    return {
      statusCode: HttpStatus.OK,
      data: {
        transactions,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: 'Transactions retrieved successfully',
    };
  }

  @Delete('user')
  // @UseGuards(JwtAuthGuard)
  // @Roles('ADMIN') // Restrict this operation to admins only
  async deleteTransactionsByUserId(@Request() req): Promise<any> {
    const userId = req.user.userId;

    // Delete the transactions
    const result = await this.transactionService.deleteByUserId(userId);

    return {
      statusCode: HttpStatus.OK,
      data: {
        deletedCount: result.affected || 0,
      },
      message: `Successfully deleted ${result.affected || 0} transactions for user ${userId}`,
    };
  }

  @Put('editWallet')
  // @UseGuards(JwtAuthGuard)
  async updateNairaWallet(
    @Body() updateData: Partial<CADWalletEntity>,
    @Request() req,
  ): Promise<any> {
    const userId = 230;
    // Validate user exists

    // Update transactions
    const result = await this.transactionService.updateByUserId(
      userId,
      updateData,
    );

    return {
      statusCode: HttpStatus.OK,
      data: {
        updatedCount: result.affected || 0,
      },
      message: `Successfully updated ${result.affected || 0} transactions for user ${userId}`,
    };
  }

  @Put('updateTransactionsByUserId')
  async updateTransactionsByUserId(
    // @Param('userId') userId: number,
    @Body() updateData: Partial<TransactionEntity>,
    @Request() req,
  ): Promise<any> {
    const userId = 171;
    // Update transactions
    const result = await this.transactionService.updateTransaction(
      userId,
      updateData,
    );

    return {
      statusCode: HttpStatus.OK,
      data: {
        updatedCount: result.affected || 0,
      },
      message: `Successfully updated ${result.affected || 0} transactions for user ${userId}`,
    };
  }

  @Post('createTransactions')
  // @UseGuards(JwtAuthGuard)
  async createTransaction(@Body() transactionData: any): Promise<any> {
    // // Create transaction object
    // const transaction = {
    //   ngnWalletId: wallet.id,
    //   userId: userId,
    //   type: transactionData.type,
    //   amount: transactionData.amount,
    //   fee: transactionData.fee || 0,
    //   currency: transactionData.currency || 'NGN',
    //   status: transactionData.status || 'COMPLETED',
    //   description: transactionData.description || 'Transaction',
    //   reference: transactionData.reference,
    //   completedAt: transactionData.completedAt ? new Date(transactionData.completedAt) : new Date(),
    //   metadata: transactionData.metadata
    // };

    // Create the transaction
    const result =
      await this.transactionService.createTransaction(transactionData);

    return {
      statusCode: HttpStatus.CREATED,
      data: result,
      message: 'Transaction created successfully',
    };
  }

  // transaction.controller.ts
  @Post('request/statement') // Fixed typo from 'statment'
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Request account statement',
    description:
      'Generate and download account statement in PDF or CSV format for specified date range and wallet type',
  })
  @ApiBody({ type: StatementRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Statement generated and downloaded successfully',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid date range or parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async requestStatement(
    @Body() statementRequest: StatementRequestDto,
    @Request() req,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.transactionService.generateStatement(
        req.user.userId,
        statementRequest,
        res,
      );
    } catch (error) {
      // Only respond if headers not sent
      if (!res.headersSent) {
        const statusCode = error.status || 500;
        const message = error.message || 'Failed to generate statement';

        res.status(statusCode).json({
          statusCode,
          message,
          error: error.name || 'Error',
        });
      }
    }
  }
}
