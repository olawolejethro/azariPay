// src/P2P/p2p-trade/controllers/p2p-trade.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  ParseIntPipe,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UseInterceptors,
  UploadedFiles,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { P2PTradeService } from '../../services/p2p-trade/p2p-trade.service';
import {
  CreateTradeDto,
  UpdateTradeStatusDto,
  TradeFilterDto,
} from '../../dtos/p2p-trade.dto/p2p-trade.dto';
import { CancelTradeDto } from 'src/p2p-trade/dtos/cancel-trade.dto';
import { EscrowService } from 'src/p2p-trade/services/escrow.service';
import {
  CreateDisputeDto,
  ResolveDisputeDto,
} from 'src/p2p-trade/dtos/dispute.dto';
import {
  RateUpdateResponseDto,
  UpdateTradeRateDto,
} from 'src/p2p-trade/dtos/rate-negotiation.dto';
import { TradeStatus } from 'src/p2p-trade/entities/p2p-trade.entity';
import { FileStoreService } from 'src/filestore/services/filestore.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CancelTradeSimpleDto } from 'src/p2p-trade/dtos/cancel-trade-simple.dto';

@ApiTags('p2p-trade')
@Controller('api/v1/p2p-trade')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class P2PTradeController {
  constructor(
    private readonly p2pTradeService: P2PTradeService,
    private readonly escrowService: EscrowService,
    private readonly fileStoreService: FileStoreService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new trade' })
  @ApiResponse({ status: 201, description: 'Trade created successfully' })
  async createTrade(@Body() createTradeDto: CreateTradeDto, @Request() req) {
    const userId = req.user.userId;
    return await this.p2pTradeService.createTrade(userId, createTradeDto);
  }

  @Get('history')
  // @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get completed trade history',
    description:
      'Retrieve paginated list of completed trades for the authenticated user',
  })
  @ApiQuery({ name: 'page', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'role', required: false, enum: ['buyer', 'seller'] })
  async getTradeHistory(
    @Request() req,
    @Query()
    query: {
      page?: number;
      limit?: number;
      role?: 'buyer' | 'seller';
    },
  ) {
    console.log('req.user', req.user);
    return await this.p2pTradeService.getTradeHistory(req.user.userId, query);
  }
  @Get(':tradeId')
  @ApiOperation({ summary: 'Get trade details' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'string' })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: TradeFilterDto,
    description: 'Optional filters for trade details',
  })
  @ApiResponse({ status: 200, description: 'Returns trade details' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User is not a participant',
  })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async getTrade(
    @Param('tradeId') tradeId: number,
    @Query() filter: TradeFilterDto, // Include filter as a query parameter
    @Request() req,
  ) {
    return await this.p2pTradeService.getTrade(
      tradeId,
      req.user.userId,
      filter,
    );
  }

  @Get('user/buyer')
  @ApiOperation({ summary: 'Get user trades as buyer' })
  @ApiQuery({ type: TradeFilterDto, required: false })
  @ApiResponse({ status: 200, description: 'Returns user trades as buyer' })
  async getUserTradesAsBuyer(@Query() filter: TradeFilterDto, @Request() req) {
    return await this.p2pTradeService.getUserTradesAsBuyer(
      req.user.userId,
      filter,
    );
  }

  @Get('user/seller')
  @ApiOperation({ summary: 'Get user trades as seller' })
  @ApiQuery({ type: TradeFilterDto, required: false })
  @ApiResponse({ status: 200, description: 'Returns user trades as seller' })
  async getUserTradesAsSeller(@Query() filter: TradeFilterDto, @Request() req) {
    return await this.p2pTradeService.getUserTradesAsSeller(
      req.user.userId,
      filter,
    );
  }

  @Put(':tradeId/status')
  @ApiOperation({ summary: 'Update trade status' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Trade status updated successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot change status' })
  async updateTradeStatus(
    @Param('tradeId') tradeId: number,
    @Body() updateStatusDto: UpdateTradeStatusDto,
    @Request() req,
  ) {
    return await this.p2pTradeService.updateTradeStatus(
      tradeId,
      req.user.userId,
      updateStatusDto,
    );
  }

  // src/P2P/p2p-trade/controllers/p2p-trade.controller.ts
  // Add this endpoint to your controller

  @Post(':tradeId/cancel')
  @ApiOperation({ summary: 'Cancel a trade with reason' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  async cancelTradeWithReason(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Body() cancelDto: CancelTradeDto,
    @Request() req,
  ) {
    return await this.p2pTradeService.cancelTradeWithReason(
      tradeId,
      req.user.userId,
      cancelDto,
    );
  }

  @Post(':tradeId/cancel-simple')
  @ApiOperation({ summary: 'Cancel a trade (no reason required)' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  async cancelTrade(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Body() cancelDto: CancelTradeSimpleDto,
    @Request() req,
  ) {
    return await this.p2pTradeService.cancelTrade(
      tradeId,
      req.user.userId,
      // cancelDto,
    );
  }

  // src/P2P/p2p-trade/controllers/p2p-trade.controller.ts

  @Get('user/check-open-trades')
  @ApiOperation({
    summary: 'Check if the authenticated user has any open trades',
  })
  async checkUserHasOpenTrades(@Request() req) {
    return await this.p2pTradeService.checkUserHasOpenTrades(req.user.userId);
  }

  @Post(':tradeId/notify-seller')
  @ApiOperation({
    summary: 'Buyer notifies seller to proceed with transaction',
  })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Notification sent successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only buyer can notify',
  })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async notifySellerToProceed(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Request() req,
  ) {
    return await this.p2pTradeService.notifySellerToProceed(
      tradeId,
      req.user.userId,
    );
  }

  @Post(':tradeId/notify-buyer')
  @ApiOperation({ summary: 'Seller notifies buyer to proceed with payment' })
  @ApiParam({ name: 'id', description: 'Trade ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Notification sent successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only seller can notify',
  })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async notifyBuyerToProceed(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Request() req,
  ) {
    return await this.p2pTradeService.notifyBuyerToProceed(
      tradeId,
      req.user.userId,
    );
  }

  @Post(':tradeId/payment-sent')
  @ApiOperation({ summary: 'Buyer notifies seller that payment has been sent' })
  @ApiParam({ name: 'id', description: 'Trade ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Payment notification sent successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only buyer can mark payment as sent',
  })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async notifyPaymentSent(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Request() req,
  ) {
    return await this.p2pTradeService.notifyPaymentSent(
      tradeId,
      req.user.userId,
    );
  }

  @Post(':tradeId/release-funds')
  @ApiOperation({ summary: 'Seller releases funds to complete the trade' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Funds released successfully and trade completed',
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient funds in seller wallet',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only seller can release funds',
  })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async releaseFunds(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Request() req,
  ) {
    return await this.p2pTradeService.releaseFunds(tradeId, req.user.userId);
  }

  @Post(':tradeId/release-funds-buyer')
  async releaseFundsScenario2(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Request() req,
  ) {
    return this.p2pTradeService.releaseFundsScenario2(tradeId, req.user.userId);
  }

  @Put(':tradeId/rate')
  @ApiOperation({
    summary: 'Update negotiated exchange rate for a trade (seller only)',
  })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Trade rate updated successfully',
    type: RateUpdateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid rate, exceeds limits, or trade state not eligible',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only seller can update rate or funds locked in escrow',
  })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async updateTradeRate(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Body() updateRateDto: UpdateTradeRateDto,
    @Request() req,
  ): Promise<RateUpdateResponseDto> {
    return await this.p2pTradeService.updateTradeRate(
      tradeId,
      req.user.userId,
      updateRateDto,
    );
  }
  ///////////DISPUTE APIS/////////

  // Add these endpoints to your P2PTradeController

  @Post('dispute')
  @UseInterceptors(FilesInterceptor('screenshots', 5)) // Max 5 screenshots
  async createDispute(
    @Body() body: any, // Use any first, then manually create DTO
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    const userId = req.user.userId;

    // Manually create DTO with proper types (since form-data sends everything as strings)
    const createDisputeDto: CreateDisputeDto = {
      transactionType: body.transactionType,
      amount: parseFloat(body.amount), // Convert string to number
      tradeId: body.tradeId,
      description: body.description,
      additionalInfo: body.additionalInfo || undefined,
    };

    // Validate manually
    if (isNaN(createDisputeDto.amount) || createDisputeDto.amount < 0) {
      throw new BadRequestException('Amount must be a valid positive number');
    }

    if (
      !createDisputeDto.transactionType ||
      !createDisputeDto.tradeId ||
      !createDisputeDto.description
    ) {
      throw new BadRequestException(
        'transactionType, tradeId, and description are required',
      );
    }

    // Upload screenshots if provided
    const screenshotUrls: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          // Validate file type (only images)
          if (!file.mimetype.startsWith('image/')) {
            throw new BadRequestException(
              `Invalid file type: ${file.originalname}. Only images are allowed.`,
            );
          }

          // Validate file size (max 5MB per file)
          const maxSize = 5 * 1024 * 1024; // 5MB
          if (file.size > maxSize) {
            throw new BadRequestException(
              `File too large: ${file.originalname}. Max size is 5MB.`,
            );
          }

          // Upload to Wasabi using your existing service
          const uploadedFile = await this.fileStoreService.uploadFile(
            {
              file,
              fileMetadata: JSON.stringify({
                type: 'dispute_screenshot',
                disputeTradeId: createDisputeDto.tradeId,
                uploadedBy: userId,
                uploadedAt: new Date().toISOString(),
              }),
            },
            userId,
          );

          screenshotUrls.push(uploadedFile.fileUrl);
        } catch (error) {
          throw new BadRequestException(
            `Failed to upload file ${file.originalname}: ${error.message}`,
          );
        }
      }
    }

    // Add screenshot URLs to DTO
    createDisputeDto.screenshots = screenshotUrls;

    return this.p2pTradeService.createDispute(userId, createDisputeDto);
  }
  @Get(':tradeId/dispute')
  @ApiOperation({ summary: 'Get dispute details for a trade' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Returns dispute details' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot view dispute' })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async getDisputeDetails(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Request() req,
  ) {
    return await this.p2pTradeService.getDisputeDetails(
      tradeId,
      req.user.userId,
    );
  }

  // @Post(':tradeId/dispute/resolve')
  // @ApiOperation({ summary: 'Admin resolves a trade dispute' })
  // @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  // @ApiResponse({ status: 200, description: 'Dispute resolved successfully' })
  // @ApiResponse({
  //   status: 400,
  //   description: 'Invalid resolution or trade not disputed',
  // })
  // @ApiResponse({
  //   status: 403,
  //   description: 'Forbidden - Admin access required',
  // })
  // @ApiResponse({ status: 404, description: 'Trade not found' })
  // async resolveDispute(
  //   @Param('tradeId', ParseIntPipe) tradeId: number,
  //   @Body() resolveDisputeDto: ResolveDisputeDto,
  //   @Request() req,
  // ) {
  //   // Add admin role check here
  //   const user = req.user;
  //   if (user.role !== 'admin') {
  //     // Assuming you have role in JWT payload
  //     throw new ForbiddenException('Admin access required');
  //   }

  //   return await this.p2pTradeService.resolveDispute(
  //     tradeId,
  //     req.user.userId,
  //     resolveDisputeDto,
  //   );
  // }

  @Get(':tradeId/escrow')
  @ApiOperation({ summary: 'Get escrow details for a trade' })
  @ApiParam({ name: 'tradeId', description: 'Trade ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Returns escrow details' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not part of trade' })
  @ApiResponse({ status: 404, description: 'Trade or escrow not found' })
  async getEscrowDetails(
    @Param('tradeId', ParseIntPipe) tradeId: number,
    @Request() req,
  ) {
    // Verify user is part of the trade first
    const trade = await this.p2pTradeService.getTrade(tradeId, req.user.userId);

    if (
      trade.buyerId !== req.user.userId &&
      trade.sellerId !== req.user.userId
    ) {
      throw new ForbiddenException('You are not part of this trade');
    }

    const escrow = await this.escrowService.getEscrowByTradeId(tradeId);

    if (!escrow) {
      throw new NotFoundException('No escrow found for this trade');
    }

    return {
      success: true,
      escrow: {
        id: escrow.id,
        tradeId: escrow.tradeId,
        amount: escrow.amount,
        currency: escrow.currency,
        status: escrow.status,
        lockedAt: escrow.lockedAt,
        releasedAt: escrow.releasedAt,
        refundedAt: escrow.refundedAt,
        reason: escrow.reason,
      },
    };
  }

  // Add this method to the service class as well:
  // async getEscrowDetails(tradeId: number, userId: number): Promise<any> {
  //   // Verify user is part of the trade
  //   const trade = await this.getTrade(tradeId, userId);

  //   if (trade.buyerId !== userId && trade.sellerId !== userId) {
  //     throw new ForbiddenException('You are not part of this trade');
  //   }

  //   const escrow = await this.escrowService.getEscrowByTradeId(tradeId);

  //   if (!escrow) {
  //     throw new NotFoundException('No escrow found for this trade');
  //   }

  //   return {
  //     success: true,
  //     escrow: {
  //       id: escrow.id,
  //       tradeId: escrow.tradeId,
  //       amount: escrow.amount,
  //       currency: escrow.currency,
  //       status: escrow.status,
  //       lockedAt: escrow.lockedAt,
  //       releasedAt: escrow.releasedAt,
  //       refundedAt: escrow.refundedAt,
  //       reason: escrow.reason,
  //       sellerId: escrow.sellerId,
  //       buyerId: escrow.buyerId,
  //     },
  //   };
  // }
}
