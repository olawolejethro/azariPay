// src/wallet/controllers/wallet.controller.ts
import {
  Controller,
  Get,
  UseGuards,
  HttpStatus,
  UseInterceptors,
  Request,
  Param,
  NotFoundException,
  Body,
  Post,
  Query,
  InternalServerErrorException,
  ValidationPipe,
  HttpException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiParam,
  ApiNotFoundResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WalletService } from '../services/wallet.service';
import { ErrorResponseDto } from '../dtos/error.dto';
import {
  WalletDetailsResponseDto,
  WalletResponseDto,
} from '../dtos/wallet-response.dto';
import { CacheInterceptor } from '@nestjs/cache-manager';

import {
  TransferRequest,
  TransferResponse,
  ValidateMoneyTransferRequest,
  ValidateMoneyTransferResponse,
} from '../interfaces/wallet.interface';
import { WalletFactory } from '../factories/wallet.factory';
import { CreateWalletDto } from '../interfaces/wallet.interface';
import { PagaService } from '../services/paga.service';

@ApiTags('Wallets')
@Controller('api/v1/wallets')
@ApiBearerAuth()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly walletFactory: WalletFactory,
    private readonly pagaService: PagaService,
  ) {}

  // @Get()
  // @UseInterceptors(CacheInterceptor)
  // @ApiOperation({
  //   summary: 'Get all user wallets',
  //   description: 'Retrieves all wallets associated with the authenticated user',
  // })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   description: 'Successfully retrieved user wallets',
  //   type: [WalletResponseDto],
  // })
  // @ApiUnauthorizedResponse({
  //   description: 'Unauthorized - Invalid or expired token',
  //   type: ErrorResponseDto,
  // })
  // async getUserWallets(@Request() req): Promise<WalletResponseDto[]> {
  //   const userId = req.user.userId;

  //   return this.walletService.findAllByUserId(userId);
  // }

  @Post('createWallet')
  // @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new wallet' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Wallet created successfully',
    type: WalletResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid currency or wallet already exists',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'User not authenticated',
  })
  async createWallet(
    @Request()
    req,
  ) {
    const userId = req.user.userId;
    // const userId = 259;
    // Use the factory to create the appropriate wallet
    const wallet = await this.walletFactory.createWallet(userId);

    return wallet;
  }
  ////////////////PAGA API ///////////////////////////
  /**
   * Get list of all available banks
   */
  @Get('getBanks')
  @ApiOperation({ summary: 'Get list of all available banks' })
  @ApiResponse({
    status: 200,
    description: 'List of banks retrieved successfully',
  })
  async getBanks(): Promise<any> {
    return await this.pagaService.getBanks();
  }

  @Post('transfer')
  @UseGuards(JwtAuthGuard)
  async transfer(
    @Body() transferRequest: TransferRequest & { pin: string },
    @Request() req,
  ): Promise<TransferResponse> {
    try {
      const { pin, ...transferData } = transferRequest;
      const userId = req.user.userId;

      // Verify user's PIN first
      const isPinValid = await this.pagaService.verifyTransactionPin(
        userId,
        pin,
      );
      if (!isPinValid) {
        throw new UnauthorizedException(
          'Incorrect transaction PIN. Please try again with the correct PIN.',
        );
      }

      const wallets = await this.pagaService.findWalletsByUserId(userId);
      if (!wallets || wallets.length === 0) {
        throw new Error('No wallet found for this user');
      }
      const transferCharges = 53.75;
      const wallet = wallets[0]; // Use the first wallet found

      // Check if user has sufficient balance
      if (wallet.balance < transferData.amount + transferCharges) {
        throw new Error(
          'Insufficient funds. Please top up your wallet to continue.',
        );
      }
      return await this.pagaService.transfer(transferData, userId, pin);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error; // Re-throw unauthorized exception with our custom message
      }

      // Handle other errors
      throw new HttpException(
        error.message || 'Failed to process transfer',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('persistent')
  async getPersistentPaymentAccount(
    @Query('referenceNumber') referenceNumber: string,
    @Query('accountIdentifier') accountIdentifier: string,
  ) {
    if (!referenceNumber || !accountIdentifier) {
      throw new BadRequestException(
        'Reference number and account identifier are required',
      );
    }

    try {
      const result = await this.pagaService.getPersistentPaymentAccount(
        referenceNumber,
        accountIdentifier,
      );

      return {
        statusCode: HttpStatus.OK,
        data: result,
        message: 'Persistent payment account retrieved successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve persistent payment account',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('validate')
  async validateMoneyTransfer(@Body() validateRequest: any): Promise<{
    statusCode: number;
    data: ValidateMoneyTransferResponse;
    message: string;
  }> {
    const result =
      await this.pagaService.validateMoneyTransfer(validateRequest);

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Money transfer validation successful',
    };
  }

  @Post('validate-deposit')
  async validateDepositToBank(@Body() requestData: any): Promise<any> {
    try {
      const result = await this.pagaService.validateDepositToBank(requestData);

      return {
        statusCode: HttpStatus.OK,
        data: result,
        message: 'Deposit validation successful',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to validate deposit to bank',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('banks/:uuid')
  // @UseGuards(JwtAuthGuard)
  async getBankByUUID(@Param('uuid') uuid: string): Promise<any> {
    try {
      const bank = await this.pagaService.getBankByUUID(uuid);

      return {
        statusCode: HttpStatus.OK,
        data: bank,
        message: 'Bank details retrieved successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: error.message,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to retrieve bank details',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('accountBalance')
  async getAccountBalance(@Body() requestData: any): Promise<any> {
    const result = await this.pagaService.getAccountBalance(requestData);

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Account balance retrieved successfully',
    };
  }

  // This for transfer to 3rd party accoount
  @Post('transferMoney')
  async moneyTransfer(@Body() requestData: any): Promise<any> {
    const result = await this.pagaService.moneyTransfer(requestData);

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Money transfer processed successfully',
    };
  }

  @Get('getWalletDetails')
  @UseGuards(JwtAuthGuard)
  async getWalletsByUserId(@Request() req): Promise<any> {
    try {
      const userId = req.user.userId;

      const wallets = await this.pagaService.findWalletsByUserId(userId);

      if (!wallets || wallets.length === 0) {
        throw new NotFoundException(`No wallets found for user ID ${userId}`);
      }

      return {
        statusCode: HttpStatus.OK,
        data: wallets,
        message: 'Wallets retrieved successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        error.message || 'Failed to retrieve wallets',
      );
    }
  }

  @Get('getCADWalletDetails')
  @UseGuards(JwtAuthGuard)
  async getCADwalletById(@Request() req): Promise<any> {
    try {
      const userId = req.user.userId;

      const wallets = await this.pagaService.getCADwalletById(userId);

      if (!wallets || wallets.length === 0) {
        throw new NotFoundException(`No wallets found for user ID ${userId}`);
      }

      return {
        statusCode: HttpStatus.OK,
        data: wallets,
        message: 'Wallets retrieved successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        error.message || 'Failed to retrieve wallets',
      );
    }
  }
}
