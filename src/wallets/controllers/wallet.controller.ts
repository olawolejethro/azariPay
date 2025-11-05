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

@ApiTags('Wallets')
@Controller('api/v1/wallets')
@ApiBearerAuth()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly walletFactory: WalletFactory,
  ) {}

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
    // Use the factory to create the appropriate wallet
    const wallet = await this.walletFactory.createWallet(userId);

    return wallet;
  }
}
